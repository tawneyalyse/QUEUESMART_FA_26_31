jest.mock("../database", () => ({
  db: {
    execute: jest.fn()
  }
}));

const express = require("express");
const request = require("supertest");
const { db } = require("../database");
const notificationRoutes = require("../notifications");

const app = express();
app.use(express.json());
app.use("/api", notificationRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Notification routes", () => {
  test("creates a notification successfully", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([{ insertId: 10 }]);

    const response = await request(app)
      .post("/api/notifications")
      .send({
        userEmail: "test@example.com",
        type: "queue_joined",
        message: "You joined Academic Advising."
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.notification.userEmail).toBe("test@example.com");
    expect(response.body.notification.type).toBe("queue_joined");
    expect(response.body.notification.read).toBe(false);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  test("rejects missing notification fields", async () => {
    const response = await request(app)
      .post("/api/notifications")
      .send({
        userEmail: "test@example.com",
        type: "queue_joined"
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("rejects an invalid email", async () => {
    const response = await request(app)
      .post("/api/notifications")
      .send({
        userEmail: "invalid-email",
        type: "queue_joined",
        message: "Test notification."
      });

    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("rejects notification fields that exceed their limits", async () => {
    const response = await request(app)
      .post("/api/notifications")
      .send({
        userEmail: "test@example.com",
        type: "a".repeat(51),
        message: "Test notification."
      });

    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("returns 404 when creating a notification for an unknown user", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const response = await request(app)
      .post("/api/notifications")
      .send({
        userEmail: "missing@example.com",
        type: "queue_joined",
        message: "Test notification."
      });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User not found.");
  });

  test("retrieves notifications for a user", async () => {
    const notifications = [
      {
        id: 1,
        userEmail: "test@example.com",
        type: "queue_joined",
        message: "You joined Academic Advising.",
        read: 0,
        createdAt: "2026-11-06 12:00:00"
      }
    ];

    db.execute.mockResolvedValueOnce([notifications]);

    const response = await request(app)
      .get("/api/notifications/test@example.com");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.notifications[0].type).toBe("queue_joined");
  });

  test("marks a notification as read", async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const response = await request(app)
      .patch("/api/notifications/1/read");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Notification marked as read.");
  });

  test("rejects an invalid notification ID", async () => {
    const response = await request(app)
      .patch("/api/notifications/invalid/read");

    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test("returns 404 when the notification does not exist", async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const response = await request(app)
      .patch("/api/notifications/999/read");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Notification not found.");
  });

  test("marks all notifications for a user as read", async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 3 }]);

    const response = await request(app)
      .patch("/api/notifications/user/test@example.com/read-all");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test("returns a server error when notification retrieval fails", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app)
      .get("/api/notifications/test@example.com");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});

describe("Notification helper functions", () => {
  const {
    createNotification,
    notifyQueueJoined,
    notifyAlmostReady
  } = require("../notifications");

  test("creates a notification using the helper function", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([{ insertId: 20 }]);

    const result = await createNotification(
      "TEST@example.com",
      "queue_joined",
      "You joined Academic Advising."
    );

    expect(result.id).toBe(20);
    expect(result.userEmail).toBe("test@example.com");
    expect(result.read).toBe(false);
  });

  test("rejects helper notification creation for an unknown user", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    await expect(
      createNotification(
        "missing@example.com",
        "queue_joined",
        "Test."
      )
    ).rejects.toThrow("User not found.");
  });

  test("creates a queue joined notification", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([{ insertId: 21 }]);

    const result = await notifyQueueJoined(
      "test@example.com",
      "Academic Advising",
      2,
      10
    );

    expect(result.type).toBe("queue_joined");
    expect(result.message).toContain("Position: 2");
    expect(result.message).toContain("10 minutes");
  });

  test("creates an almost ready notification", async () => {
    db.execute
      .mockResolvedValueOnce([[{ user_id: 1 }]])
      .mockResolvedValueOnce([{ insertId: 22 }]);

    const result = await notifyAlmostReady(
      "test@example.com",
      "Academic Advising",
      1,
      0
    );

    expect(result.type).toBe("almost_ready");
    expect(result.message).toContain("You are almost ready.");
  });
});
