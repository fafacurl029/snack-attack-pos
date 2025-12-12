const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const { initDb, db } = require("./src/db");
const authRoutes = require("./src/routes/auth");
const adminRoutes = require("./src/routes/admin");
const productRoutes = require("./src/routes/products");
const orderRoutes = require("./src/routes/orders");
const reportRoutes = require("./src/routes/reports");
const settingsRoutes = require("./src/routes/settings");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

ensureDir(DATA_DIR);
ensureDir(path.join(DATA_DIR, "sessions"));
ensureDir(path.join(DATA_DIR, "uploads"));

initDb(DATA_DIR);

const app = express();
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false, // keep simple for static assets; harden later if needed
}));
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  name: "snackattack.sid",
  secret: process.env.SESSION_SECRET || "dev_only_change_me",
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: path.join(DATA_DIR, "sessions"),
    ttl: 60 * 60 * 8
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// Rate limit login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", loginLimiter);

// Static assets
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(DATA_DIR, "uploads")));

app.get("/health", (req, res) => res.json({ ok: true }));

// APIs
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);

// 404 for API
app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

// SPA-ish fallback (optional)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Snack Attack running on port ${PORT}`);
});
