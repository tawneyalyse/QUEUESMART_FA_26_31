const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const notificationRoutes = require("../notifications");
const {
  notifyQueueJoined,
  notifyAlmostReady,
} = require("../notifications");
const {
  run,
  get,
  bcrypt,
} = require("../database");

const app = express();

app.use(express.json());
app.use("/api", notificationRoutes);

const TEST_EMAIL = "notification-test@example.com";

let server;
let baseUrl;
let passwordHash;

test.before(async () => {
  passwordHash = await bcrypt.hash(
    "TestPassword123!",
    10
  );

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.beforeEach(async () => {
  await run(
    `
      DELETE FROM notifications
      WHERE user_id IN (
        SELECT id
        FROM users
        WHERE email = ?
      )
    `,
    [TEST_EMAIL]
  );

  await run(
    `
      DELETE FROM users
      WHERE email = ?
    `,
    [TEST_EMAIL]
  );

  await run(
    `
      INSERT INTO users (
        email,
        password,
        role
      )
      VALUES (?, ?, 'User')
    `,
    [TEST_EMAIL, passwordHash]
  );
});

test.after(async () => {
  await run(
    `
      DELETE FROM notifications
      WHERE user_id IN (
        SELECT id
        FROM users
        WHERE email = ?
      )
    `,
    [TEST_EMAIL]
  );

  await run(
    `
      DELETE FROM users
      WHERE email = ?
    `,
    [TEST_EMAIL]
  );

  await new Promise((resolve) => {
    server.close(resolve);
  });
});

test("creates and stores a notification", async () => {
  const response = await fetch(
    `${baseUrl}/api/notifications`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail: TEST_EMAIL,
        type: "queue_joined",
        message: "You joined Academic Advising.",
      }),
    }
  );

  const data = await response.json();

  assert.equal(response.status, 201);
  assert.equal(data.success, true);
  assert.equal(
    data.notification.userEmail,
    TEST_EMAIL
  );
  assert.equal(
    data.notification.type,
    "queue_joined"
  );
  assert.equal(
    data.notification.read,
    false
  );

  const stored = await get(
    `
      SELECT
        type,
        message,
        is_read
      FROM notifications
      WHERE id = ?
    `,
    [data.notification.id]
  );

  assert.equal(stored.type, "queue_joined");
  assert.equal(
    stored.message,
    "You joined Academic Advising."
  );
  assert.equal(stored.is_read, 0);
});

test("rejects missing notification fields", async () => {
  const response = await fetch(
    `${baseUrl}/api/notifications`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail: TEST_EMAIL,
        type: "queue_joined",
      }),
    }
  );

  assert.equal(response.status, 400);
});

test("returns notifications for a user", async () => {
  await notifyQueueJoined(
    TEST_EMAIL,
    "Academic Advising",
    4,
    30
  );

  const response = await fetch(
    `${baseUrl}/api/notifications/${TEST_EMAIL}`
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.notifications.length, 1);
  assert.equal(
    data.notifications[0].type,
    "queue_joined"
  );
});

test("marks a notification as read", async () => {
  const notification =
    await notifyQueueJoined(
      TEST_EMAIL,
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
  assert.equal(
    data.notification.read,
    true
  );

  const stored = await get(
    `
      SELECT is_read
      FROM notifications
      WHERE id = ?
    `,
    [notification.id]
  );

  assert.equal(stored.is_read, 1);
});

test("creates an almost ready notification", async () => {
  const notification =
    await notifyAlmostReady(
      TEST_EMAIL,
      "Academic Advising",
      2,
      10
    );

  assert.equal(
    notification.type,
    "almost_ready"
  );
  assert.equal(
    notification.userEmail,
    TEST_EMAIL
  );
  assert.equal(
    notification.read,
    false
  );

  const stored = await get(
    `
      SELECT type
      FROM notifications
      WHERE id = ?
    `,
    [notification.id]
  );

  assert.equal(stored.type, "almost_ready");
});

test("marks all user notifications as read", async () => {
  await notifyQueueJoined(
    TEST_EMAIL,
    "Academic Advising",
    4,
    30
  );

  await notifyAlmostReady(
    TEST_EMAIL,
    "Academic Advising",
    2,
    10
  );

  const response = await fetch(
    `${baseUrl}/api/notifications/user/${TEST_EMAIL}/read-all`,
    {
      method: "PATCH",
    }
  );

  assert.equal(response.status, 200);

  const unread = await get(
    `
      SELECT COUNT(*) AS count
      FROM notifications
      JOIN users
        ON users.id = notifications.user_id
      WHERE users.email = ?
        AND notifications.is_read = 0
    `,
    [TEST_EMAIL]
  );

  assert.equal(unread.count, 0);
});

test("returns 404 for an unknown notification", async () => {
  const response = await fetch(
    `${baseUrl}/api/notifications/999999/read`,
    {
      method: "PATCH",
    }
  );

  assert.equal(response.status, 404);
});

test("returns 404 when creating a notification for an unknown user", async () => {
  const response = await fetch(
    `${baseUrl}/api/notifications`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail: "missing@example.com",
        type: "queue_joined",
        message: "Test notification.",
      }),
    }
  );

  assert.equal(response.status, 404);
});
