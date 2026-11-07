jest.mock("../database", () => ({
  db: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

// Use the real wait calculation; only the database is mocked.

const express = require("express");
const request = require("supertest");
const { db } = require("../database");
const queueRoutes = require("../queue");

const app = express();
app.use(express.json());
// Test-only session injection; production sessions come from express-session.
app.use((req, res, next) => {
  const role = req.headers["x-test-role"];
  if (role !== "anonymous") req.session = { user: { role: role || "Administrator" } };
  next();
});
app.use("/api", queueRoutes);

const connection = {
  execute: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(),
  rollback: jest.fn(), release: jest.fn()
};

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
  jest.resetAllMocks();
  db.getConnection.mockResolvedValue(connection);
  connection.beginTransaction.mockResolvedValue();
  connection.commit.mockResolvedValue();
  connection.rollback.mockResolvedValue();
  connection.execute.mockImplementation((sql, params) => {
    if (sql === "SELECT service_id FROM Service WHERE service_id = ? FOR UPDATE") return Promise.resolve([[{service_id: 1}]]);
    return db.execute(sql, params);
  });
  db.execute.mockRejectedValue(new Error("Unexpected database query: add an explicit fixture"));
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


// Each fixture is one mysql2 execute result in the order awaited by the route.
// Unexpected extra queries fail instead of silently succeeding.
function results(...values) {
  values.forEach(value => db.execute.mockResolvedValueOnce([value]));
}
function waiting(id, position) {
  return { entry_id: id, user_id: id + 100, position,
    email: `student${id}@example.com`, join_time: "2026-11-06 12:00:00" };
}
function expectSql(fragment, parameters) {
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining(fragment), parameters);
}

// These are route-level unit tests. They do not establish real SQL locking,
// persistence, rollback, or database constraint enforcement.
describe("Queue lifecycle and database interactions", () => {
  test("creates an open queue when the service has none", async () => {
    results([service], [], {insertId: 1}, [queue], []);
    const response = await request(app).get("/api/queues/1");
    expect(response.status).toBe(200);
    expect(response.body.queue).toEqual([]);
    expectSql("WHERE service_id = ?", ["1"]);
    expectSql("INSERT INTO Queue (", [1]);
    expectSql("WHERE queue_id = ?", [1]);
  });

  test("returns a populated roster with positions and real wait estimates", async () => {
    results([service], [queue], [waiting(1,1), waiting(2,2), waiting(3,3)]);
    const response = await request(app).get("/api/queues/advising");
    expect(response.status).toBe(200);
    expect(response.body.queue.map(e => [e.id,e.position,e.estimatedWait])).toEqual([[1,1,0],[2,2,10],[3,3,20]]);
    expect(response.body.queue[0]).toMatchObject({userEmail:"student1@example.com",serviceId:1,joinedAt:"2026-11-06 12:00:00"});
    expectSql("qe.status = 'waiting'", [1]);
  });

  test("returns the existing user's queue and queries normalized email", async () => {
    results([{...waiting(2,2), ...service}]);
    const response = await request(app).get("/api/queues/user/STUDENT2@example.com");
    expect(response.status).toBe(200);
    expect(response.body.service).toEqual({id:1,name:"Academic Advising",duration:10});
    expect(response.body.entry).toMatchObject({id:2,position:2,estimatedWait:10});
    expectSql("WHERE uc.email = ?", ["student2@example.com"]);
  });

  test("joins behind existing users and writes history and notification", async () => {
    results([service], [{user_id:5}], [queue], [], [waiting(1,1),waiting(2,2)],
      {insertId:20}, {affectedRows:1}, [], {insertId:30}, [{join_time:"2026-11-06 12:00:00"}]);
    const response = await request(app).post("/api/queues/join").send({userEmail:" TEST@example.com ",serviceId:"advising"});
    expect(response.status).toBe(201);
    expect(response.body.entry).toMatchObject({id:20,position:3,estimatedWait:20,userEmail:"test@example.com"});
    expectSql("INSERT INTO QueueEntry", [1,5,3]);
    expectSql("INSERT INTO History", [5,1]);
    expectSql("INSERT INTO Notification", [5,"queue_joined","You joined Academic Advising. Position: 3. Estimated wait: 20 minutes."]);
  });

  test("does not insert an identical notification already returned by the database", async () => {
    results([service], [{user_id:5}], [queue], [], [], {insertId:20},
      {affectedRows:1}, [{notification_id:30}], [{join_time:"2026-11-06 12:00:00"}]);
    const response = await request(app).post("/api/queues/join").send({userEmail:"test@example.com",serviceId:1});
    expect(response.status).toBe(201);
    expect(db.execute.mock.calls.some(([sql]) => sql.includes("INSERT INTO Notification"))).toBe(false);
  });

  test.each(["leave","next"])("%s compacts positions, updates history, and alerts only the first two remaining users", async action => {
    const remainingBefore = [waiting(2,2),waiting(3,3),waiting(4,4)];
    const remainingAfter = [waiting(2,1),waiting(3,2),waiting(4,3)];
    results([service], [queue], action === "leave" ? [{entry_id:1,user_id:101}] : [waiting(1,1),...remainingBefore],
      {affectedRows:1}, {affectedRows:1}, remainingBefore,
      {affectedRows:1}, {affectedRows:1}, {affectedRows:1}, remainingAfter,
      [], {insertId:1}, [], {insertId:2}, remainingAfter);
    const response = action === "leave"
      ? await request(app).delete("/api/queues/advising/leave").send({userEmail:"STUDENT1@example.com"})
      : await request(app).post("/api/queues/advising/next");
    expect(response.status).toBe(200);
    expect(response.body.queue.map(e => [e.id,e.position,e.estimatedWait])).toEqual([[2,1,0],[3,2,10],[4,3,20]]);
    expectSql(`SET status = '${action === "leave" ? "canceled" : "served"}'`, [1]);
    expectSql(`SET outcome = '${action === "leave" ? "left" : "served"}'`, [101,1]);
    expectSql("UPDATE QueueEntry SET position", [1,2]);
    expectSql("UPDATE QueueEntry SET position", [2,3]);
    expectSql("UPDATE QueueEntry SET position", [3,4]);
    const inserts = db.execute.mock.calls.filter(([sql]) => sql.includes("INSERT INTO Notification"));
    expect(inserts.map(([,params]) => params.slice(0,2))).toEqual([[102,"almost_ready"],[103,"almost_ready"]]);
    expect(inserts[0][1][2]).toContain("position 1, estimated wait 0 minutes");
    expect(inserts[1][1][2]).toContain("position 2, estimated wait 10 minutes");
    if (action === "next") expect(response.body.served).toEqual({id:1,userEmail:"student1@example.com",serviceId:1});
    else expectSql("AND uc.email = ?", [1,"student1@example.com"]);
  });

  test.each(["leave","next"])("%s handles removing the last waiting entry", async action => {
    results([service],[queue],[waiting(1,1)],{affectedRows:1},{affectedRows:1},[],[],[]);
    const response = action === "leave"
      ? await request(app).delete("/api/queues/advising/leave").send({userEmail:"student1@example.com"})
      : await request(app).post("/api/queues/advising/next");
    expect(response.status).toBe(200);
    expect(response.body.queue).toEqual([]);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes("INSERT INTO Notification"))).toBe(false);
  });

  test("returns wait for a current user using normalized email", async () => {
    results([service],[queue],[waiting(1,1),waiting(2,2),waiting(3,3)]);
    const response = await request(app).get("/api/queues/advising/wait-time?userEmail=STUDENT2@example.com");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({position:2,estimatedWait:10});
  });

  test("empty queue has zero estimated wait for a new arrival", async () => {
    results([service],[queue],[]);
    const response = await request(app).get("/api/queues/advising/wait-time");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({position:1,estimatedWait:0});
  });

  test("service totals count waiting rows returned by the query", async () => {
    results([service],[queue],[waiting(1,1),waiting(2,2)]);
    const response = await request(app).get("/api/queues/services");
    expect(response.status).toBe(200);
    expect(response.body.services[0]).toMatchObject({waiting:2,estimatedWait:20});
  });
});

