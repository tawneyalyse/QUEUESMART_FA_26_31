const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const authRoutes = require("./auth");
const notificationRoutes = require("./notifications");
const historyRoutes = require("./history");
const queueRoutes = require("./queue");

app.use("/api", authRoutes);
app.use("/api", notificationRoutes);
app.use("/api", historyRoutes);
app.use("/api", queueRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "QueueSmart server is running.",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`QueueSmart server running on port ${PORT}`);
  });
}

module.exports = app;
