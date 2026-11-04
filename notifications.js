const express = require("express");
const { run, get, all } = require("./database");

const router = express.Router();

const selectNotification = `
  SELECT n.id,
         LOWER(u.email) AS userEmail,
         n.type,
         n.message,
         n.is_read AS read,
         n.created_at AS createdAt
  FROM notifications AS n
  JOIN users AS u ON u.id = n.user_id
`;

// SQLite stores read status as 0 or 1. The API returns false or true.
function formatNotification(row) {
  return { ...row, read: Boolean(row.read) };
}

async function getNotification(id) {
  const row = await get(selectNotification + " WHERE n.id = ?", [id]);
  return row ? formatNotification(row) : null;
}

async function createNotification(userEmail, type, message) {
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
    `INSERT INTO notifications (user_id, type, message, is_read, created_at)
     VALUES (?, ?, ?, 0, ?)`,
    [user.id, type, message, new Date().toISOString()]
  );

  return getNotification(result.id);
}

function notifyQueueJoined(userEmail, serviceName, position, waitTime) {
  return createNotification(
    userEmail,
    "queue_joined",
    `You joined ${serviceName}. Position: ${position}. Estimated wait: ${waitTime} minutes.`
  );
}

function notifyAlmostReady(userEmail, serviceName, position, waitTime) {
  return createNotification(
    userEmail,
    "almost_ready",
    `${serviceName}: position ${position}, estimated wait ${waitTime} minutes. You are almost ready.`
  );
}

router.post("/notifications", async (req, res, next) => {
  const { userEmail, type, message } = req.body || {};

  if (!userEmail || !type || !message) {
    return res.status(400).json({
      success: false,
      message: "User email, type, and message are required.",
    });
  }

  if (
    typeof userEmail !== "string" ||
    typeof type !== "string" ||
    typeof message !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Notification fields must be text.",
    });
  }

  if (
    !userEmail.includes("@") ||
    userEmail.length > 254 ||
    !type.trim() ||
    type.length > 50 ||
    !message.trim() ||
    message.length > 250
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification data.",
    });
  }

  try {
    const notification = await createNotification(userEmail, type, message);
    return res.status(201).json({ success: true, notification });
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

router.get("/notifications/:userEmail", async (req, res, next) => {
  try {
    const email = req.params.userEmail.trim().toLowerCase();
    const rows = await all(
      selectNotification + " WHERE u.email = ? COLLATE NOCASE ORDER BY n.id",
      [email]
    );

    return res.json({
      success: true,
      notifications: rows.map(formatNotification),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await run(
      "UPDATE notifications SET is_read = 1 WHERE id = ?",
      [id]
    );

    if (!result.changes) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    const notification = await getNotification(id);
    return res.json({ success: true, notification });
  } catch (error) {
    return next(error);
  }
});

router.patch("/notifications/user/:userEmail/read-all", async (req, res, next) => {
  try {
    const email = req.params.userEmail.trim().toLowerCase();

    await run(
      `UPDATE notifications
       SET is_read = 1
       WHERE user_id = (SELECT id FROM users WHERE email = ? COLLATE NOCASE)
         AND is_read = 0`,
      [email]
    );

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.notifyQueueJoined = notifyQueueJoined;
module.exports.notifyAlmostReady = notifyAlmostReady;
