const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const queueRoutes = require("../queue");
const { queues } = require("../queue");
const { history } = require("../history");
const { notifications } = require("../notifications");

const app = express();
app.use(express.json());
app.use("/api", queueRoutes);

let server;
let baseUrl;

test.before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.beforeEach(() => {
  queues.length = 0;
  history.length = 0;
  notifications.length = 0;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

async function join(email, serviceId = "advising") {
  return request("/queues/join", "POST", { userEmail: email, serviceId });
}

test("lists services and the current wait to join", async () => {
  await join("a@example.com");
  await join("b@example.com");

  const { status, data } = await request("/queues/services");
  const advising = data.services.find((service) => service.id === "advising");
  assert.equal(status, 200);
  assert.equal(advising.waiting, 2);
  assert.equal(advising.estimatedWait, 20);
});

test("users join in order and use the existing history and notification modules", async () => {
  const first = await join("A@Example.com");
  const second = await join("b@example.com");
  const queue = await request("/queues/advising");

  assert.equal(first.status, 201);
  assert.equal(first.data.entry.position, 1);
  assert.equal(first.data.entry.estimatedWait, 0);
  assert.equal(second.data.entry.position, 2);
  assert.equal(second.data.entry.estimatedWait, 10);
  assert.deepEqual(queue.data.queue.map((entry) => entry.userEmail), [
    "a@example.com", "b@example.com",
  ]);
  assert.equal(history.length, 2);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].type, "queue_joined");
});

test("rejects invalid requests and duplicate users", async () => {
  assert.equal((await join("bademail")).status, 400);
  assert.equal((await join("a@example.com", "missing")).status, 404);
  assert.equal((await request("/queues/join", "POST", { userEmail: 42, serviceId: "advising" })).status, 400);
  await join("a@example.com");
  assert.equal((await join("A@example.com")).status, 409);
  assert.equal((await join("a@example.com", "financial-aid")).status, 409);
  assert.equal(queues.length, 1);
  assert.equal(history.length, 1);
});

test("leaving a queue updates history and moves everyone behind forward", async () => {
  await join("a@example.com");
  await join("b@example.com");
  await join("c@example.com");
  await join("d@example.com");

  const left = await request("/queues/advising/leave", "DELETE", { userEmail: "A@example.com" });
  const queue = await request("/queues/advising");

  assert.equal(left.status, 200);
  assert.equal(history.find((record) => record.userEmail === "a@example.com").outcome, "left");
  assert.equal(queue.data.queue[0].userEmail, "b@example.com");
  assert.equal(queue.data.queue[2].estimatedWait, 20);
  assert.equal(notifications.filter((note) => note.type === "almost_ready").length, 1);
  assert.equal((await request("/queues/advising/leave", "DELETE", { userEmail: "a@example.com" })).status, 404);
});

test("serving the next user updates history and notifies users near the front once", async () => {
  for (const email of ["a", "b", "c", "d"]) {
    await join(`${email}@example.com`);
  }

  const first = await request("/queues/advising/next", "POST");
  assert.equal(first.status, 200);
  assert.equal(first.data.served.userEmail, "a@example.com");
  assert.equal(first.data.queue[0].position, 1);
  assert.equal(history[0].outcome, "served");
  assert.deepEqual(notifications.filter((n) => n.type === "almost_ready").map((n) => n.userEmail), ["c@example.com"]);

  await request("/queues/advising/next", "POST");
  await request("/queues/advising/next", "POST");
  assert.deepEqual(notifications.filter((n) => n.type === "almost_ready").map((n) => n.userEmail), ["c@example.com", "d@example.com"]);

  await request("/queues/advising/next", "POST");
  assert.equal((await request("/queues/advising/next", "POST")).status, 404);
});

test("calculates waits for current users and new arrivals", async () => {
  await join("a@example.com", "financial-aid");
  await join("b@example.com", "financial-aid");
  await join("c@example.com", "financial-aid");

  const next = await request("/queues/financial-aid/wait-time");
  const current = await request("/queues/financial-aid/wait-time?userEmail=b@example.com");
  assert.equal(next.data.position, 4);
  assert.equal(next.data.estimatedWait, 45);
  assert.equal(current.data.position, 2);
  assert.equal(current.data.estimatedWait, 15);

  await request("/queues/financial-aid/next", "POST");
  const updated = await request("/queues/financial-aid/wait-time?userEmail=b@example.com");
  assert.equal(updated.data.position, 1);
  assert.equal(updated.data.estimatedWait, 0);
});

test("keeps different service queues separate and returns a user's status", async () => {
  await join("a@example.com", "advising");
  await join("b@example.com", "financial-aid");

  const status = await request("/queues/user/b@example.com");
  assert.equal(status.data.service.id, "financial-aid");
  assert.equal(status.data.entry.position, 1);
  assert.equal((await request("/queues/user/nobody@example.com")).status, 404);
  assert.equal((await request("/queues/advising/wait-time?userEmail=b@example.com")).status, 404);
  assert.equal((await request("/queues/missing")).status, 404);
});
