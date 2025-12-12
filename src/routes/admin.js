const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb } = require("../db");
const { requireRole } = require("../middleware/auth");
const { upsertUserSchema, upsertProductSchema, inventoryAdjustSchema } = require("../validators");

const router = express.Router();

// ---- Users (Admin) ----
router.get("/users", requireRole("admin"), (req, res) => {
  const db = getDb();
  const users = db.prepare("SELECT id,username,role,active,created_at FROM users ORDER BY id DESC").all();
  res.json({ users });
});

router.post("/users", requireRole("admin"), (req, res) => {
  const parsed = upsertUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const { username, password, role, active } = parsed.data;

  if (!password) return res.status(400).json({ message: "Password required" });

  try {
    db.prepare("INSERT INTO users(username,password_hash,role,active) VALUES(?,?,?,?)")
      .run(username, bcrypt.hashSync(password, 10), role, active);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: "Username already exists" });
  }
});

router.put("/users/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const parsed = upsertUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const { username, password, role, active } = parsed.data;

  const existing = db.prepare("SELECT id FROM users WHERE id=?").get(id);
  if (!existing) return res.status(404).json({ message: "User not found" });

  if (password) {
    db.prepare("UPDATE users SET username=?, password_hash=?, role=?, active=? WHERE id=?")
      .run(username, bcrypt.hashSync(password, 10), role, active, id);
  } else {
    db.prepare("UPDATE users SET username=?, role=?, active=? WHERE id=?")
      .run(username, role, active, id);
  }
  res.json({ ok: true });
});

// ---- Products (Admin) ----
router.get("/products", requireRole("admin","staff"), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.*, COALESCE(i.quantity,0) AS quantity, COALESCE(i.low_stock_threshold,5) AS low_stock_threshold
    FROM products p
    LEFT JOIN inventory i ON i.product_id=p.id
    ORDER BY p.id DESC
  `).all();

  const products = rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    price: r.price,
    cost: r.cost,
    sku: r.sku || "",
    imageUrl: r.image_url || "",
    active: r.active,
    trackStock: r.track_stock,
    quantity: r.quantity,
    lowStockThreshold: r.low_stock_threshold
  }));

  res.json({ products });
});

router.post("/products", requireRole("admin"), (req, res) => {
  const parsed = upsertProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const p = parsed.data;

  const ins = db.prepare(`INSERT INTO products(name,category,price,cost,sku,image_url,active,track_stock)
    VALUES(?,?,?,?,?,?,?,?)`);
  const info = ins.run(p.name, p.category, p.price, p.cost, p.sku, p.imageUrl, p.active, p.trackStock);

  db.prepare("INSERT INTO inventory(product_id,quantity,low_stock_threshold) VALUES(?,?,?)")
    .run(info.lastInsertRowid, p.quantity, p.lowStockThreshold);

  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put("/products/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const parsed = upsertProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const p = parsed.data;
  const existing = db.prepare("SELECT id FROM products WHERE id=?").get(id);
  if (!existing) return res.status(404).json({ message: "Product not found" });

  db.prepare(`UPDATE products SET name=?,category=?,price=?,cost=?,sku=?,image_url=?,active=?,track_stock=? WHERE id=?`)
    .run(p.name, p.category, p.price, p.cost, p.sku, p.imageUrl, p.active, p.trackStock, id);

  // Inventory row must exist
  const inv = db.prepare("SELECT product_id FROM inventory WHERE product_id=?").get(id);
  if (!inv) {
    db.prepare("INSERT INTO inventory(product_id,quantity,low_stock_threshold) VALUES(?,?,?)")
      .run(id, p.quantity, p.lowStockThreshold);
  } else {
    db.prepare("UPDATE inventory SET quantity=?, low_stock_threshold=? WHERE product_id=?")
      .run(p.quantity, p.lowStockThreshold, id);
  }

  res.json({ ok: true });
});

// ---- Inventory adjust log ----
router.get("/inventory", requireRole("admin","staff"), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.id, p.name, p.category, p.track_stock,
           COALESCE(i.quantity,0) AS quantity,
           COALESCE(i.low_stock_threshold,5) AS low_stock_threshold
    FROM products p
    LEFT JOIN inventory i ON i.product_id=p.id
    ORDER BY p.category, p.name
  `).all();
  res.json({ inventory: rows });
});

router.post("/inventory/adjust", requireRole("admin","staff"), (req, res) => {
  const parsed = inventoryAdjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const db = getDb();
  const { productId, delta, reason } = parsed.data;
  const userId = req.session.user.id;

  const tx = db.transaction(() => {
    const inv = db.prepare("SELECT quantity FROM inventory WHERE product_id=?").get(productId);
    if (!inv) {
      db.prepare("INSERT INTO inventory(product_id,quantity,low_stock_threshold) VALUES(?,?,5)")
        .run(productId, 0);
    }
    const current = db.prepare("SELECT quantity FROM inventory WHERE product_id=?").get(productId).quantity;
    const next = current + delta;
    if (next < 0) throw new Error("Stock cannot go below zero");
    db.prepare("UPDATE inventory SET quantity=? WHERE product_id=?").run(next, productId);
    db.prepare("INSERT INTO inventory_logs(product_id,delta,reason,user_id) VALUES(?,?,?,?)")
      .run(productId, delta, reason || "", userId);
    return next;
  });

  try {
    const newQty = tx();
    res.json({ ok: true, quantity: newQty });
  } catch (e) {
    res.status(400).json({ message: e.message || "Inventory update failed" });
  }
});

module.exports = router;
