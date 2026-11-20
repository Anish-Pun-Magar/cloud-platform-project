const pool = require("../config/database");

async function markOfflineWorkers() {
  try {
    const result = await pool.query(`
      UPDATE workers
      SET status = 'offline'
      WHERE enabled = TRUE
        AND status = 'online'
        AND last_seen_at < NOW() -
          ($1 * INTERVAL '1 second')
    `, [Number(process.env.WORKER_OFFLINE_AFTER_SECONDS || 75)]);

    if (result.rowCount > 0) {
      console.log(`${result.rowCount} worker(s) marked offline.`);
    }
  } catch (error) {
    console.error("Worker monitoring error:", error.message);
  }
}

module.exports = markOfflineWorkers;