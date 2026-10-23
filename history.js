const express = require("express");

const router = express.Router();
const history = [];
let nextId = 1;

function createHistory(userEmail, serviceName) {
  const record = {
    id: nextId++,
    userEmail: userEmail.toLowerCase().trim(),
    serviceName: serviceName.trim(),
    joinedAt: new Date().toISOString(),
    completedAt: null,
    outcome: "active",
  };

  history.push(record);
  return record;
}

function completeHistory(userEmail, serviceName, outcome) {
  const record = [...history]
    .reverse()
    .find(
      (item) =>
        item.userEmail === userEmail.toLowerCase().trim() &&
        item.serviceName === serviceName.trim() &&
        item.outcome === "active"
    );

  if (!record) {
    return null;
  }

  record.outcome = outcome;
  record.completedAt = new Date().toISOString();

  return record;
}

router.post("/history", (req, res) => {
  const { userEmail, serviceName } = req.body;

  if (!userEmail || !serviceName) {
    return res.status(400).json({
      success: false,
      message: "User email and service name are required.",
    });
  }

  if (
    typeof userEmail !== "string" ||
    typeof serviceName !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "History fields must be text.",
    });
  }

  if (
    !userEmail.includes("@") ||
    userEmail.length > 254 ||
    serviceName.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid history data.",
    });
  }

  const record = createHistory(userEmail, serviceName);

  res.status(201).json({
    success: true,
    record,
  });
});

router.get("/history/:userEmail", (req, res) => {
  const userEmail = req.params.userEmail.toLowerCase().trim();

  const userHistory = history.filter(
    (record) => record.userEmail === userEmail
  );

  res.json({
    success: true,
    history: userHistory,
  });
});

router.patch("/history/:id", (req, res) => {
  const id = Number(req.params.id);
  const { outcome } = req.body;

  if (outcome !== "served" && outcome !== "left") {
    return res.status(400).json({
      success: false,
      message: "Outcome must be served or left.",
    });
  }

  const record = history.find((item) => item.id === id);

  if (!record) {
    return res.status(404).json({
      success: false,
      message: "History record not found.",
    });
  }

  record.outcome = outcome;
  record.completedAt = new Date().toISOString();

  res.json({
    success: true,
    record,
  });
});

module.exports = router;
module.exports.createHistory = createHistory;
module.exports.completeHistory = completeHistory;
module.exports.history = history;
