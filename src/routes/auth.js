const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb } = require("../db");
const { loginSchema } = require("../validators");

const router = express.Router();

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const { username, password } = parsed.data;
  const db = getDb();
  const user = db.prepare("SELECT id,username,password_hash,role,active FROM users WHERE username=?").get(username);

  if (!user || user.active !== 1) return res.status(401).json({ message: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  req.session.user = { id: user.id, username: user.username, role: user.role, active: user.active };
  res.json({ ok: true, user: req.session.user });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("snackattack.sid");
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
