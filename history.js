const express = require("express");
const { run, get, all } = require("./database");

const router = express.Router();

const selectRecord = `
  SELECT h.id,
         LOWER(u.email) AS userEmail,
         h.service_name AS serviceName,
         h.joined_at AS joinedAt,
         h.completed_at AS completedAt,
         h.outcome
  FROM history AS h
  JOIN users AS u ON u.id = h.user_id
`;

function getRecord(id) {
  return get(selectRecord + " WHERE h.id = ?", [id]);
}

async function createHistory(userEmail, serviceName) {
  const email = userEmail.trim().toLowerCase();
  const user = await get(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
    [email]
  );

  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const result = await run(
    `INSERT INTO history (user_id, service_name, joined_at, completed_at, outcome)
     VALUES (?, ?, ?, NULL, 'active')`,
    [user.id, serviceName.trim(), new Date().toISOString()]
  );

  return getRecord(result.id);
}

async function completeHistory(userEmail, serviceName, outcome) {
  if (outcome !== "served" && outcome !== "left") {
    throw new Error("Outcome must be served or left.");
  }

  const updated = await get(
    `UPDATE history
     SET outcome = ?, completed_at = ?
     WHERE id = (
       SELECT h.id
       FROM history AS h
       JOIN users AS u ON u.id = h.user_id
       WHERE u.email = ? COLLATE NOCASE
         AND h.service_name = ?
         AND h.outcome = 'active'
       ORDER BY h.id DESC
       LIMIT 1
     )
     RETURNING id`,
    [
      outcome,
      new Date().toISOString(),
      userEmail.trim().toLowerCase(),
      serviceName.trim(),
    ]
  );

  return updated ? getRecord(updated.id) : null;
}

router.post("/history", async (req, res, next) => {
  const { userEmail, serviceName } = req.body || {};

  if (!userEmail || !serviceName) {
    return res.status(400).json({
      success: false,
      message: "User email and service name are required.",
    });
  }

  if (typeof userEmail !== "string" || typeof serviceName !== "string") {
    return res.status(400).json({
      success: false,
      message: "History fields must be text.",
    });
  }

  if (
    !userEmail.includes("@") ||
    userEmail.length > 254 ||
    !serviceName.trim() ||
    serviceName.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid history data.",
    });
  }

  try {
    const record = await createHistory(userEmail, serviceName);
    return res.status(201).json({ success: true, record });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
});

router.get("/history/:userEmail", async (req, res, next) => {
  try {
    const email = req.params.userEmail.trim().toLowerCase();
    const history = await all(
      selectRecord + " WHERE u.email = ? COLLATE NOCASE ORDER BY h.id",
      [email]
    );

    return res.json({ success: true, history });
  } catch (error) {
    return next(error);
  }
});

router.patch("/history/:id", async (req, res, next) => {
  const { outcome } = req.body || {};

  if (outcome !== "served" && outcome !== "left") {
    return res.status(400).json({
      success: false,
      message: "Outcome must be served or left.",
    });
  }

  try {
    const id = Number(req.params.id);
    const result = await run(
      "UPDATE history SET outcome = ?, completed_at = ? WHERE id = ?",
      [outcome, new Date().toISOString(), id]
    );

    if (!result.changes) {
      return res.status(404).json({
        success: false,
        message: "History record not found.",
      });
    }

    const record = await getRecord(id);
    return res.json({ success: true, record });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.createHistory = createHistory;
module.exports.completeHistory = completeHistory;
