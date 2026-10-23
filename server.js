const express = require("express");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "queuesmart-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 60 * 1000,
    },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please log in first.",
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please log in first.",
    });
  }

  if (req.session.user.role !== "Administrator") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }

  next();
}

app.locals.requireAuth = requireAuth;
app.locals.requireAdmin = requireAdmin;

// authentication routes
const authRoutes = require("./auth");
app.use("/api", authRoutes);


app.get("/api/session", (req, res) => {
  if (!req.session.user) {
    return res.json({
      success: true,
      authenticated: false,
    });
  }

  res.json({
    success: true,
    authenticated: true,
    user: {
      id: req.session.user.id,
      email: req.session.user.email,
      role: req.session.user.role,
    },
  });
});
app.get("/api/user", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.session.user,
  });
});
app.get("/api/admin", requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Administrator access granted.",
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "Could not log out.",
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      success: true,
      message: "Logout successful.",
    });
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "QueueSmart server is running.",
  });
});
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`QueueSmart server running on port ${PORT}`);
});
