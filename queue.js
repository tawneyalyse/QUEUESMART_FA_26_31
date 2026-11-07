const express = require("express");
const { db } = require("./database");
const { estimateWait } = require("./waitTime");

const router = express.Router();

const serviceAliases = {
  advising: "Academic Advising",
  "financial-aid": "Financial Aid",
  registration: "Registration",
  transcripts: "Transcript Request",
  "student-id": "Student ID Services"
};

function validEmail(email) {
  return (
    typeof email === "string" &&
    email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

// Every queue mutation locks its service row until commit. This also protects
// the first queue creation, where no Queue row exists to lock yet.
async function findService(id, connection = db, lock = false) {
  const name = serviceAliases[id];

  if (name) {
    const [rows] = await connection.execute(
      "SELECT * FROM Service WHERE service_name = ?" + (lock ? " FOR UPDATE" : ""),
      [name]
    );
    return rows[0] || null;
  }

  const [rows] = await connection.execute(
    "SELECT * FROM Service WHERE service_id = ?" + (lock ? " FOR UPDATE" : ""),
    [id]
  );

  return rows[0] || null;
}

async function getQueue(serviceId, connection = db) {
  if (connection === db) {
    const client = await db.getConnection();
    try {
      await client.beginTransaction();
      await client.execute("SELECT service_id FROM Service WHERE service_id = ? FOR UPDATE", [serviceId]);
      const queue = await getQueue(serviceId, client);
      await client.commit();
      return queue;
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  }
  const [rows] = await connection.execute(
    "SELECT * FROM Queue WHERE service_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1",
    [serviceId]
  );

  if (rows.length) return rows[0];

  const [result] = await connection.execute(
    "INSERT INTO Queue (service_id, status) VALUES (?, 'open')",
    [serviceId]
  );

  const [created] = await connection.execute(
    "SELECT * FROM Queue WHERE queue_id = ?",
    [result.insertId]
  );

  return created[0];
}

async function getWaiting(queueId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT qe.entry_id, qe.user_id, qe.position,
            qe.join_time, uc.email
     FROM QueueEntry qe
     JOIN UserCredentials uc ON qe.user_id = uc.user_id
     WHERE qe.queue_id = ? AND qe.status = 'waiting'
     ORDER BY qe.position ASC`,
    [queueId]
  );

  return rows;
}

async function queueDetails(service, queue, connection = db) {
  const waiting = await getWaiting(queue.queue_id, connection);

  return waiting.map((entry, index) => ({
    id: entry.entry_id,
    userEmail: entry.email,
    serviceId: service.service_id,
    joinedAt: entry.join_time,
    position: index + 1,
    estimatedWait: estimateWait(
      index + 1,
      service.expected_duration
    )
  }));
}

async function updatePositions(queueId, connection = db) {
  const waiting = await getWaiting(queueId, connection);

  for (let i = 0; i < waiting.length; i++) {
    await connection.execute(
      "UPDATE QueueEntry SET position = ? WHERE entry_id = ?",
      [i + 1, waiting[i].entry_id]
    );
  }
}

async function addNotification(userId, type, message, connection = db) {
  const [existing] = await connection.execute(
    `SELECT notification_id
     FROM Notification
     WHERE user_id = ?
       AND notification_type = ?
       AND message = ?
     LIMIT 1`,
    [userId, type, message]
  );

  if (existing.length) return;

  await connection.execute(
    `INSERT INTO Notification
     (user_id, notification_type, message, status)
     VALUES (?, ?, ?, 'sent')`,
    [userId, type, message]
  );
}

async function updateAlmostReady(service, queue, connection = db) {
  const waiting = await getWaiting(queue.queue_id, connection);

  for (let i = 0; i < waiting.length; i++) {
    const position = i + 1;

    if (position <= 2) {
      await addNotification(
        waiting[i].user_id,
        "almost_ready",
        `${service.service_name}: position ${position}, estimated wait ${estimateWait(position, service.expected_duration)} minutes. You are almost ready.`,
        connection
      );
    }
  }
}

router.get("/queues/services", async (req, res) => {
  try {
    const [services] = await db.execute(
      "SELECT * FROM Service"
    );

    const result = [];

    for (const service of services) {
      const queue = await getQueue(service.service_id);
      const waiting = await getWaiting(queue.queue_id);

      result.push({
        id: service.service_id,
        name: service.service_name,
        duration: service.expected_duration,
        waiting: waiting.length,
        estimatedWait: waiting.length * service.expected_duration
      });
    }

    res.json({
      success: true,
      services: result
    });
  } catch (error) {
    console.error("Get queue services error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve queue services."
    });
  }
});

router.get("/queues/user/:userEmail", async (req, res) => {
  try {
    if (!validEmail(req.params.userEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email."
      });
    }

    const [rows] = await db.execute(
      `SELECT qe.*, s.service_id, s.service_name, s.expected_duration
       FROM QueueEntry qe
       JOIN Queue q ON qe.queue_id = q.queue_id
       JOIN Service s ON q.service_id = s.service_id
       JOIN UserCredentials uc ON qe.user_id = uc.user_id
       WHERE uc.email = ? AND qe.status = 'waiting'
       ORDER BY qe.join_time DESC
       LIMIT 1`,
      [req.params.userEmail.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User is not in a queue."
      });
    }

    const entry = rows[0];

    return res.json({
      success: true,
      service: {
        id: entry.service_id,
        name: entry.service_name,
        duration: entry.expected_duration
      },
      entry: {
        id: entry.entry_id,
        userEmail: req.params.userEmail,
        position: entry.position,
        joinedAt: entry.join_time,
        estimatedWait: estimateWait(
          entry.position,
          entry.expected_duration
        )
      }
    });
  } catch (error) {
    console.error("Get user queue error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve user queue."
    });
  }
});

router.post("/queues/join", async (req, res) => {
  let connection;
  let transactionFinished = false;
  try {
    const { userEmail, serviceId } = req.body || {};

    if (!validEmail(userEmail) || !serviceId) {
      return res.status(400).json({
        success: false,
        message: "A valid email and service ID are required."
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const service = await findService(serviceId, connection, true);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found."
      });
    }

    const email = userEmail.toLowerCase().trim();

    // Serialize membership checks even when the same user joins different services.
    const [users] = await connection.execute(
      "SELECT user_id FROM UserCredentials WHERE email = ? FOR UPDATE",
      [email]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const userId = users[0].user_id;
    const queue = await getQueue(service.service_id, connection);

    const [existing] = await connection.execute(
      `SELECT entry_id FROM QueueEntry
       WHERE user_id = ? AND status = 'waiting'`,
      [userId]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "User is already in a queue."
      });
    }

    const waiting = await getWaiting(queue.queue_id, connection);
    const position = waiting.length + 1;

    const [result] = await connection.execute(
      `INSERT INTO QueueEntry
       (queue_id, user_id, position, status)
       VALUES (?, ?, ?, 'waiting')`,
      [queue.queue_id, userId, position]
    );

    await connection.execute(
      `INSERT INTO History
       (user_id, service_id, outcome)
       VALUES (?, ?, 'active')`,
      [userId, service.service_id]
    );

    await addNotification(
      userId,
      "queue_joined",
      `You joined ${service.service_name}. Position: ${position}. Estimated wait: ${estimateWait(position, service.expected_duration)} minutes.`,
      connection
    );

    const [entries] = await connection.execute(
      "SELECT join_time FROM QueueEntry WHERE entry_id = ?",
      [result.insertId]
    );

    await connection.commit();
    transactionFinished = true;
    return res.status(201).json({
      success: true,
      message: "Joined queue.",
      entry: {
        id: result.insertId,
        userEmail: email,
        serviceId: service.service_id,
        joinedAt: entries[0].join_time,
        position,
        estimatedWait: estimateWait(
          position,
          service.expected_duration
        )
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      transactionFinished = true; // Transaction ended with rollback.
    }
    console.error("Join queue error:", error);
    res.status(500).json({
      success: false,
      message: "Could not join queue."
    });
  } finally {
    if (connection) {
      try {
        if (!transactionFinished) await connection.rollback();
      } finally {
        connection.release();
      }
    }
  }
});

router.delete("/queues/:serviceId/leave", async (req, res) => {
  let connection;
  let transactionFinished = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const service = await findService(req.params.serviceId, connection, true);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found."
      });
    }

    const { userEmail } = req.body || {};

    if (!validEmail(userEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email."
      });
    }

    const email = userEmail.toLowerCase().trim();
    const queue = await getQueue(service.service_id, connection);

    const [entries] = await connection.execute(
      `SELECT qe.entry_id, qe.user_id
       FROM QueueEntry qe
       JOIN UserCredentials uc ON qe.user_id = uc.user_id
       WHERE qe.queue_id = ?
         AND uc.email = ?
         AND qe.status = 'waiting'`,
      [queue.queue_id, email]
    );

    if (!entries.length) {
      return res.status(404).json({
        success: false,
        message: "User is not in this queue."
      });
    }

    const entry = entries[0];

    await connection.execute(
      "UPDATE QueueEntry SET status = 'canceled' WHERE entry_id = ?",
      [entry.entry_id]
    );

    await connection.execute(
      `UPDATE History
       SET outcome = 'left', completed_at = CURRENT_TIMESTAMP
       WHERE user_id = ?
         AND service_id = ?
         AND outcome = 'active'
       ORDER BY history_id DESC
       LIMIT 1`,
      [entry.user_id, service.service_id]
    );

    await updatePositions(queue.queue_id, connection);
    await updateAlmostReady(service, queue, connection);

    const remaining = await queueDetails(service, queue, connection);
    await connection.commit();
    transactionFinished = true;
    return res.json({
      success: true,
      message: "Left queue.",
      queue: remaining
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      transactionFinished = true; // Transaction ended with rollback.
    }
    console.error("Leave queue error:", error);
    res.status(500).json({
      success: false,
      message: "Could not leave queue."
    });
  } finally {
    if (connection) {
      try {
        if (!transactionFinished) await connection.rollback();
      } finally {
        connection.release();
      }
    }
  }
});

router.get("/queues/:serviceId/wait-time", async (req, res) => {
  try {
    const service = await findService(req.params.serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found."
      });
    }

    const queue = await getQueue(service.service_id);
    const waiting = await getWaiting(queue.queue_id);
    let position = waiting.length + 1;

    if (req.query.userEmail !== undefined) {
      if (!validEmail(req.query.userEmail)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid email."
        });
      }

      const index = waiting.findIndex(
        entry => entry.email === req.query.userEmail.toLowerCase().trim()
      );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          message: "User is not in this queue."
        });
      }

      position = index + 1;
    }

    res.json({
      success: true,
      serviceId: service.service_id,
      position,
      estimatedWait: estimateWait(
        position,
        service.expected_duration
      )
    });
  } catch (error) {
    console.error("Wait time error:", error);
    res.status(500).json({
      success: false,
      message: "Could not calculate wait time."
    });
  }
});

router.get("/queues/:serviceId", async (req, res) => {
  try {
    const service = await findService(req.params.serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found."
      });
    }

    const queue = await getQueue(service.service_id);

    res.json({
      success: true,
      service: {
        id: service.service_id,
        name: service.service_name,
        duration: service.expected_duration
      },
      queue: await queueDetails(service, queue)
    });
  } catch (error) {
    console.error("Get queue error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve queue."
    });
  }
});

function requireQueueAdministrator(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: "Please log in." });
  }
  if (req.session.user.role !== "Administrator") {
    return res.status(403).json({ success: false, message: "Administrator access is required." });
  }
  next();
}

router.post("/queues/:serviceId/next", requireQueueAdministrator, async (req, res) => {
  let connection;
  let transactionFinished = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const service = await findService(req.params.serviceId, connection, true);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found."
      });
    }

    const queue = await getQueue(service.service_id, connection);
    const waiting = await getWaiting(queue.queue_id, connection);

    if (!waiting.length) {
      return res.status(404).json({
        success: false,
        message: "Queue is empty."
      });
    }

    const next = waiting[0];

    await connection.execute(
      "UPDATE QueueEntry SET status = 'served' WHERE entry_id = ?",
      [next.entry_id]
    );

    await connection.execute(
      `UPDATE History
       SET outcome = 'served', completed_at = CURRENT_TIMESTAMP
       WHERE user_id = ?
         AND service_id = ?
         AND outcome = 'active'
       ORDER BY history_id DESC
       LIMIT 1`,
      [next.user_id, service.service_id]
    );

    await updatePositions(queue.queue_id, connection);
    await updateAlmostReady(service, queue, connection);

    const remaining = await queueDetails(service, queue, connection);
    await connection.commit();
    transactionFinished = true;
    return res.json({
      success: true,
      message: "Next user served.",
      served: {
        id: next.entry_id,
        userEmail: next.email,
        serviceId: service.service_id
      },
      queue: remaining
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      transactionFinished = true; // Transaction ended with rollback.
    }
    console.error("Serve next user error:", error);
    res.status(500).json({
      success: false,
      message: "Could not serve next user."
    });
  } finally {
    if (connection) {
      try {
        if (!transactionFinished) await connection.rollback();
      } finally {
        connection.release();
      }
    }
  }
});

module.exports = router;
