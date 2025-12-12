const express = require("express");
const { getDb } = require("../db");
const { requireRole } = require("../middleware/auth");
const { createOrderSchema, statusSchema } = require("../validators");
const { makeOrderNo, money } = require("../utils");

const router = express.Router();

/**
 * Create order (customer or POS)
 * - Validates stock for track_stock products
 * - Deducts stock at order creation (reserve/consume) for simplicity
 * - If cancelled later, stock is returned
 */
router.post("/", (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const o = parsed.data;

  // POS orders require staff/admin
  if (o.source === "pos") {
    if (!req.session?.user) return res.status(401).json({ message: "Not authenticated" });
    if (!["staff","admin"].includes(req.session.user.role)) return res.status(403).json({ message: "Forbidden" });
  }

  const orderNo = makeOrderNo();

  // Fetch product snapshots
  const productById = new Map();
  const ids = o.items.map(i => i.productId);
  const rows = db.prepare(`SELECT p.*, COALESCE(i.quantity,0) AS quantity
                           FROM products p LEFT JOIN inventory i ON i.product_id=p.id
                           WHERE p.id IN (${ids.map(()=>"?").join(",")})`).all(...ids);
  rows.forEach(r => productById.set(r.id, r));

  // Validate products exist + active
  for (const item of o.items) {
    const p = productById.get(item.productId);
    if (!p) return res.status(400).json({ message: "Invalid product in cart" });
    if (p.active !== 1) return res.status(400).json({ message: `${p.name} is not available` });
    if (p.track_stock === 1 && p.quantity < item.qty) {
      return res.status(400).json({ message: `Out of stock: ${p.name} (available ${p.quantity})` });
    }
  }

  // Compute totals
  let subtotal = 0;
  for (const item of o.items) {
    const p = productById.get(item.productId);
    subtotal += Number(p.price) * item.qty;
  }
  subtotal = money(subtotal);

  // Cash change calculation if POS cash paid
  let cashReceived = null, changeDue = null, paymentStatus = o.paymentStatus;
  if (o.paymentMethod === "cash") {
    if (o.source === "pos") {
      cashReceived = money(o.cashReceived || 0);
      if (cashReceived < subtotal) return res.status(400).json({ message: "Cash received is less than total" });
      changeDue = money(cashReceived - subtotal);
      paymentStatus = "paid";
    } else {
      // customer: leave unpaid unless you want to treat as pay-on-pickup
      paymentStatus = o.paymentStatus || "unpaid";
    }
  } else {
    // gcash
    if (o.source === "pos") paymentStatus = "paid";
  }

  const userId = req.session?.user?.id || null;

  const tx = db.transaction(() => {
    // Insert order
    const insOrder = db.prepare(`
      INSERT INTO orders(order_no,source,customer_name,phone,address,order_type,payment_method,payment_status,gcash_ref,cash_received,change_due,status,subtotal,served_by_user_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const info = insOrder.run(
      orderNo,
      o.source,
      o.customerName || "",
      o.phone || "",
      o.address || "",
      o.orderType,
      o.paymentMethod,
      paymentStatus,
      o.gcashRef || "",
      cashReceived,
      changeDue,
      "pending",
      subtotal,
      userId
    );
    const orderId = info.lastInsertRowid;

    // Items
    const insItem = db.prepare(`
      INSERT INTO order_items(order_id,product_id,name_snapshot,price_snapshot,qty,notes)
      VALUES(?,?,?,?,?,?)
    `);

    for (const item of o.items) {
      const p = productById.get(item.productId);
      insItem.run(orderId, p.id, p.name, p.price, item.qty, item.notes || "");
      // Deduct stock if tracked
      if (p.track_stock === 1) {
        db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE product_id=?").run(item.qty, p.id);
        db.prepare("INSERT INTO inventory_logs(product_id,delta,reason,user_id) VALUES(?,?,?,?)")
          .run(p.id, -item.qty, `Order ${orderNo}`, userId);
      }
    }

    db.prepare("INSERT INTO order_events(order_id,status,user_id) VALUES(?,?,?)")
      .run(orderId, "pending", userId);

    return { orderId, orderNo, subtotal, cashReceived, changeDue };
  });

  try {
    const result = tx();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to create order" });
  }
});

// Public tracking
router.get("/track/:orderNo", (req, res) => {
  const db = getDb();
  const orderNo = req.params.orderNo;
  const order = db.prepare("SELECT * FROM orders WHERE order_no=?").get(orderNo);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const items = db.prepare("SELECT name_snapshot, price_snapshot, qty, notes FROM order_items WHERE order_id=?")
    .all(order.id);

  res.json({ order, items });
});

// Active orders for kitchen/staff (pending/preparing/ready)
router.get("/active", requireRole("admin","staff","kitchen"), (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status IN ('pending','preparing','ready')
    ORDER BY created_at ASC
  `).all();

  const byOrder = {};
  const items = db.prepare(`
    SELECT oi.order_id, oi.name_snapshot, oi.qty, oi.notes
    FROM order_items oi
    WHERE oi.order_id IN (${orders.map(()=>"?").join(",") || "NULL"})
    ORDER BY oi.id ASC
  `).all(...orders.map(o => o.id));

  for (const o of orders) byOrder[o.id] = { order: o, items: [] };
  for (const it of items) {
    if (byOrder[it.order_id]) byOrder[it.order_id].items.push(it);
  }
  res.json({ orders: Object.values(byOrder) });
});

// Update status (kitchen/staff/admin)
router.put("/:id/status", requireRole("admin","staff","kitchen"), (req, res) => {
  const id = Number(req.params.id);
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const next = parsed.data.status;
  const userId = req.session.user.id;

  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(next, id);
    db.prepare("INSERT INTO order_events(order_id,status,user_id) VALUES(?,?,?)").run(id, next, userId);

    // If cancelled: return stock
    if (next === "cancelled" && order.status !== "cancelled") {
      const items = db.prepare("SELECT product_id, qty FROM order_items WHERE order_id=?").all(id);
      for (const it of items) {
        const p = db.prepare("SELECT track_stock FROM products WHERE id=?").get(it.product_id);
        if (p && p.track_stock === 1) {
          db.prepare("UPDATE inventory SET quantity = quantity + ? WHERE product_id=?").run(it.qty, it.product_id);
          db.prepare("INSERT INTO inventory_logs(product_id,delta,reason,user_id) VALUES(?,?,?,?)")
            .run(it.product_id, it.qty, `Cancel ${order.order_no}`, userId);
        }
      }
    }
  });

  try {
    tx();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to update status" });
  }
});

// Receipt data for printing (staff/admin)
router.get("/:id/receipt", requireRole("admin","staff"), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
  if (!order) return res.status(404).json({ message: "Order not found" });
  const items = db.prepare("SELECT name_snapshot, price_snapshot, qty, notes FROM order_items WHERE order_id=?").all(id);
  res.json({ order, items });
});

module.exports = router;
