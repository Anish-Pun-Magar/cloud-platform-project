const crypto = require("crypto");
const pool = require("../config/database");

async function registerWorker(workerData) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Generate unique worker identity and secret token
        const workerId = crypto.randomUUID();
        const token = crypto.randomBytes(32).toString("hex");

        // Store only the token hash
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Insert worker information
        const workerResult = await client.query(
            `INSERT INTO workers
             (id, name, platform, architecture, agent_version,
              status, enabled, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, 'online', TRUE, NOW())
             RETURNING id, name, platform, architecture,
                       status, enabled, registered_at`,
            [
                workerId,
                workerData.name,
                workerData.platform,
                workerData.architecture || null,
                workerData.agent_version || null
            ]
        );

        // Insert authentication credential
        await client.query(
            `INSERT INTO worker_credentials
             (worker_id, token_hash)
             VALUES ($1, $2)`,
            [workerId, tokenHash]
        );

        await client.query("COMMIT");

        return {
            worker: workerResult.rows[0],
            token
        };

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}

async function getWorkers() {
  const result = await pool.query(`
    SELECT id, name, platform, architecture, status,
           capabilities, agent_version, enabled,
           registered_at, last_seen_at
    FROM workers
    WHERE deleted_at IS NULL
    ORDER BY registered_at DESC
  `);

  return result.rows;
}

async function getWorker(id) {
  const result = await pool.query(`
    SELECT id, name, platform, architecture, status,
           capabilities, agent_version, enabled,
           registered_at, last_seen_at
    FROM workers
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);

  return result.rows[0];
}

async function setWorkerEnabled(id, enabled) {
  const result = await pool.query(`
    UPDATE workers
    SET enabled = $2, status = 'offline'
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, name, status, enabled
  `, [id, enabled]);

  return result.rows[0];
}

async function deactivateWorker(id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(`
      UPDATE workers
      SET enabled = FALSE,
          status = 'offline',
          deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name
    `, [id]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(`
      UPDATE worker_credentials
      SET revoked_at = NOW()
      WHERE worker_id = $1 AND revoked_at IS NULL
    `, [id]);

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  registerWorker,
  getWorkers,
  getWorker,
  setWorkerEnabled,
  deactivateWorker
};
