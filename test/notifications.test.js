const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const notificationRoutes = require("../notifications");
const {
  notifications,
  notifyQueueJoined,
  notifyAlmostReady,
} = require("../notifications");

const app = express();
app.use(express.json());
app.use("/api", notificationRoutes);

let server;
let baseUrl;

test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    })
);

test.beforeEach(() => {
  notifications.length = 0;
});

test.after(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    })
);

test("creates a notification", async () => {
  const response = await fetch(`${baseUrl}/api/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userEmail: "student@example.com",
      type: "queue_joined",
      message: "You joined Academic Advising.",
    }),
  });

  const data = await response.json();

  assert.equal(response.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.notification.userEmail, "student@example.com");
  assert.equal(data.notification.read, false);
});

test("rejects missing notification fields", async () => {
  const response = await fetch(`${baseUrl}/api/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userEmail: "student@example.com",
      type: "queue_joined",
    }),
  });

  assert.equal(response.status, 400);
});

test("returns notifications for a user", async () => {
  notifyQueueJoined("student@example.com", "Academic Advising", 4, 30);

  const response = await fetch(
    `${baseUrl}/api/notifications/student@example.com`
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.notifications.length, 1);
  assert.equal(data.notifications[0].type, "queue_joined");
});

test("marks a notification as read", async () => {
  const notification = notifyQueueJoined(
    "student@example.com",
    "Academic Advising",
    4,
    30
  );

  const response = await fetch(
    `${baseUrl}/api/notifications/${notification.id}/read`,
    {
      method: "PATCH",
    }
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.notification.read, true);
});

test("creates an almost ready notification", () => {
  const notification = notifyAlmostReady(
    "student@example.com",
    "Academic Advising",
    2,
    10
  );

  assert.equal(notification.type, "almost_ready");
  assert.equal(notification.userEmail, "student@example.com");
  assert.equal(notification.read, false);
});

test("returns 404 for an unknown notification", async () => {
  const response = await fetch(
    `${baseUrl}/api/notifications/9999/read`,
    {
      method: "PATCH",
    }
  );

  assert.equal(response.status, 404);
});
