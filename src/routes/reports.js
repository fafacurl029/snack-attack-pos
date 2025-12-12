const express = require("express");
const ExcelJS = require("exceljs");
const { getDb } = require("../db");
const { requireRole } = require("../middleware/auth");
const { money } = require("../utils");

const router = express.Router();

function parseDateRange(req) {
  const from = req.query.from ? String(req.query.from) : "";
  const to = req.query.to ? String(req.query.to) : "";
  // Expect YYYY-MM-DD
  const fromSql = from ? `${from} 00:00:00` : "1970-01-01 00:00:00";
  const toSql = to ? `${to} 23:59:59` : "2999-12-31 23:59:59";
  return { from, to, fromSql, toSql };
}

router.get("/summary", requireRole("admin"), (req, res) => {
  const db = getDb();
  const { fromSql, toSql } = parseDateRange(req);

  // Completed orders only for sales/profit
  const totals = db.prepare(`
    SELECT COUNT(*) AS orders,
           COALESCE(SUM(subtotal),0) AS sales
    FROM orders
    WHERE status='completed' AND created_at BETWEEN ? AND ?
  `).get(fromSql, toSql);

  const byPayment = db.prepare(`
    SELECT payment_method, COUNT(*) AS orders, COALESCE(SUM(subtotal),0) AS sales
    FROM orders
    WHERE status='completed' AND created_at BETWEEN ? AND ?
    GROUP BY payment_method
  `).all(fromSql, toSql);

  const topItems = db.prepare(`
    SELECT name_snapshot AS name, SUM(qty) AS qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status='completed' AND o.created_at BETWEEN ? AND ?
    GROUP BY name_snapshot
    ORDER BY qty DESC
    LIMIT 10
  `).all(fromSql, toSql);

  // Profit: (price - cost) * qty using product cost by product_id
  const profitRow = db.prepare(`
    SELECT COALESCE(SUM((oi.price_snapshot - COALESCE(p.cost,0)) * oi.qty),0) AS profit
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.status='completed' AND o.created_at BETWEEN ? AND ?
  `).get(fromSql, toSql);

  res.json({
    totals: { orders: totals.orders, sales: money(totals.sales), profit: money(profitRow.profit) },
    byPayment: byPayment.map(r => ({ paymentMethod: r.payment_method, orders: r.orders, sales: money(r.sales) })),
    topItems
  });
});

router.get("/export.csv", requireRole("admin"), (req, res) => {
  const db = getDb();
  const { fromSql, toSql } = parseDateRange(req);

  const rows = db.prepare(`
    SELECT o.order_no, o.created_at, o.order_type, o.payment_method, o.subtotal, o.status, o.source,
           GROUP_CONCAT(oi.name_snapshot || ' x' || oi.qty, '; ') AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE o.created_at BETWEEN ? AND ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all(fromSql, toSql);

  const header = ["order_no","created_at","order_type","payment_method","subtotal","status","source","items"];
  const lines = [header.join(",")];

  for (const r of rows) {
    const vals = header.map(k => {
      const v = r[k] == null ? "" : String(r[k]);
      const safe = v.replace(/"/g,'""');
      return `"${safe}"`;
    });
    lines.push(vals.join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=sales_export.csv");
  res.send(lines.join("\n"));
});

router.get("/export.xlsx", requireRole("admin"), async (req, res) => {
  const db = getDb();
  const { fromSql, toSql } = parseDateRange(req);

  const rows = db.prepare(`
    SELECT o.order_no, o.created_at, o.order_type, o.payment_method, o.subtotal, o.status, o.source,
           GROUP_CONCAT(oi.name_snapshot || ' x' || oi.qty, '; ') AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE o.created_at BETWEEN ? AND ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all(fromSql, toSql);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orders");

  ws.columns = [
    { header: "Order No", key: "order_no", width: 22 },
    { header: "Created At", key: "created_at", width: 20 },
    { header: "Order Type", key: "order_type", width: 12 },
    { header: "Payment", key: "payment_method", width: 10 },
    { header: "Subtotal", key: "subtotal", width: 10 },
    { header: "Status", key: "status", width: 12 },
    { header: "Source", key: "source", width: 10 },
    { header: "Items", key: "items", width: 60 }
  ];

  rows.forEach(r => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = "A1:H1";

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=sales_export.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
