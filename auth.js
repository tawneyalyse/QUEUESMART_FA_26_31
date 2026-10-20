const express = require("express");
const { db, bcrypt } = require("./database");
const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email and password.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters.",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    db.run(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [email.toLowerCase().trim(), hashedPassword],
      function (error) {
        if (error) {
          if (error.message.includes("UNIQUE")) {
            return res.status(409).json({
              success: false,
              message: "An account with this email already exists.",
            });
          }

          return res.status(500).json({
            success: false,
            message: "Could not create account.",
          });
        }

        res.status(201).json({
          success: true,
          message: "Registration successful.",
          role: "User",
        });
      }
    );
  } catch {
    res.status(500).json({
      success: false,
      message: "Registration failed.",
    });
  }
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Enter your email and password.",
    });
  }

  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email.toLowerCase().trim()],
    async (error, user) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "Login failed.",
        });
      }

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      res.json({
        success: true,
        message: "Login successful.",
        role: user.role,
      });
    }
  );
});

module.exports = router;
