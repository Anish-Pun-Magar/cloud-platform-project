const crypto = require("crypto");
const workerService = require("../services/worker.service");

async function registerWorker(req, res) {
    try {
        // Validate enrollment token
        const suppliedToken = req.headers["x-enrollment-token"];
        const expectedToken = process.env.WORKER_ENROLLMENT_TOKEN;

        if (!suppliedToken || !expectedToken) {
            return res.status(401).json({
                success: false,
                message: "Invalid enrollment credentials"
            });
        }

        const suppliedBuffer = Buffer.from(suppliedToken);
        const expectedBuffer = Buffer.from(expectedToken);

        if (
            suppliedBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid enrollment credentials"
            });
        }

        // Validate required information
        const { name, platform, architecture, agent_version } = req.body;

        if (!name || !platform) {
            return res.status(400).json({
                success: false,
                message: "Worker name and platform are required"
            });
        }

        // Register worker
        const result = await workerService.registerWorker({
            name,
            platform,
            architecture,
            agent_version
        });

        return res.status(201).json({
            success: true,
            message: "Worker registered successfully",
            worker: result.worker,
            token: result.token
        });

    } catch (error) {
        console.error("Worker registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Worker registration failed"
        });
    }
}

async function heartbeat(req, res) {
    try {
        const result = await require("../config/database").query(
            `UPDATE workers
             SET status = 'online',
                 last_seen_at = NOW()
             WHERE id = $1
             AND enabled = TRUE
             RETURNING id, name, status, last_seen_at`,
            [req.worker.id]
        );

        return res.status(200).json({
            success: true,
            message: "Heartbeat received",
            worker: result.rows[0]
        });

    } catch (error) {
        console.error("Heartbeat error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Heartbeat failed"
        });
    }
}

async function listWorkers(req, res) {
  try {
    const workers = await workerService.getWorkers();
    res.json({ success: true, workers });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not retrieve workers" });
  }
}

async function getWorker(req, res) {
  try {
    const worker = await workerService.getWorker(req.params.id);

    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    res.json({ success: true, worker });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not retrieve worker" });
  }
}

async function updateWorker(req, res) {
  try {
    if (typeof req.body.enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "enabled must be true or false"
      });
    }

    const worker = await workerService.setWorkerEnabled(
      req.params.id,
      req.body.enabled
    );

    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    res.json({ success: true, worker });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update worker" });
  }
}

async function deleteWorker(req, res) {
  try {
    const worker = await workerService.deactivateWorker(req.params.id);

    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    res.json({ success: true, message: "Worker deactivated", worker });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not deactivate worker" });
  }
}

module.exports = {
  registerWorker,
  heartbeat,
  listWorkers,
  getWorker,
  updateWorker,
  deleteWorker
};
