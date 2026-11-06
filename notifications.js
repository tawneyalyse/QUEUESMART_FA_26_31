const express = require("express");
const { db } = require("./database");

const router = express.Router();

async function createNotification(userEmail, type, message) {
  const email = userEmail.toLowerCase().trim();

  const [users] = await db.execute(
    "SELECT user_id FROM UserCredentials WHERE email = ?",
    [email]
  );

  if (!users.length) {
    throw new Error("User not found.");
  }

  const [result] = await db.execute(
    `INSERT INTO Notification
     (user_id, notification_type, message, status)
     VALUES (?, ?, ?, 'sent')`,
    [users[0].user_id, type, message]
  );

  return {
    id: result.insertId,
    userEmail: email,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
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

router.post("/notifications", async (req, res) => {
  const { userEmail, type, message } = req.body || {};

  if (
    typeof userEmail !== "string" ||
    typeof type !== "string" ||
    typeof message !== "string" ||
    !userEmail.trim() ||
    !type.trim() ||
    !message.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "User email, type, and message are required."
    });
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail.trim()) ||
    userEmail.length > 254 ||
    type.length > 50 ||
    message.length > 250
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification data."
    });
  }

  try {
    const notification = await createNotification(
      userEmail,
      type,
      message
    );

    return res.status(201).json({
      success: true,
      notification
    });
  } catch (error) {
    return res.status(error.message === "User not found." ? 404 : 500).json({
      success: false,
      message: error.message === "User not found."
        ? "User not found."
        : "Could not create notification."
    });
  }
});

router.get("/notifications/:userEmail", async (req, res) => {
  try {
    const email = req.params.userEmail.toLowerCase().trim();

    const [notifications] = await db.execute(
      `SELECT
         n.notification_id AS id,
         u.email AS userEmail,
         n.notification_type AS type,
         n.message,
         CASE WHEN n.status = 'viewed' THEN TRUE ELSE FALSE END AS \`read\`,
         n.created_at AS createdAt
       FROM Notification n
       JOIN UserCredentials u ON n.user_id = u.user_id
       WHERE u.email = ?
       ORDER BY n.created_at DESC`,
      [email]
    );

    return res.json({
      success: true,
      notifications
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not retrieve notifications."
    });
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID."
      });
    }

    const [result] = await db.execute(
      "UPDATE Notification SET status = 'viewed' WHERE notification_id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Notification not found."
      });
    }

    return res.json({
      success: true,
      message: "Notification marked as read."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not update notification."
    });
  }
});

router.patch("/notifications/user/:userEmail/read-all", async (req, res) => {
  try {
    const email = req.params.userEmail.toLowerCase().trim();

    await db.execute(
      `UPDATE Notification n
       JOIN UserCredentials u ON n.user_id = u.user_id
       SET n.status = 'viewed'
       WHERE u.email = ?`,
      [email]
    );

    return res.json({
      success: true
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not update notifications."
    });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyQueueJoined = notifyQueueJoined;
module.exports.notifyAlmostReady = notifyAlmostReady;
