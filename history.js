const express = require("express");
const { db } = require("./database");

const router = express.Router();

async function createHistory(userEmail, serviceName) {
  const [users] = await db.execute(
    "SELECT user_id FROM UserCredentials WHERE email = ?",
    [userEmail.toLowerCase().trim()]
  );

  if (users.length === 0) {
    throw new Error("User not found.");
  }

  const [services] = await db.execute(
    "SELECT service_id FROM Service WHERE service_name = ?",
    [serviceName.trim()]
  );

  if (services.length === 0) {
    throw new Error("Service not found.");
  }

  const [result] = await db.execute(
    `INSERT INTO History (user_id, service_id, outcome)
     VALUES (?, ?, 'active')`,
    [users[0].user_id, services[0].service_id]
  );

  const [records] = await db.execute(
    `SELECT
       h.history_id AS id,
       u.email AS userEmail,
       s.service_name AS serviceName,
       h.joined_at AS joinedAt,
       h.completed_at AS completedAt,
       h.outcome
     FROM History h
     JOIN UserCredentials u ON h.user_id = u.user_id
     JOIN Service s ON h.service_id = s.service_id
     WHERE h.history_id = ?`,
    [result.insertId]
  );

  return records[0];
}

async function completeHistory(userEmail, serviceName, outcome) {
  const [records] = await db.execute(
    `SELECT h.history_id
     FROM History h
     JOIN UserCredentials u ON h.user_id = u.user_id
     JOIN Service s ON h.service_id = s.service_id
     WHERE u.email = ?
       AND s.service_name = ?
       AND h.outcome = 'active'
     ORDER BY h.history_id DESC
     LIMIT 1`,
    [userEmail.toLowerCase().trim(), serviceName.trim()]
  );

  if (records.length === 0) {
    return null;
  }

  await db.execute(
    `UPDATE History
     SET outcome = ?, completed_at = CURRENT_TIMESTAMP
     WHERE history_id = ?`,
    [outcome, records[0].history_id]
  );

  const [updated] = await db.execute(
    `SELECT
       h.history_id AS id,
       u.email AS userEmail,
       s.service_name AS serviceName,
       h.joined_at AS joinedAt,
       h.completed_at AS completedAt,
       h.outcome
     FROM History h
     JOIN UserCredentials u ON h.user_id = u.user_id
     JOIN Service s ON h.service_id = s.service_id
     WHERE h.history_id = ?`,
    [records[0].history_id]
  );

  return updated[0];
}

router.post("/history", async (req, res) => {
  try {
    const { userEmail, serviceName } = req.body;

    if (!userEmail || !serviceName) {
      return res.status(400).json({
        success: false,
        message: "User email and service name are required.",
      });
    }

    if (
      typeof userEmail !== "string" ||
      typeof serviceName !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "History fields must be text.",
      });
    }

    if (
      !userEmail.includes("@") ||
      userEmail.length > 254 ||
      serviceName.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid history data.",
      });
    }

    const record = await createHistory(userEmail, serviceName);

    res.status(201).json({
      success: true,
      record,
    });
  } catch (error) {
    console.error("Create history error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Unable to create history record.",
    });
  }
});

router.get("/history/:userEmail", async (req, res) => {
  try {
    const userEmail = req.params.userEmail.toLowerCase().trim();

    const [userHistory] = await db.execute(
      `SELECT
         h.history_id AS id,
         u.email AS userEmail,
         s.service_name AS serviceName,
         h.joined_at AS joinedAt,
         h.completed_at AS completedAt,
         h.outcome
       FROM History h
       JOIN UserCredentials u ON h.user_id = u.user_id
       JOIN Service s ON h.service_id = s.service_id
       WHERE u.email = ?
       ORDER BY h.joined_at DESC`,
      [userEmail]
    );

    res.json({
      success: true,
      history: userHistory,
    });
  } catch (error) {
    console.error("Get history error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve history.",
    });
  }
});

router.patch("/history/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { outcome } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid history ID.",
      });
    }

    if (outcome !== "served" && outcome !== "left") {
      return res.status(400).json({
        success: false,
        message: "Outcome must be served or left.",
      });
    }

    const [result] = await db.execute(
      `UPDATE History
       SET outcome = ?, completed_at = CURRENT_TIMESTAMP
       WHERE history_id = ?`,
      [outcome, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "History record not found.",
      });
    }

    const [records] = await db.execute(
      `SELECT
         h.history_id AS id,
         u.email AS userEmail,
         s.service_name AS serviceName,
         h.joined_at AS joinedAt,
         h.completed_at AS completedAt,
         h.outcome
       FROM History h
       JOIN UserCredentials u ON h.user_id = u.user_id
       JOIN Service s ON h.service_id = s.service_id
       WHERE h.history_id = ?`,
      [id]
    );

    res.json({
      success: true,
      record: records[0],
    });
  } catch (error) {
    console.error("Update history error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update history record.",
    });
  }
});

module.exports = router;
module.exports.createHistory = createHistory;
module.exports.completeHistory = completeHistory;
