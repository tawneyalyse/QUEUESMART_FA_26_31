const express = require("express");
const { run, get, all } = require("./database");

const router = express.Router();

async function getUserByEmail(userEmail) {
  return get(
    `
      SELECT id, email
      FROM users
      WHERE LOWER(email) = LOWER(?)
    `,
    [userEmail.trim()]
  );
}

function formatHistory(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userEmail: row.userEmail,
    serviceName: row.serviceName,
    joinedAt: row.joinedAt,
    completedAt: row.completedAt,
    outcome: row.outcome,
  };
}

async function createHistory(userEmail, serviceName) {
  const email = userEmail.toLowerCase().trim();
  const service = serviceName.trim();

  const user = await getUserByEmail(email);

  if (!user) {
    throw new Error("User not found.");
  }

  const joinedAt = new Date().toISOString();

  const result = await run(
    `
      INSERT INTO history (
        user_id,
        service_name,
        joined_at,
        completed_at,
        outcome
      )
      VALUES (?, ?, ?, NULL, 'active')
    `,
    [user.id, service, joinedAt]
  );

  return {
    id: result.id,
    userEmail: user.email,
    serviceName: service,
    joinedAt,
    completedAt: null,
    outcome: "active",
  };
}

async function completeHistory(
  userEmail,
  serviceName,
  outcome
) {
  const email = userEmail.toLowerCase().trim();
  const service = serviceName.trim();

  const record = await get(
    `
      SELECT
        history.id,
        users.email AS userEmail,
        history.service_name AS serviceName,
        history.joined_at AS joinedAt,
        history.completed_at AS completedAt,
        history.outcome
      FROM history
      JOIN users
        ON users.id = history.user_id
      WHERE LOWER(users.email) = LOWER(?)
        AND history.service_name = ?
        AND history.outcome = 'active'
      ORDER BY history.id DESC
      LIMIT 1
    `,
    [email, service]
  );

  if (!record) {
    return null;
  }

  const completedAt = new Date().toISOString();

  await run(
    `
      UPDATE history
      SET outcome = ?,
          completed_at = ?
      WHERE id = ?
    `,
    [outcome, completedAt, record.id]
  );

  record.outcome = outcome;
  record.completedAt = completedAt;

  return formatHistory(record);
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

    const record = await createHistory(
      userEmail,
      serviceName
    );

    return res.status(201).json({
      success: true,
      record,
    });
  } catch (error) {
    if (error.message === "User not found.") {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Could not create history record.",
    });
  }
});

router.get("/history/:userEmail", async (req, res) => {
  try {
    const userEmail = req.params.userEmail.toLowerCase().trim();

    const rows = await all(
      `
        SELECT
          history.id,
          users.email AS userEmail,
          history.service_name AS serviceName,
          history.joined_at AS joinedAt,
          history.completed_at AS completedAt,
          history.outcome
        FROM history
        JOIN users
          ON users.id = history.user_id
        WHERE LOWER(users.email) = LOWER(?)
        ORDER BY history.id ASC
      `,
      [userEmail]
    );

    return res.json({
      success: true,
      history: rows.map(formatHistory),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not retrieve history.",
    });
  }
});

router.patch("/history/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { outcome } = req.body;

    if (outcome !== "served" && outcome !== "left") {
      return res.status(400).json({
        success: false,
        message: "Outcome must be served or left.",
      });
    }

    const record = await get(
      `
        SELECT id
        FROM history
        WHERE id = ?
      `,
      [id]
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "History record not found.",
      });
    }

    const completedAt = new Date().toISOString();

    await run(
      `
        UPDATE history
        SET outcome = ?,
            completed_at = ?
        WHERE id = ?
      `,
      [outcome, completedAt, id]
    );

    const updated = await get(
      `
        SELECT
          history.id,
          users.email AS userEmail,
          history.service_name AS serviceName,
          history.joined_at AS joinedAt,
          history.completed_at AS completedAt,
          history.outcome
        FROM history
        JOIN users
          ON users.id = history.user_id
        WHERE history.id = ?
      `,
      [id]
    );

    return res.json({
      success: true,
      record: formatHistory(updated),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not update history record.",
    });
  }
});

module.exports = router;
module.exports.createHistory = createHistory;
module.exports.completeHistory = completeHistory;
