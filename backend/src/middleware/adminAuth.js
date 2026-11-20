const crypto = require("crypto");

function adminAuth(req, res, next) {
  const supplied = req.headers["x-admin-token"];
  const expected = process.env.ADMIN_API_TOKEN;

  if (!supplied || !expected) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication required"
    });
  }

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin token"
    });
  }

  next();
}

module.exports = adminAuth;