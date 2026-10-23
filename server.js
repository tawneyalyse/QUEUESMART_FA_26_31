const express = require("express");
const session = require("express-session");

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
    return res.json({
      authenticated: false
    });
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

let services = [];
let nextId = 1;

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

app.get("/api/services", (req, res) => {
  res.json(services);
});

app.post("/api/services", (req, res) => {
  const errors = validateService(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const name = req.body.serviceName.trim();

  if (
    services.some(
      (service) =>
        service.serviceName.toLowerCase() === name.toLowerCase()
    )
  ) {
    return res.status(409).json({
      errors: ["A service with this name already exists."]
    });
  }

  const service = {
    id: nextId++,
    serviceName: name,
    description: req.body.description.trim(),
    duration: req.body.duration,
    priority: req.body.priority
  };

  services.push(service);

  return res.status(201).json(service);
});

app.put("/api/services/:id", (req, res) => {
  const id = Number(req.params.id);

  const index = services.findIndex(
    (service) => service.id === id
  );

  if (index === -1) {
    return res.status(404).json({
      errors: ["Service not found."]
    });
  }

  const errors = validateService(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const name = req.body.serviceName.trim();

  if (
    services.some(
      (service) =>
        service.id !== id &&
        service.serviceName.toLowerCase() === name.toLowerCase()
    )
  ) {
    return res.status(409).json({
      errors: ["A service with this name already exists."]
    });
  }

  services[index] = {
    id,
    serviceName: name,
    description: req.body.description.trim(),
    duration: req.body.duration,
    priority: req.body.priority
  };

  return res.json(services[index]);
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    success: true,
    message: "QueueSmart server is running."
  });
});

if (process.env.NODE_ENV === "test") {
  app.delete("/api/test/reset", (req, res) => {
    services = [];
    nextId = 1;

    return res.sendStatus(204);
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
