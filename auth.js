const express = require("express");
const { db, bcrypt } = require("./database");
const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password, fullName, contactInfo } = req.body || {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof fullName !== "string" ||
    !email.trim() ||
    !password ||
    !fullName.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email, password, and full name."
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({
      success: false,
      message: "Password must be between 8 and 128 characters."
    });
  }

  if (
    contactInfo !== undefined &&
    contactInfo !== null &&
    (typeof contactInfo !== "string" || contactInfo.length > 100)
  ) {
    return res.status(400).json({
      success: false,
      message: "Contact information must be 100 characters or fewer."
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await connection.execute(
      "INSERT INTO UserCredentials (email, password, role) VALUES (?, ?, 'User')",
      [normalizedEmail, hashedPassword]
    );

    await connection.execute(
      "INSERT INTO UserProfile (user_id, full_name, contact_info) VALUES (?, ?, ?)",
      [result.insertId, fullName.trim(), contactInfo?.trim() || null]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      role: "User"
    });
  } catch (error) {
    await connection.rollback();

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
  } finally {
    connection.release();
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
