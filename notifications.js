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

function formatNotification(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userEmail: row.userEmail,
    type: row.type,
    message: row.message,
    read: Boolean(row.read),
    createdAt: row.createdAt,
  };
}

async function createNotification(userEmail, type, message) {
  const email = userEmail.toLowerCase().trim();
  const user = await getUserByEmail(email);

  if (!user) {
    throw new Error("User not found.");
  }

  const createdAt = new Date().toISOString();

  const result = await run(
    `
      INSERT INTO notifications (
        user_id,
        type,
        message,
        is_read,
        created_at
      )
      VALUES (?, ?, ?, 0, ?)
    `,
    [user.id, type, message, createdAt]
  );

  return {
    id: result.id,
    userEmail: user.email,
    type,
    message,
    read: false,
    createdAt,
  };
}

async function notifyQueueJoined(
  userEmail,
  serviceName,
  position,
  waitTime
) {
  return createNotification(
    userEmail,
    "queue_joined",
    `You joined ${serviceName}. Position: ${position}. Estimated wait: ${waitTime} minutes.`
  );
}

async function notifyAlmostReady(
  userEmail,
  serviceName,
  position,
  waitTime
) {
  return createNotification(
    userEmail,
    "almost_ready",
    `${serviceName}: position ${position}, estimated wait ${waitTime} minutes. You are almost ready.`
  );
}

router.post("/notifications", async (req, res) => {
  try {
    const { userEmail, type, message } = req.body;

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
      type.length > 50 ||
      message.length > 250
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification data.",
      });
    }

    const notification = await createNotification(
      userEmail,
      type,
      message
    );

    return res.status(201).json({
      success: true,
      notification,
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
      message: "Could not create notification.",
    });
  }
});

router.get("/notifications/:userEmail", async (req, res) => {
  try {
    const userEmail = req.params.userEmail.toLowerCase().trim();

    const rows = await all(
      `
        SELECT
          notifications.id,
          users.email AS userEmail,
          notifications.type,
          notifications.message,
          notifications.is_read AS read,
          notifications.created_at AS createdAt
        FROM notifications
        JOIN users
          ON users.id = notifications.user_id
        WHERE LOWER(users.email) = LOWER(?)
        ORDER BY notifications.id ASC
      `,
      [userEmail]
    );

    const notifications = rows.map(formatNotification);

    return res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not retrieve notifications.",
    });
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const existing = await get(
      `
        SELECT id
        FROM notifications
        WHERE id = ?
      `,
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    await run(
      `
        UPDATE notifications
        SET is_read = 1
        WHERE id = ?
      `,
      [id]
    );

    const row = await get(
      `
        SELECT
          notifications.id,
          users.email AS userEmail,
          notifications.type,
          notifications.message,
          notifications.is_read AS read,
          notifications.created_at AS createdAt
        FROM notifications
        JOIN users
          ON users.id = notifications.user_id
        WHERE notifications.id = ?
      `,
      [id]
    );

    return res.json({
      success: true,
      notification: formatNotification(row),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not update notification.",
    });
  }
});

router.patch(
  "/notifications/user/:userEmail/read-all",
  async (req, res) => {
    try {
      const userEmail = req.params.userEmail.toLowerCase().trim();

      const user = await getUserByEmail(userEmail);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      await run(
        `
          UPDATE notifications
          SET is_read = 1
          WHERE user_id = ?
        `,
        [user.id]
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Could not update notifications.",
      });
    }
  }
);

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyQueueJoined = notifyQueueJoined;
module.exports.notifyAlmostReady = notifyAlmostReady;
