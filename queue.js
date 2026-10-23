const express = require("express");
const { estimateWait } = require("./waitTime");
const { notifyQueueJoined, notifyAlmostReady } = require("./notifications");
const { createHistory, completeHistory } = require("./history");

const router = express.Router();

const services = [
  { id: "advising", name: "Academic Advising", duration: 10 },
  { id: "financial-aid", name: "Financial Aid", duration: 15 },
  { id: "registration", name: "Registration", duration: 8 },
  { id: "transcripts", name: "Transcript Request", duration: 5 },
  { id: "student-id", name: "Student ID Services", duration: 5 },
];

const queues = [];
let nextId = 1;

function validEmail(email) {
  return (
    typeof email === "string" &&
    email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function findService(id) {
  return services.find((service) => service.id === id);
}

function waitingFor(serviceId) {
  return queues.filter((entry) => entry.serviceId === serviceId);
}

function queueDetails(service) {
  return waitingFor(service.id).map((entry, index) => ({
    id: entry.id,
    userEmail: entry.userEmail,
    serviceId: entry.serviceId,
    joinedAt: entry.joinedAt,
    position: index + 1,
    estimatedWait: estimateWait(index + 1, service.duration),
  }));
}

function updateAlmostReady(service) {
  const waiting = waitingFor(service.id);

  waiting.forEach((entry, index) => {
    const position = index + 1;
    if (position <= 2 && entry.lastPosition > 2 && !entry.nearFrontNotified) {
      notifyAlmostReady(
        entry.userEmail,
        service.name,
        position,
        estimateWait(position, service.duration)
      );
      entry.nearFrontNotified = true;
    }
    entry.lastPosition = position;
  });
}

router.get("/queues/services", (req, res) => {
  res.json({
    success: true,
    services: services.map((service) => {
      const waiting = waitingFor(service.id).length;
      return {
        ...service,
        waiting,
        estimatedWait: waiting * service.duration,
      };
    }),
  });
});

router.get("/queues/user/:userEmail", (req, res) => {
  if (!validEmail(req.params.userEmail)) {
    return res.status(400).json({ success: false, message: "Enter a valid email." });
  }

  const email = req.params.userEmail.toLowerCase().trim();
  const entry = queues.find((item) => item.userEmail === email);

  if (!entry) {
    return res.status(404).json({ success: false, message: "User is not in a queue." });
  }

  const service = findService(entry.serviceId);
  const position = waitingFor(service.id).indexOf(entry) + 1;
  res.json({
    success: true,
    service,
    entry: { ...queueDetails(service)[position - 1] },
  });
});

router.post("/queues/join", (req, res) => {
  const { userEmail, serviceId } = req.body || {};

  if (!validEmail(userEmail) || typeof serviceId !== "string" || !serviceId.trim()) {
    return res.status(400).json({
      success: false,
      message: "A valid email and service ID are required.",
    });
  }

  const service = findService(serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }

  const email = userEmail.toLowerCase().trim();
  if (queues.some((entry) => entry.userEmail === email)) {
    return res.status(409).json({ success: false, message: "User is already in a queue." });
  }

  const position = waitingFor(service.id).length + 1;
  const entry = {
    id: nextId++,
    userEmail: email,
    serviceId: service.id,
    joinedAt: new Date().toISOString(),
    lastPosition: position,
    nearFrontNotified: false,
  };

  queues.push(entry);
  createHistory(email, service.name);
  notifyQueueJoined(email, service.name, position, estimateWait(position, service.duration));

  res.status(201).json({
    success: true,
    message: "Joined queue.",
    entry: queueDetails(service)[position - 1],
  });
});

router.delete("/queues/:serviceId/leave", (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }

  const { userEmail } = req.body || {};
  if (!validEmail(userEmail)) {
    return res.status(400).json({ success: false, message: "Enter a valid email." });
  }

  const email = userEmail.toLowerCase().trim();
  const index = queues.findIndex(
    (entry) => entry.userEmail === email && entry.serviceId === service.id
  );

  if (index === -1) {
    return res.status(404).json({ success: false, message: "User is not in this queue." });
  }

  queues.splice(index, 1);
  completeHistory(email, service.name, "left");
  updateAlmostReady(service);

  res.json({ success: true, message: "Left queue.", queue: queueDetails(service) });
});

router.get("/queues/:serviceId/wait-time", (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }

  let position = waitingFor(service.id).length + 1;
  if (req.query.userEmail !== undefined) {
    if (!validEmail(req.query.userEmail)) {
      return res.status(400).json({ success: false, message: "Enter a valid email." });
    }

    const email = req.query.userEmail.toLowerCase().trim();
    position = waitingFor(service.id).findIndex((entry) => entry.userEmail === email) + 1;
    if (position === 0) {
      return res.status(404).json({ success: false, message: "User is not in this queue." });
    }
  }

  res.json({
    success: true,
    serviceId: service.id,
    position,
    estimatedWait: estimateWait(position, service.duration),
  });
});

router.get("/queues/:serviceId", (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }

  res.json({ success: true, service, queue: queueDetails(service) });
});

router.post("/queues/:serviceId/next", (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: "Service not found." });
  }

  const waiting = waitingFor(service.id);
  if (!waiting.length) {
    return res.status(404).json({ success: false, message: "Queue is empty." });
  }

  const next = waiting[0];
  queues.splice(queues.indexOf(next), 1);
  completeHistory(next.userEmail, service.name, "served");
  updateAlmostReady(service);

  res.json({
    success: true,
    message: "Next user served.",
    served: { id: next.id, userEmail: next.userEmail, serviceId: service.id },
    queue: queueDetails(service),
  });
});

module.exports = router;
module.exports.queues = queues;
module.exports.services = services;
