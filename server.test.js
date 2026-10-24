process.env.NODE_ENV = "test";

const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
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
    assert.deepEqual(validateService(validService), []);
  });

  test("rejects a missing service name", () => {
    assert.ok(
      validateService({
        ...validService,
        serviceName: ""
      }).includes("Service name is required and must be text.")
    );
  });

  test("rejects a non-text service name", () => {
    assert.ok(
      validateService({
        ...validService,
        serviceName: 123
      }).includes("Service name is required and must be text.")
    );
  });

  test("rejects a service name over 100 characters", () => {
    assert.ok(
      validateService({
        ...validService,
        serviceName: "A".repeat(101)
      }).includes("Service name cannot exceed 100 characters.")
    );
  });

  test("rejects a missing description", () => {
    assert.ok(
      validateService({
        ...validService,
        description: ""
      }).includes("Description is required and must be text.")
    );
  });

  test("rejects a description over 500 characters", () => {
    assert.ok(
      validateService({
        ...validService,
        description: "A".repeat(501)
      }).includes("Description cannot exceed 500 characters.")
    );
  });

  test("rejects an invalid duration", () => {
    assert.ok(
      validateService({
        ...validService,
        duration: 0
      }).includes("Duration must be a positive whole number.")
    );
  });

  test("rejects a decimal duration", () => {
    assert.ok(
      validateService({
        ...validService,
        duration: 2.5
      }).includes("Duration must be a positive whole number.")
    );
  });

  test("rejects an invalid priority", () => {
    assert.ok(
      validateService({
        ...validService,
        priority: "urgent"
      }).includes("Priority must be low, medium, or high.")
    );
  });
});

describe("Service API", () => {
  test("lists services", async () => {
    const response = await request(app).get("/api/services");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, []);
  });

  test("creates a service", async () => {
    const response = await request(app)
      .post("/api/services")
      .send(validService);

    assert.equal(response.status, 201);
    assert.equal(response.body.serviceName, "Academic Advising");
    assert.equal(response.body.description, "Help with academic planning");
    assert.equal(response.body.duration, 10);
    assert.equal(response.body.priority, "medium");
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

    assert.equal(response.status, 400);
    assert.ok(Array.isArray(response.body.errors));
  });

  test("rejects duplicate service names", async () => {
    await request(app)
      .post("/api/services")
      .send(validService);

    const response = await request(app)
      .post("/api/services")
      .send(validService);

    assert.equal(response.status, 409);
  });

  test("updates a service", async () => {
    const created = await request(app)
      .post("/api/services")
      .send(validService);

    const response = await request(app)
      .put(`/api/services/${created.body.id}`)
      .send({
        serviceName: "Academic Advising",
        description: "Updated advising service",
        duration: 15,
        priority: "high"
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.description, "Updated advising service");
    assert.equal(response.body.duration, 15);
    assert.equal(response.body.priority, "high");
  });

  test("returns 404 when updating a missing service", async () => {
    const response = await request(app)
      .put("/api/services/999")
      .send(validService);

    assert.equal(response.status, 404);
  });
});