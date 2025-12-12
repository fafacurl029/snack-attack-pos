const express = require("express");
const { getDb } = require("../db");

const router = express.Router();

// Public product list for customer ordering (only active)
router.get("/", (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.*, COALESCE(i.quantity,0) AS quantity, COALESCE(i.low_stock_threshold,5) AS low_stock_threshold
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE p.active=1
    ORDER BY p.category, p.name
  `).all();

  const products = rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    price: r.price,
    cost: r.cost,
    sku: r.sku || "",
    imageUrl: r.image_url || "",
    trackStock: r.track_stock,
    quantity: r.quantity
  }));

  res.json({ products });
});

module.exports = router;
