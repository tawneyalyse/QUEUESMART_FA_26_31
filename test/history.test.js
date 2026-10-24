const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const historyRoutes = require("../history");
const {
  history,
  createHistory,
  completeHistory,
} = require("../history");

const app = express();
app.use(express.json());
app.use("/api", historyRoutes);

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
  history.length = 0;
});

test.after(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    })
);

test("creates a history record", async () => {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userEmail: "student@example.com",
      serviceName: "Academic Advising",
    }),
  });

  const data = await response.json();

  assert.equal(response.status, 201);
  assert.equal(data.success, true);
  assert.equal(data.record.userEmail, "student@example.com");
  assert.equal(data.record.serviceName, "Academic Advising");
  assert.equal(data.record.outcome, "active");
});

test("rejects missing history fields", async () => {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userEmail: "student@example.com",
    }),
  });

  assert.equal(response.status, 400);
});

test("returns history for a user", async () => {
  createHistory("student@example.com", "Academic Advising");

  const response = await fetch(
    `${baseUrl}/api/history/student@example.com`
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.history.length, 1);
  assert.equal(data.history[0].serviceName, "Academic Advising");
});

test("marks a history record as served", async () => {
  const record = createHistory(
    "student@example.com",
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
  assert.equal(data.record.outcome, "served");
  assert.notEqual(data.record.completedAt, null);
});

test("marks a history record as left", () => {
  createHistory("student@example.com", "Financial Aid");

  const record = completeHistory(
    "student@example.com",
    "Financial Aid",
    "left"
  );

  assert.equal(record.outcome, "left");
  assert.notEqual(record.completedAt, null);
});

test("rejects an invalid outcome", async () => {
  const record = createHistory(
    "student@example.com",
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
  const response = await fetch(`${baseUrl}/api/history/9999`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outcome: "served",
    }),
  });

  assert.equal(response.status, 404);
});
