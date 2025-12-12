const express = require("express");
const path = require("path");
const multer = require("multer");
const { getDb } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

function getDataDir() {
  return process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
}

const upload = multer({
  dest: path.join(getDataDir(), "uploads"),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.get("/gcash", (req, res) => {
  const db = getDb();
  const number = db.prepare("SELECT value FROM settings WHERE key='gcash_number'").get()?.value || "";
  const qr = db.prepare("SELECT value FROM settings WHERE key='gcash_qr'").get()?.value || "";
  res.json({ number, qr });
});

router.post("/gcash", requireRole("admin"), upload.single("qr"), (req, res) => {
  const db = getDb();
  const number = String(req.body.number || "").trim();

  const upsert = db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

  if (number) upsert.run("gcash_number", number);

  if (req.file) {
    // Keep original extension if possible
    const ext = path.extname(req.file.originalname || "") || ".png";
    const newName = `gcash_qr${ext}`.toLowerCase();
    const finalPath = path.join(req.file.destination, newName);
    const fs = require("fs");
    fs.renameSync(req.file.path, finalPath);
    upsert.run("gcash_qr", `/uploads/${newName}`);
  }

  const outNumber = db.prepare("SELECT value FROM settings WHERE key='gcash_number'").get()?.value || "";
  const outQr = db.prepare("SELECT value FROM settings WHERE key='gcash_qr'").get()?.value || "";
  res.json({ ok: true, number: outNumber, qr: outQr });
});

module.exports = router;
