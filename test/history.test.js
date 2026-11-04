const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const historyRoutes = require("../history");
const {
  createHistory,
  completeHistory,
} = require("../history");
const {
  run,
  get,
  bcrypt,
} = require("../database");

const app = express();

app.use(express.json());
app.use("/api", historyRoutes);

const TEST_EMAIL = "history-test@example.com";

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
      DELETE FROM history
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
      DELETE FROM history
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

test("creates and stores a history record", async () => {
  const response = await fetch(
    `${baseUrl}/api/history`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail: TEST_EMAIL,
        serviceName: "Academic Advising",
      }),
    }
  );

  const data = await response.json();

  assert.equal(response.status, 201);
  assert.equal(data.success, true);
  assert.equal(
    data.record.userEmail,
    TEST_EMAIL
  );
  assert.equal(
    data.record.serviceName,
    "Academic Advising"
  );
  assert.equal(
    data.record.outcome,
    "active"
  );

  const stored = await get(
    `
      SELECT
        service_name,
        outcome,
        joined_at
      FROM history
      WHERE id = ?
    `,
    [data.record.id]
  );

  assert.equal(
    stored.service_name,
    "Academic Advising"
  );
  assert.equal(stored.outcome, "active");
  assert.ok(stored.joined_at);
});

test("rejects missing history fields", async () => {
  const response = await fetch(
    `${baseUrl}/api/history`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail: TEST_EMAIL,
      }),
    }
  );

  assert.equal(response.status, 400);
});

test("returns history for a user", async () => {
  await createHistory(
    TEST_EMAIL,
    "Academic Advising"
  );

  const response = await fetch(
    `${baseUrl}/api/history/${TEST_EMAIL}`
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.history.length, 1);
  assert.equal(
    data.history[0].serviceName,
    "Academic Advising"
  );
});

test("marks a history record as served", async () => {
  const record = await createHistory(
    TEST_EMAIL,
    "Academic Advising"
  );

  const response = await fetch(
    `${baseUrl}/api/history/${record.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outcome: "served",
      }),
    }
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    data.record.outcome,
    "served"
  );
  assert.notEqual(
    data.record.completedAt,
    null
  );

  const stored = await get(
    `
      SELECT
        outcome,
        completed_at
      FROM history
      WHERE id = ?
    `,
    [record.id]
  );

  assert.equal(stored.outcome, "served");
  assert.notEqual(
    stored.completed_at,
    null
  );
});

test("marks a history record as left", async () => {
  await createHistory(
    TEST_EMAIL,
    "Financial Aid"
  );

  const record = await completeHistory(
    TEST_EMAIL,
    "Financial Aid",
    "left"
  );

  assert.equal(record.outcome, "left");
  assert.notEqual(
    record.completedAt,
    null
  );

  const stored = await get(
    `
      SELECT
        outcome,
        completed_at
      FROM history
      WHERE id = ?
    `,
    [record.id]
  );

  assert.equal(stored.outcome, "left");
  assert.notEqual(
    stored.completed_at,
    null
  );
});

test("returns null when no active history record exists", async () => {
  const record = await completeHistory(
    TEST_EMAIL,
    "Academic Advising",
    "served"
  );

  assert.equal(record, null);
});

test("rejects an invalid outcome", async () => {
  const record = await createHistory(
    TEST_EMAIL,
    "Academic Advising"
  );

  const response = await fetch(
    `${baseUrl}/api/history/${record.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outcome: "invalid",
      }),
    }
  );

  assert.equal(response.status, 400);
});

test("returns 404 for an unknown history record", async () => {
  const response = await fetch(
    `${baseUrl}/api/history/999999`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outcome: "served",
      }),
    }
  );

  assert.equal(response.status, 404);
});

test("returns 404 when creating history for an unknown user", async () => {
  const response = await fetch(
    `${baseUrl}/api/history`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail: "missing@example.com",
        serviceName: "Academic Advising",
      }),
    }
  );

  assert.equal(response.status, 404);
});
