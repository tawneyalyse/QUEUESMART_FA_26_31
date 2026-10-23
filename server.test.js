const request = require("supertest");
const { app, validateService } = require("./server");

const validService = {
  serviceName: "Academic Advising",
  description: "Help with academic planning",
  duration: 10,
  priority: "medium"
};

beforeEach(async () => {
  await request(app).delete("/api/test/reset");
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
    const response = await request(app).get("/api/services");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test("creates a service", async () => {
    const response = await request(app)
      .post("/api/services")
      .send(validService);

    expect(response.status).toBe(201);
    expect(response.body.serviceName).toBe("Academic Advising");
  });

  test("rejects invalid service creation", async () => {
    const response = await request(app)
      .post("/api/services")
      .send({ serviceName: "" });

    expect(response.status).toBe(400);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test("rejects duplicate service names", async () => {
    await request(app).post("/api/services").send(validService);

    const response = await request(app)
      .post("/api/services")
      .send({
        ...validService,
        serviceName: "academic advising"
      });

    expect(response.status).toBe(409);
  });

  test("updates an existing service", async () => {
    const created = await request(app)
      .post("/api/services")
      .send(validService);

    const response = await request(app)
      .put(`/api/services/${created.body.id}`)
      .send({
        ...validService,
        serviceName: "Updated Advising",
        duration: 20
      });

    expect(response.status).toBe(200);
    expect(response.body.serviceName).toBe("Updated Advising");
    expect(response.body.duration).toBe(20);
  });

  test("returns 404 when updating a missing service", async () => {
    const response = await request(app)
      .put("/api/services/999")
      .send(validService);

    expect(response.status).toBe(404);
  });
});
