
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

beforeEach(() => {
  db.execute.mockReset();
  db.execute.mockResolvedValue([[], []]);
});

describe("Service validation", () => {
  test("accepts valid service data", () => {
    expect(validateService(validService)).toEqual([]);
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

  test("rejects an invalid priority", () => {
    expect(validateService({
      ...validService,
      priority: "urgent"
    })).toContain("Priority must be low, medium, or high.");
  });
});

describe("Service API", () => {
  test("lists services", async () => {
    const services = [
      {
        id: 1,
        serviceName: "Academic Advising",
        description: "Help with academic planning",
        duration: 10,
        priority: "medium"
      }
    ];

    db.execute.mockResolvedValueOnce([services, []]);

    const response = await request(app).get("/api/services");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(services);
  });

  test("creates a service", async () => {
    const createdService = {
      id: 1,
      serviceName: "Academic Advising",
      description: "Help with academic planning",
      duration: 10,
      priority: "medium"
    };

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
    const duplicateError = new Error("Duplicate entry");
    duplicateError.code = "ER_DUP_ENTRY";

    db.execute.mockRejectedValueOnce(duplicateError);

    const response = await request(app)
      .post("/api/services")
      .send(validService);

    expect(response.status).toBe(409);
  });

  test("updates a service", async () => {
    const updatedService = {
      id: 1,
      serviceName: "Academic Advising",
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

  test("returns 404 when updating a missing service", async () => {
    db.execute
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[], []]);

    const response = await request(app)
      .put("/api/services/999")
      .send(validService);

    expect(response.status).toBe(404);
  });
});
