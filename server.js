const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "QueueSmart server is running." });
});

app.listen(PORT, () => {
  console.log(`QueueSmart server running on port ${PORT}`);
});
