const express = require("express");
const router = express.Router();

const workerController = require("../controllers/worker.controller");
const authenticateWorker = require("../middleware/workerAuth");
const adminAuth = require("../middleware/adminAuth");

// Worker endpoints
router.post("/register", workerController.registerWorker);
router.post("/:id/heartbeat", authenticateWorker, workerController.heartbeat);

// Admin endpoints
router.get("/", adminAuth, workerController.listWorkers);
router.get("/:id", adminAuth, workerController.getWorker);
router.patch("/:id", adminAuth, workerController.updateWorker);
router.delete("/:id", adminAuth, workerController.deleteWorker);

module.exports = router;