describe("Queue validation and failure responses", () => {
  test.each([{}, {userEmail:42,serviceId:1},{userEmail:"test@example.com"}])("rejects incomplete join %j", async body => {
    const response = await request(app).post("/api/queues/join").send(body);
    expect(response.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });
  test.each(["leave","next","wait-time"])("returns 404 for missing service on %s", async action => {
    results([]);
    const path = `/api/queues/missing/${action}`;
    const response = action === "leave" ? await request(app).delete(path).send({userEmail:"test@example.com"})
      : action === "next" ? await request(app).post(path) : await request(app).get(path);
    expect(response.status).toBe(404);
  });
  test("leave rejects invalid email without updating entries", async () => {
    results([service]);
    const response = await request(app).delete("/api/queues/advising/leave").send({userEmail:"invalid"});
    expect(response.status).toBe(400);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  test("leave rejects a user not waiting in this queue", async () => {
    results([service],[queue],[]);
    const response = await request(app).delete("/api/queues/advising/leave").send({userEmail:"test@example.com"});
    expect(response.status).toBe(404);
    expect(db.execute.mock.calls.some(([sql])=>sql.startsWith("UPDATE"))).toBe(false);
  });
  test("wait lookup rejects invalid email", async () => {
    results([service],[queue],[]);
    const response = await request(app).get("/api/queues/advising/wait-time?userEmail=invalid");
    expect(response.status).toBe(400);
  });
  test.each([
    ["post","/queues/join",{userEmail:"test@example.com",serviceId:1}],
    ["delete","/queues/1/leave",{userEmail:"test@example.com"}],
    ["post","/queues/1/next",{}],
    ["get","/queues/1",{}],
    ["get","/queues/1/wait-time",{}],
    ["get","/queues/user/test@example.com",{}]
  ])("returns controlled error on database failure: %s %s", async (method,path,body) => {
    db.execute.mockRejectedValueOnce(new Error("Simulated database outage"));
    const response = await request(app)[method]("/api"+path).send(body);
    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.message).not.toContain("Simulated");
  });
  test("returns failure when history insert fails after join write", async () => {
    results([service],[{user_id:5}],[queue],[],[],{insertId:20});
    db.execute.mockRejectedValueOnce(new Error("History unavailable"));
    const response = await request(app).post("/api/queues/join").send({userEmail:"test@example.com",serviceId:1});
    expect(response.status).toBe(500);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes("INSERT INTO Notification"))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});


describe("Queue transaction and authorization regressions", () => {
  test.each([["anonymous", 401], ["User", 403]])("blocks %s serving without SQL", async (role, status) => {
    const r = await request(app).post("/api/queues/1/next").set("x-test-role", role);
    expect(r.status).toBe(status);
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
  test("commits a complete join and holds service/user locks on its connection", async () => {
    results([service], [{user_id:5}], [queue], [], [], {insertId:20},
      {affectedRows:1}, [], {insertId:30}, [{join_time:"2026-11-06"}]);
    const r = await request(app).post("/api/queues/join").send({userEmail:"test@example.com",serviceId:1});
    expect(r.status).toBe(201);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledWith("SELECT * FROM Service WHERE service_id = ? FOR UPDATE", [1]);
    expect(connection.execute).toHaveBeenCalledWith("SELECT user_id FROM UserCredentials WHERE email = ? FOR UPDATE", ["test@example.com"]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
  test("rolls back a join if notification insertion fails", async () => {
    results([service], [{user_id:5}], [queue], [], [], {insertId:20}, {affectedRows:1}, []);
    db.execute.mockRejectedValueOnce(new Error("Notification insert failed"));
    const r = await request(app).post("/api/queues/join").send({userEmail:"test@example.com",serviceId:1});
    expect(r.status).toBe(500);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
  test.each(["leave", "next"])("rolls back %s if history fails", async action => {
    results([service], [queue], [waiting(1,1)], {affectedRows:1});
    db.execute.mockRejectedValueOnce(new Error("History write failed"));
    const r = action === "leave"
      ? await request(app).delete("/api/queues/1/leave").send({userEmail:"student1@example.com"})
      : await request(app).post("/api/queues/1/next");
    expect(r.status).toBe(500);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
  test("releases its connection on a duplicate membership validation exit", async () => {
    results([service], [{user_id:5}], [queue], [{entry_id:1}]);
    const r = await request(app).post("/api/queues/join").send({userEmail:"test@example.com",serviceId:1});
    expect(r.status).toBe(409);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
  test("returns controlled failure if a connection cannot be acquired", async () => {
    db.getConnection.mockRejectedValueOnce(new Error("Pool unavailable"));
    const r = await request(app).post("/api/queues/join").send({userEmail:"test@example.com",serviceId:1});
    expect(r.status).toBe(500);
    expect(connection.release).not.toHaveBeenCalled();
  });
});
