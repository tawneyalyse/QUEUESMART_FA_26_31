const request = require("supertest");
const { app, validateService } = require("./server");

const validService = {
  serviceName: "Academic Advising",
  description: "Help with academic planning",
  duration: 10,
  priority: "medium"
};

beforeEach(() => {
  // Each test gets a clean service list through the test-only reset endpoint.
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

  test("rejects an invalid priority", () => {
    expect(validateService({
      ...validService,
      priority: "urgent"
    })).toContain("Priority must be low, medium, or high.");
  });
});

describe("Service API", () => {
  test("lists services", async () => {
    const response = await request(app).get("/api/services");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test("rejects invalid service creation", async () => {
    const response = await request(app)
      .post("/api/services")
      .send({ serviceName: "" });

    expect(response.status).toBe(400);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test("creates a service", async () => {
    const response = await request(app)
      .post("/api/services")
      .send(validService);

    expect(response.status).toBe(201);
    expect(response.body.serviceName).toBe(validService.serviceName);
  });
});
