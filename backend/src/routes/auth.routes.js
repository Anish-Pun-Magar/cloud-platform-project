const express = require("express");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.post("/verify", adminAuth, (_req, res) => {
  res.json({ success: true, message: "Admin token verified" });
});

module.exports = router;
