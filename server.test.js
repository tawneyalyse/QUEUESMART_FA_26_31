
process.env.NODE_ENV = "test";

jest.mock("./database", () => ({
  db: {
    execute: jest.fn()
  }
}));

const request = require("supertest");
const { app, validateService } = require("./server");
const { db } = require("./database");

const validService = {
  serviceName: "Academic Advising",
  description: "Help with academic planning",
  duration: 10,
  priority: "medium"
};

const createdService = {
  id: 1,
  serviceName: "Academic Advising",
  description: "Help with academic planning",
  duration: 10,
  priority: "medium"
};

beforeEach(() => {
  jest.clearAllMocks();
  db.execute.mockResolvedValue([[], []]);
});

describe("Service validation", () => {
  test("accepts valid service data", () => {
    expect(validateService(validService)).toEqual([]);
  });

  test("rejects an invalid request body", () => {
    expect(validateService(null)).toContain(
      "Request body must be a JSON object."
    );
  });

  test("rejects an array request body", () => {
    expect(validateService([])).toContain(
      "Request body must be a JSON object."
    );
  });

  test("rejects a missing service name", () => {
    expect(validateService({
      ...validService,
      serviceName: ""
    })).toContain("Service name is required and must be text.");
  });

  test("rejects a non-text service name", () => {
    expect(validateService({
      ...validService,
      serviceName: 123
    })).toContain("Service name is required and must be text.");
  });

  test("rejects a service name over 100 characters", () => {
    expect(validateService({
      ...validService,
      serviceName: "A".repeat(101)
    })).toContain("Service name cannot exceed 100 characters.");
  });

  test("rejects a missing description", () => {
    expect(validateService({
      ...validService,
      description: ""
    })).toContain("Description is required and must be text.");
  });

  test("rejects a non-text description", () => {
    expect(validateService({
      ...validService,
      description: 123
    })).toContain("Description is required and must be text.");
  });

  test("rejects a description over 500 characters", () => {
    expect(validateService({
      ...validService,
      description: "A".repeat(501)
    })).toContain("Description cannot exceed 500 characters.");
  });

  test("rejects an invalid duration", () => {
    expect(validateService({
      ...validService,
      duration: 0
    })).toContain("Duration must be a positive whole number.");
  });

  test("rejects a decimal duration", () => {
    expect(validateService({
      ...validService,
      duration: 2.5
    })).toContain("Duration must be a positive whole number.");
  });

  test("rejects a string duration", () => {
    expect(validateService({
      ...validService,
      duration: "10"
    })).toContain("Duration must be a positive whole number.");
  });

  test("rejects an invalid priority", () => {
    expect(validateService({
      ...validService,
      priority: "urgent"
    })).toContain("Priority must be low, medium, or high.");
  });
});

describe("Service API", () => {
  test("lists services", async () => {
    db.execute.mockResolvedValueOnce([[createdService], []]);

    const response = await request(app).get("/api/services");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([createdService]);
  });

  test("handles errors when listing services", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app).get("/api/services");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Could not retrieve services.");
  });

  test("creates a service", async () => {
    db.execute
      .mockResolvedValueOnce([{ insertId: 1 }, []])
      .mockResolvedValueOnce([[createdService], []]);

    const response = await request(app)
      .post("/api/services")
      .send(validService);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(createdService);
  });

  test("rejects invalid service data", async () => {
    const response = await request(app)
      .post("/api/services")
      .send({
        serviceName: "",
        description: "",
        duration: 0,
        priority: "urgent"
      });

    expect(response.status).toBe(400);
    expect(Array.isArray(response.body.errors)).toBe(true);
  });

  test("rejects duplicate service names", async () => {
    const error = new Error("Duplicate entry");
    error.code = "ER_DUP_ENTRY";
    db.execute.mockRejectedValueOnce(error);

    const response = await request(app)
      .post("/api/services")
      .send(validService);

    expect(response.status).toBe(409);
  });

  test("handles errors when creating a service", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app)
      .post("/api/services")
      .send(validService);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Could not create service.");
  });

  test("updates a service", async () => {
    const updatedService = {
      ...createdService,
      description: "Updated advising service",
      duration: 15,
      priority: "high"
    };

    db.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[updatedService], []]);

    const response = await request(app)
      .put("/api/services/1")
      .send({
        ...validService,
        description: "Updated advising service",
        duration: 15,
        priority: "high"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedService);
  });

  test("rejects an invalid service ID", async () => {
    const response = await request(app)
      .put("/api/services/abc")
      .send(validService);

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain("Invalid service ID.");
  });

  test("returns 404 when updating a missing service", async () => {
    db.execute
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[], []]);

    const response = await request(app)
      .put("/api/services/999")
      .send(validService);

    expect(response.status).toBe(404);
  });

  test("rejects duplicate names when updating a service", async () => {
    const error = new Error("Duplicate entry");
    error.code = "ER_DUP_ENTRY";
    db.execute.mockRejectedValueOnce(error);

    const response = await request(app)
      .put("/api/services/1")
      .send(validService);

    expect(response.status).toBe(409);
  });

  test("handles database errors when updating a service", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database error"));

    const response = await request(app)
      .put("/api/services/1")
      .send(validService);

    expect(response.status).toBe(500);
  });

  test("rejects invalid data when updating a service", async () => {
    const response = await request(app)
      .put("/api/services/1")
      .send({
        serviceName: "",
        description: "",
        duration: 0,
        priority: "urgent"
      });

    expect(response.status).toBe(400);
  });
});

describe("Session and access control", () => {
  test("returns unauthenticated session status", async () => {
    const response = await request(app).get("/api/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
  });

  test("rejects user access without login", async () => {
    const response = await request(app).get("/api/user");

    expect(response.status).toBe(401);
  });

  test("rejects administrator access without login", async () => {
    const response = await request(app).get("/api/admin");

    expect(response.status).toBe(401);
  });

  test("successfully logs out", async () => {
    const response = await request(app).post("/api/logout");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe("Health endpoint", () => {
  test("returns successful database health status", async () => {
    db.execute.mockResolvedValueOnce([[{ result: 1 }], []]);

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.database).toBe("Connected");
    expect(response.body.success).toBe(true);
  });

  test("returns an error when the database is unavailable", async () => {
    db.execute.mockRejectedValueOnce(new Error("Database unavailable"));

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(500);
    expect(response.body.database).toBe("Disconnected");
    expect(response.body.success).toBe(false);
  });
});
