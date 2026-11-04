const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const queueRoutes = require("../queue");
const { queues } = queueRoutes;
const { run, all } = require("../database");

const app = express();
app.use(express.json());
app.use("/api", queueRoutes);

const runId = randomUUID();
const emails = ["a", "b", "c", "d"].map(
  (letter) => `queue-test-${runId}-${letter}@example.com`
);
const [a, b, c, d] = emails;
const testUserIds = "SELECT id FROM users WHERE email IN (?, ?, ?, ?)";

let server;
let baseUrl;

async function clearTestRecords() {
  await run(
    `DELETE FROM notifications WHERE user_id IN (${testUserIds})`,
    emails
  );
  await run(
    `DELETE FROM history WHERE user_id IN (${testUserIds})`,
    emails
  );
}

test.before(async () => {
  for (const email of emails) {
    // These users exercise the queue routes. The tests do not log in.
    await run(
      "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
      [email, "unused-test-password", "User"]
    );
  }

  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(async () => {
  queues.length = 0;
  await clearTestRecords();
});

test.after(async () => {
  if (server && server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  await clearTestRecords();
  await run("DELETE FROM users WHERE email IN (?, ?, ?, ?)", emails);
});

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return {
    status: response.status,
    data: await response.json(),
  };
}

function join(email, serviceId = "advising") {
  return request("/queues/join", "POST", { userEmail: email, serviceId });
}

function historyRows() {
  return all(
    `SELECT u.email AS userEmail, h.outcome
     FROM history AS h
     JOIN users AS u ON u.id = h.user_id
     WHERE u.email IN (?, ?, ?, ?)
     ORDER BY h.id`,
    emails
  );
}

function notificationRows() {
  return all(
    `SELECT u.email AS userEmail, n.type
     FROM notifications AS n
     JOIN users AS u ON u.id = n.user_id
     WHERE u.email IN (?, ?, ?, ?)
     ORDER BY n.id`,
    emails
  );
}

async function almostReadyRecipients() {
  const notifications = await notificationRows();
  return notifications
    .filter((note) => note.type === "almost_ready")
    .map((note) => note.userEmail);
}

test("lists services and the current wait to join", async () => {
  await join(a);
  await join(b);

  const { status, data } = await request("/queues/services");
  assert.equal(status, 200);

  const advising = data.services.find((service) => service.id === "advising");
  assert.equal(advising.waiting, 2);
  assert.equal(advising.estimatedWait, 20);
});

test("users join in order and use the existing history and notification modules", async () => {
  const first = await join(a.toUpperCase());
  const second = await join(b);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.data.entry.position, 1);
  assert.equal(first.data.entry.estimatedWait, 0);
  assert.equal(second.data.entry.position, 2);
  assert.equal(second.data.entry.estimatedWait, 10);

  const queue = await request("/queues/advising");
  assert.deepEqual(queue.data.queue.map((entry) => entry.userEmail), [a, b]);

  const history = await historyRows();
  assert.deepEqual(history.map((record) => record.userEmail), [a, b]);
  assert.deepEqual(history.map((record) => record.outcome), ["active", "active"]);

  const notifications = await notificationRows();
  assert.deepEqual(notifications.map((note) => note.userEmail), [a, b]);
  assert.deepEqual(notifications.map((note) => note.type), [
    "queue_joined",
    "queue_joined",
  ]);
});

test("rejects invalid requests and duplicate users", async () => {
  assert.equal((await join("bademail")).status, 400);
  assert.equal((await join(a, "missing")).status, 404);

  const invalid = await request("/queues/join", "POST", {
    userEmail: 42,
    serviceId: "advising",
  });
  assert.equal(invalid.status, 400);

  assert.equal((await join(a)).status, 201);
  assert.equal((await join(a.toUpperCase())).status, 409);
  assert.equal((await join(a, "financial-aid")).status, 409);
  assert.equal(queues.length, 1);
  assert.equal((await historyRows()).length, 1);
});

test("leaving a queue updates history and moves everyone behind forward", async () => {
  for (const email of emails) {
    await join(email);
  }

  const left = await request("/queues/advising/leave", "DELETE", {
    userEmail: a.toUpperCase(),
  });
  assert.equal(left.status, 200);

  const history = await historyRows();
  const leavingUser = history.find((record) => record.userEmail === a);
  assert.equal(leavingUser?.outcome, "left");

  const queue = await request("/queues/advising");
  assert.equal(queue.data.queue[0].userEmail, b);
  assert.equal(queue.data.queue[2].estimatedWait, 20);
  assert.deepEqual(await almostReadyRecipients(), [c]);

  const repeat = await request("/queues/advising/leave", "DELETE", {
    userEmail: a,
  });
  assert.equal(repeat.status, 404);
});

test("serving the next user updates history and notifies users near the front once", async () => {
  for (const email of emails) {
    await join(email);
  }

  const first = await request("/queues/advising/next", "POST");
  assert.equal(first.status, 200);
  assert.equal(first.data.served.userEmail, a);
  assert.equal(first.data.queue[0].position, 1);

  const history = await historyRows();
  const servedUser = history.find((record) => record.userEmail === a);
  assert.equal(servedUser?.outcome, "served");
  assert.deepEqual(await almostReadyRecipients(), [c]);

  await request("/queues/advising/next", "POST");
  await request("/queues/advising/next", "POST");
  assert.deepEqual(await almostReadyRecipients(), [c, d]);

  await request("/queues/advising/next", "POST");
  assert.equal((await request("/queues/advising/next", "POST")).status, 404);
});

test("calculates waits for current users and new arrivals", async () => {
  await join(a, "financial-aid");
  await join(b, "financial-aid");
  await join(c, "financial-aid");

  const path = "/queues/financial-aid/wait-time";
  const next = await request(path);
  const current = await request(`${path}?userEmail=${b}`);

  assert.equal(next.data.position, 4);
  assert.equal(next.data.estimatedWait, 45);
  assert.equal(current.data.position, 2);
  assert.equal(current.data.estimatedWait, 15);

  await request("/queues/financial-aid/next", "POST");
  const updated = await request(`${path}?userEmail=${b}`);
  assert.equal(updated.data.position, 1);
  assert.equal(updated.data.estimatedWait, 0);
});

test("keeps different service queues separate and returns a user's status", async () => {
  await join(a, "advising");
  await join(b, "financial-aid");

  const status = await request(`/queues/user/${b}`);
  assert.equal(status.data.service.id, "financial-aid");
  assert.equal(status.data.entry.position, 1);

  assert.equal((await request("/queues/user/nobody@example.com")).status, 404);
  assert.equal(
    (await request(`/queues/advising/wait-time?userEmail=${b}`)).status,
    404
  );
  assert.equal((await request("/queues/missing")).status, 404);
});
