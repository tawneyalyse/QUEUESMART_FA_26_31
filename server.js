const express = require("express");
const session = require("express-session");
const { db } = require("./database");

const authRoutes = require("./auth");
const notificationRoutes = require("./notifications");
const historyRoutes = require("./history");
const queueRoutes = require("./queue");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "queuesmart-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  })
);

app.use(express.static(__dirname));

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please log in to access this resource."
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please log in to access this resource."
    });
  }

  if (req.session.user.role !== "Administrator") {
    return res.status(403).json({
      success: false,
      message: "Administrator access is required."
    });
  }

  next();
}

app.locals.requireAuth = requireAuth;
app.locals.requireAdmin = requireAdmin;

app.use("/api", authRoutes);
app.use("/api", notificationRoutes);
app.use("/api", historyRoutes);
app.use("/api", queueRoutes);

app.get("/api/session", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: req.session.user
  });
});

app.get("/api/user", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.session.user
  });
});

app.get("/api/admin", requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Administrator access confirmed."
  });
});

app.post("/api/logout", (req, res) => {
  if (!req.session) {
    return res.json({
      success: true,
      message: "Logged out successfully."
    });
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Could not log out."
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      success: true,
      message: "Logged out successfully."
    });
  });
});

function validateService(data) {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["Request body must be a JSON object."];
  }

  if (typeof data.serviceName !== "string" || !data.serviceName.trim()) {
    errors.push("Service name is required and must be text.");
  } else if (data.serviceName.trim().length > 100) {
    errors.push("Service name cannot exceed 100 characters.");
  }

  if (typeof data.description !== "string" || !data.description.trim()) {
    errors.push("Description is required and must be text.");
  } else if (data.description.trim().length > 500) {
    errors.push("Description cannot exceed 500 characters.");
  }

  if (!Number.isInteger(data.duration) || data.duration < 1) {
    errors.push("Duration must be a positive whole number.");
  }

  if (!["low", "medium", "high"].includes(data.priority)) {
    errors.push("Priority must be low, medium, or high.");
  }

  return errors;
}

const serviceQuery = `
  SELECT
    service_id AS id,
    service_name AS serviceName,
    description,
    expected_duration AS duration,
    priority
  FROM Service
`;

app.get("/api/services", async (req, res) => {
  try {
    const [services] = await db.execute(serviceQuery);
    res.json(services);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not retrieve services."
    });
  }
});

app.post("/api/services", async (req, res) => {
  const errors = validateService(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO Service
       (service_name, description, expected_duration, priority)
       VALUES (?, ?, ?, ?)`,
      [
        req.body.serviceName.trim(),
        req.body.description.trim(),
        req.body.duration,
        req.body.priority
      ]
    );

    const [rows] = await db.execute(
      `${serviceQuery} WHERE service_id = ?`,
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        errors: ["A service with this name already exists."]
      });
    }

    return res.status(500).json({
      success: false,
      message: "Could not create service."
    });
  }
});

app.put("/api/services/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      errors: ["Invalid service ID."]
    });
  }

  const errors = validateService(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const [result] = await db.execute(
      `UPDATE Service
       SET service_name = ?,
           description = ?,
           expected_duration = ?,
           priority = ?
       WHERE service_id = ?`,
      [
        req.body.serviceName.trim(),
        req.body.description.trim(),
        req.body.duration,
        req.body.priority,
        id
      ]
    );

    if (result.affectedRows === 0) {
      const [existing] = await db.execute(
        "SELECT service_id FROM Service WHERE service_id = ?",
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          errors: ["Service not found."]
        });
      }
    }

    const [rows] = await db.execute(
      `${serviceQuery} WHERE service_id = ?`,
      [id]
    );

    return res.json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        errors: ["A service with this name already exists."]
      });
    }

    return res.status(500).json({
      success: false,
      message: "Could not update service."
    });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    await db.execute("SELECT 1");

    res.json({
      status: "OK",
      success: true,
      database: "Connected",
      message: "QueueSmart server is running."
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      success: false,
      database: "Disconnected",
      message: "Database connection failed."
    });
  }
});

if (process.env.NODE_ENV === "test") {
  app.delete("/api/test/reset", async (req, res) => {
    try {
      await db.execute("DELETE FROM QueueEntry");
      await db.execute("DELETE FROM Queue");
      await db.execute("DELETE FROM History");
      await db.execute("DELETE FROM Notification");
      await db.execute("DELETE FROM Service");

      return res.sendStatus(204);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Could not reset test data."
      });
    }
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`QueueSmart server running on port ${PORT}`);
  });
}

module.exports = {
  app,
  validateService,
  requireAuth,
  requireAdmin
};
