jest.mock("../database", () => ({
  db: {
    execute: jest.fn()
  }
}));

jest.mock("../waitTime", () => ({
  estimateWait: jest.fn((position, duration) => (position - 1) * duration)
}));

const express = require("express");
const request = require("supertest");
const { db } = require("../database");
const queueRoutes = require("../queue");

const app = express();
app.use(express.json());
app.use("/api", queueRoutes);

const service = {
  service_id: 1,
  service_name: "Academic Advising",
  expected_duration: 10
};

const queue = {
  queue_id: 1,
  service_id: 1,
  status: "open"
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Queue routes", () => {
  test("rejects an invalid email when joining a queue", async () => {
    const response = await request(app)
      .post("/api/queues/join")
      .send({ userEmail: "invalid-email", serviceId: "advising" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("returns 404 when the requested service does not exist", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const response = await request(app)
      .post("/api/queues/join")
      .send({ userEmail: "test@example.com", serviceId: "missing" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Service not found.");
  });

  test("returns 404 when the user does not exist", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[]]);

    const response = await request(app)
      .post("/api/queues/join")
      .send({ userEmail: "test@example.com", serviceId: "advising" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User not found.");
  });

  test("rejects a user who is already waiting in a queue", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[{ user_id: 5 }]])
      .mockResolvedValueOnce([[queue]])
      .mockResolvedValueOnce([[{ entry_id: 10 }]]);

    const response = await request(app)
      .post("/api/queues/join")
      .send({ userEmail: "test@example.com", serviceId: "advising" });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("User is already in a queue.");
  });

  test("successfully adds a user to a queue", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[{ user_id: 5 }]])
      .mockResolvedValueOnce([[queue]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 20 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 30 }])
      .mockResolvedValueOnce([[{ join_time: "2026-11-06 12:00:00" }]]);

    const response = await request(app)
      .post("/api/queues/join")
      .send({ userEmail: "TEST@example.com", serviceId: "advising" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.entry.userEmail).toBe("test@example.com");
    expect(response.body.entry.position).toBe(1);
    expect(response.body.entry.estimatedWait).toBe(0);
  });

  test("returns queue services", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[queue]])
      .mockResolvedValueOnce([[]]);

    const response = await request(app)
      .get("/api/queues/services");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.services).toHaveLength(1);
    expect(response.body.services[0].name).toBe("Academic Advising");
    expect(response.body.services[0].waiting).toBe(0);
  });

  test("returns 404 when a user is not in a queue", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const response = await request(app)
      .get("/api/queues/user/test@example.com");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User is not in a queue.");
  });

  test("rejects an invalid email when retrieving a user's queue", async () => {
    const response = await request(app)
      .get("/api/queues/user/invalid-email");

    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("returns 404 for an unknown service queue", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const response = await request(app)
      .get("/api/queues/missing");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Service not found.");
  });

  test("returns 404 when attempting to serve an empty queue", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[queue]])
      .mockResolvedValueOnce([[]]);

    const response = await request(app)
      .post("/api/queues/advising/next");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Queue is empty.");
  });

  test("returns an estimated wait time for a new arrival", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[queue]])
      .mockResolvedValueOnce([[{ entry_id: 1 }, { entry_id: 2 }]]);

    const response = await request(app)
      .get("/api/queues/advising/wait-time");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.position).toBe(3);
    expect(response.body.estimatedWait).toBe(20);
  });

  test("returns 404 when a user is not in the requested queue", async () => {
    db.execute
      .mockResolvedValueOnce([[service]])
      .mockResolvedValueOnce([[queue]])
      .mockResolvedValueOnce([[{ email: "another@example.com" }]]);

    const response = await request(app)
      .get("/api/queues/advising/wait-time?userEmail=test@example.com");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User is not in this queue.");
  });

  test("returns a server error when the database query fails", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app)
      .get("/api/queues/services");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});
