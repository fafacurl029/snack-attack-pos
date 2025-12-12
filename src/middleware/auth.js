function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (req.session.user.active !== 1) {
    return res.status(403).json({ message: "Account disabled" });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

module.exports = { requireAuth, requireRole };
