const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

let db;

function initDb(dataDir) {
  const dbPath = path.join(dataDir, "snackattack.sqlite");
  const firstTime = !fs.existsSync(dbPath);

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','staff','kitchen')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      sku TEXT,
      image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      track_stock INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      product_id INTEGER PRIMARY KEY,
      quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('customer','pos')),
      customer_name TEXT,
      phone TEXT,
      address TEXT,
      order_type TEXT NOT NULL CHECK(order_type IN ('dine-in','takeout')),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','gcash')),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('unpaid','paid')) DEFAULT 'unpaid',
      gcash_ref TEXT,
      cash_received REAL,
      change_due REAL,
      status TEXT NOT NULL CHECK(status IN ('pending','preparing','ready','completed','cancelled')) DEFAULT 'pending',
      subtotal REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      served_by_user_id INTEGER,
      FOREIGN KEY(served_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      name_snapshot TEXT NOT NULL,
      price_snapshot REAL NOT NULL,
      qty INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

// Lightweight migrations for existing databases
try {
  const cols = db.prepare("PRAGMA table_info(orders)").all().map(r => r.name);
  if (!cols.includes("address")) {
    db.exec("ALTER TABLE orders ADD COLUMN address TEXT");
  }
} catch (e) {
  // ignore migration errors; app will still function on fresh DB
}


  // Ensure default settings
  const upsertSetting = db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
  const getSetting = db.prepare("SELECT value FROM settings WHERE key=?");

  if (!getSetting.get("gcash_number")) upsertSetting.run("gcash_number", "09XXXXXXXXX");
  if (!getSetting.get("gcash_qr")) upsertSetting.run("gcash_qr", "");

  seedIfEmpty();
  return dbPath;
}

function seedIfEmpty() {
  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount === 0) {
    const ins = db.prepare("INSERT INTO users(username,password_hash,role,active) VALUES(?,?,?,1)");
    ins.run("admin", bcrypt.hashSync("Admin@12345", 10), "admin");
    ins.run("staff", bcrypt.hashSync("Staff@12345", 10), "staff");
    ins.run("kitchen", bcrypt.hashSync("Kitchen@12345", 10), "kitchen");
  }

  const prodCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (prodCount === 0) {
    const insP = db.prepare(`INSERT INTO products(name,category,price,cost,sku,image_url,active,track_stock)
      VALUES(?,?,?,?,?,?,1,1)`);
    const insI = db.prepare(`INSERT INTO inventory(product_id,quantity,low_stock_threshold) VALUES(?,?,?)`);

    const add = (name, category, price, cost=0, qty=30, low=5, sku=null) => {
      const info = insP.run(name, category, price, cost, sku, "");
      insI.run(info.lastInsertRowid, qty, low);
    };

    // Food
    add("Hotdog Sandwich", "Food", 29, 15, 50);
    add("Hotdog Overload Cheese", "Food", 39, 20, 50);
    add("Cheesy Egg Sandwich", "Food", 30, 15, 50);
    add("Double Cheese Burger", "Food", 30, 18, 50);
    add("Beef Burger", "Food", 25, 15, 50);
    add("Cheesy Egg Burger", "Food", 45, 25, 50);
    add("Tofu Square", "Extras", 60, 30, 40);
    add("Fries (Regular)", "Extras", 50, 25, 60);
    add("Cheese Sticks (5pcs)", "Extras", 30, 15, 60);

    // Drinks - sizes as separate products (simple + reliable)
    const drink = (base, prices) => {
      const sizes = ["8oz","12oz","16oz","22oz"];
      sizes.forEach((s, i) => add(`${base} (${s})`, "Drinks", prices[i], prices[i]*0.55, 80));
    };
    drink("Chuckie Float", [35,45,55,65]);
    drink("Coke Float", [25,35,45,65]);
    drink("Fruity Soda", [20,30,40,50]);
    drink("Dutchmill Float", [35,45,55,65]);
  }
}

function getDb() {
  if (!db) throw new Error("DB not initialized");
  return db;
}

module.exports = { initDb, getDb, db: () => getDb() };
