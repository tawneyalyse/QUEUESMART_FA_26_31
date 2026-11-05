const express = require("express");
const { db, bcrypt } = require("./database");
const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body || {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email and password."
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({
      success: false,
      message: "Password must be between 8 and 128 characters."
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.execute(
      "INSERT INTO UserCredentials (email, password) VALUES (?, ?)",
      [normalizedEmail, hashedPassword]
    );

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      role: "User"
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Could not create account."
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter your email and password."
    });
  }

  try {
    const [rows] = await db.execute(
      "SELECT * FROM UserCredentials WHERE email = ?",
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "Could not establish a login session."
        });
      }

      req.session.user = {
        id: user.user_id,
        email: user.email,
        role: user.role
      };

      req.session.save((saveError) => {
        if (saveError) {
          return res.status(500).json({
            success: false,
            message: "Could not save login session."
          });
        }

        return res.json({
          success: true,
          message: "Login successful.",
          role: user.role
        });
      });
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Login failed."
    });
  }
});

module.exports = router;
