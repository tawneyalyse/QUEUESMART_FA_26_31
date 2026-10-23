const express = require("express");

const router = express.Router();
const notifications = [];
let nextId = 1;

function createNotification(userEmail, type, message) {
  const notification = {
    id: nextId++,
    userEmail: userEmail.toLowerCase().trim(),
    type,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  };

  notifications.push(notification);
  return notification;
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

router.post("/notifications", (req, res) => {
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

  const notification = createNotification(userEmail, type, message);

  res.status(201).json({
    success: true,
    notification,
  });
});

router.get("/notifications/:userEmail", (req, res) => {
  const userEmail = req.params.userEmail.toLowerCase().trim();

  const userNotifications = notifications.filter(
    (notification) => notification.userEmail === userEmail
  );

  res.json({
    success: true,
    notifications: userNotifications,
  });
});

router.patch("/notifications/:id/read", (req, res) => {
  const id = Number(req.params.id);
  const notification = notifications.find((item) => item.id === id);

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found.",
    });
  }

  notification.read = true;

  res.json({
    success: true,
    notification,
  });
});

router.patch("/notifications/user/:userEmail/read-all", (req, res) => {
  const userEmail = req.params.userEmail.toLowerCase().trim();

  notifications
    .filter((notification) => notification.userEmail === userEmail)
    .forEach((notification) => {
      notification.read = true;
    });

  res.json({
    success: true,
  });
});

module.exports = router;
module.exports.notifyQueueJoined = notifyQueueJoined;
module.exports.notifyAlmostReady = notifyAlmostReady;
module.exports.notifications = notifications;
