
const request = require("supertest");
const express = require("express");
const session = require("express-session");

jest.mock("./database", () => ({
  db: {
    execute: jest.fn(),
    getConnection: jest.fn()
  },
  bcrypt: {
    hash: jest.fn(),
    compare: jest.fn()
  }
}));

const { db, bcrypt } = require("./database");
const authRoutes = require("./auth");

const app = express();

app.use(express.json());

app.use(session({
  secret: "test-secret",
  resave: false,
  saveUninitialized: false
}));

app.use("/api", authRoutes);

let connection;

beforeEach(() => {
  jest.clearAllMocks();

  connection = {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
    execute: jest.fn()
  };

  db.getConnection.mockResolvedValue(connection);
  bcrypt.hash.mockResolvedValue("hashed-password");
  bcrypt.compare.mockResolvedValue(true);
});

describe("User Registration", () => {
  const validUser = {
    email: "student@example.com",
    password: "Password123",
    fullName: "John Smith",
    contactInfo: "555-123-4567"
  };

  test("successfully registers a user and creates a profile", async () => {
    connection.execute
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{}]);

    const response = await request(app)
      .post("/api/register")
      .send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.execute).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalled();
  });

  test("hashes the password before storing it", async () => {
    connection.execute
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{}]);

    await request(app)
      .post("/api/register")
      .send(validUser);

    expect(bcrypt.hash).toHaveBeenCalledWith(
      "Password123",
      12
    );

    expect(connection.execute.mock.calls[0][1][1])
      .toBe("hashed-password");
  });

  test("rejects an invalid email", async () => {
    const response = await request(app)
      .post("/api/register")
      .send({
        ...validUser,
        email: "invalid-email"
      });

    expect(response.status).toBe(400);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test("rejects a password shorter than eight characters", async () => {
    const response = await request(app)
      .post("/api/register")
      .send({
        ...validUser,
        password: "short"
      });

    expect(response.status).toBe(400);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test("rejects a missing full name", async () => {
    const response = await request(app)
      .post("/api/register")
      .send({
        ...validUser,
        fullName: ""
      });

    expect(response.status).toBe(400);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test("rejects duplicate email addresses", async () => {
    const error = new Error("Duplicate email");
    error.code = "ER_DUP_ENTRY";

    connection.execute.mockRejectedValueOnce(error);

    const response = await request(app)
      .post("/api/register")
      .send(validUser);

    expect(response.status).toBe(409);
    expect(connection.rollback).toHaveBeenCalled();
  });
});

describe("User Login", () => {
  test("successfully logs in a registered user", async () => {
    db.execute.mockResolvedValueOnce([[
      {
        user_id: 1,
        email: "student@example.com",
        password: "hashed-password",
        role: "User"
      }
    ]]);

    const response = await request(app)
      .post("/api/login")
      .send({
        email: "student@example.com",
        password: "Password123"
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "Password123",
      "hashed-password"
    );
  });

  test("rejects an incorrect password", async () => {
    db.execute.mockResolvedValueOnce([[
      {
        user_id: 1,
        email: "student@example.com",
        password: "hashed-password",
        role: "User"
      }
    ]]);

    bcrypt.compare.mockResolvedValueOnce(false);

    const response = await request(app)
      .post("/api/login")
      .send({
        email: "student@example.com",
        password: "WrongPassword123"
      });

    expect(response.status).toBe(401);
  });

  test("rejects a nonexistent user", async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const response = await request(app)
      .post("/api/login")
      .send({
        email: "unknown@example.com",
        password: "Password123"
      });

    expect(response.status).toBe(401);
  });
});
