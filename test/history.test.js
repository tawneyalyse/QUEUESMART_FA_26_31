jest.mock("../database", () => ({
  db: {
    execute: jest.fn()
  }
}));

const express = require("express");
const request = require("supertest");
const { db } = require("../database");
const historyRoutes = require("../history");
const { createHistory, completeHistory } = require("../history");

const app = express();
app.use(express.json());
app.use("/api", historyRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("History routes", () => {
  test("creates a history record successfully", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([[{ service_id: 2 }]])
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[
        {
          id: 10,
          userEmail: "test@example.com",
          serviceName: "Academic Advising",
          outcome: "active"
        }
      ]]);

    const response = await request(app)
      .post("/api/history")
      .send({
        userEmail: "test@example.com",
        serviceName: "Academic Advising"
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.record.id).toBe(10);
    expect(response.body.record.outcome).toBe("active");
  });

  test("rejects missing history fields", async () => {
    const response = await request(app)
      .post("/api/history")
      .send({ userEmail: "test@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("rejects non-text history fields", async () => {
    const response = await request(app)
      .post("/api/history")
      .send({
        userEmail: 123,
        serviceName: "Academic Advising"
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("History fields must be text.");
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("rejects invalid history data", async () => {
    const response = await request(app)
      .post("/api/history")
      .send({
        userEmail: "invalid-email",
        serviceName: "Academic Advising"
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid history data.");
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("returns the user's history", async () => {
    db.execute.mockResolvedValueOnce([[
      {
        id: 1,
        userEmail: "test@example.com",
        serviceName: "Academic Advising",
        outcome: "served"
      }
    ]]);

    const response = await request(app)
      .get("/api/history/test@example.com");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.history).toHaveLength(1);
    expect(response.body.history[0].outcome).toBe("served");
  });

  test("returns an empty history list when the user has no records", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const response = await request(app)
      .get("/api/history/test@example.com");

    expect(response.status).toBe(200);
    expect(response.body.history).toEqual([]);
  });

  test("updates a history record to served", async () => {
    db.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        {
          id: 10,
          userEmail: "test@example.com",
          serviceName: "Academic Advising",
          outcome: "served"
        }
      ]]);

    const response = await request(app)
      .patch("/api/history/10")
      .send({ outcome: "served" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.record.outcome).toBe("served");
  });

  test("updates a history record to left", async () => {
    db.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        {
          id: 10,
          userEmail: "test@example.com",
          serviceName: "Academic Advising",
          outcome: "left"
        }
      ]]);

    const response = await request(app)
      .patch("/api/history/10")
      .send({ outcome: "left" });

    expect(response.status).toBe(200);
    expect(response.body.record.outcome).toBe("left");
  });

  test("rejects an invalid history ID", async () => {
    const response = await request(app)
      .patch("/api/history/invalid")
      .send({ outcome: "served" });

    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("rejects an invalid history outcome", async () => {
    const response = await request(app)
      .patch("/api/history/10")
      .send({ outcome: "active" });

    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("returns 404 when the history record does not exist", async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const response = await request(app)
      .patch("/api/history/999")
      .send({ outcome: "served" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("History record not found.");
  });

  test("returns a server error when retrieving history fails", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app)
      .get("/api/history/test@example.com");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});

describe("History helper functions", () => {
  test("creates history using the helper function", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([[{ service_id: 2 }]])
      .mockResolvedValueOnce([{ insertId: 15 }])
      .mockResolvedValueOnce([[
        {
          id: 15,
          userEmail: "test@example.com",
          serviceName: "Academic Advising",
          outcome: "active"
        }
      ]]);

    const result = await createHistory(
      "TEST@example.com",
      "Academic Advising"
    );

    expect(result.id).toBe(15);
    expect(result.userEmail).toBe("test@example.com");
    expect(result.outcome).toBe("active");
  });

  test("rejects history creation when the user does not exist", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    await expect(
      createHistory("missing@example.com", "Academic Advising")
    ).rejects.toThrow("User not found.");
  });

  test("rejects history creation when the service does not exist", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([[]]);

    await expect(
      createHistory("test@example.com", "Missing Service")
    ).rejects.toThrow("Service not found.");
  });

  test("completes an active history record", async () => {
    db.execute
      .mockResolvedValueOnce([[{ history_id: 15 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        {
          id: 15,
          userEmail: "test@example.com",
          serviceName: "Academic Advising",
          outcome: "served"
        }
      ]]);

    const result = await completeHistory(
      "test@example.com",
      "Academic Advising",
      "served"
    );

    expect(result.id).toBe(15);
    expect(result.outcome).toBe("served");
  });

  test("returns null when no active history record exists", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const result = await completeHistory(
      "test@example.com",
      "Academic Advising",
      "left"
    );

    expect(result).toBeNull();
  });
});
