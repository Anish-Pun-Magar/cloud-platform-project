const crypto = require("crypto");
const pool = require("../config/database");

async function authenticateWorker(req, res, next) {
    try {
        const workerId = req.params.id;
        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!workerId || !token) {
            return res.status(401).json({
                success: false,
                message: "Worker authentication required"
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const result = await pool.query(
            `SELECT w.id, w.enabled
             FROM workers w
             JOIN worker_credentials c
             ON w.id = c.worker_id
             WHERE w.id = $1
             AND c.token_hash = $2
             AND c.revoked_at IS NULL`,
            [workerId, tokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid worker credentials"
            });
        }

        if (!result.rows[0].enabled) {
            return res.status(403).json({
                success: false,
                message: "Worker is disabled"
            });
        }

        req.worker = result.rows[0];

        next();

    } catch (error) {
        console.error("Authentication error:", error.message);

        res.status(500).json({
            success: false,
            message: "Authentication failed"
        });
    }
}

module.exports = authenticateWorker;