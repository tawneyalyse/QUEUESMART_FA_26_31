"use strict";

const queueForm = document.getElementById("join-form");
const emailInput = document.getElementById("userEmail");
const serviceInput = document.getElementById("service");
const estimateText = document.getElementById("estimate");
const queueSummary = document.getElementById("queue-summary");
const leaveButton = document.getElementById("leave-button");
const joinButton = document.getElementById("join-button");
const messageText = document.getElementById("feedback");
let currentEntry = null;

async function queueRequest(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not load queue information.");
  return data;
}

function showMessage(message) {
  messageText.textContent = message;
}

function showQueue(entry, service) {
  currentEntry = entry;
  queueSummary.replaceChildren();
  const lines = entry
    ? [
        `Service: ${service.name}`,
        `Position: ${entry.position}`,
        `Estimated wait: ${entry.estimatedWait} minutes`,
      ]
    : ["You are not currently in a queue."];

  lines.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    queueSummary.append(paragraph);
  });

  joinButton.disabled = !!entry;
  leaveButton.disabled = !entry;
}

async function loadServices() {
  const data = await queueRequest("/api/queues/services");
  serviceInput.replaceChildren(new Option("Select a service", ""));
  data.services.forEach((service) => {
    serviceInput.add(new Option(service.name, service.id));
  });
  return data.services;
}

async function refreshWait() {
  if (!serviceInput.value) {
    estimateText.textContent = "Select a service to see the estimated wait.";
    return;
  }

  try {
    const data = await queueRequest(`/api/queues/${serviceInput.value}/wait-time`);
    estimateText.textContent = `Estimated wait to join: ${data.estimatedWait} minutes`;
  } catch (error) {
    showMessage(error.message);
  }
}

async function loadCurrentQueue() {
  const email = emailInput.value.trim().toLowerCase();
  if (!emailInput.checkValidity() || !email) {
    showQueue(null);
    return;
  }

  const response = await fetch(`/api/queues/user/${encodeURIComponent(email)}`);
  if (response.status === 404) {
    showQueue(null);
    return;
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not load your queue.");
  showQueue(data.entry, data.service);
  serviceInput.value = data.service.id;
}

queueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!queueForm.reportValidity()) return;

  try {
    const email = emailInput.value.trim().toLowerCase();
    const data = await queueRequest("/api/queues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: email, serviceId: serviceInput.value }),
    });

    sessionStorage.setItem("queuesmart-email", email);
    const services = await loadServices();
    const service = services.find((item) => item.id === data.entry.serviceId);
    showQueue(data.entry, service);
    serviceInput.value = data.entry.serviceId;
    await refreshWait();
    showMessage("You've joined the queue.");
  } catch (error) {
    showMessage(error.message);
    await loadCurrentQueue().catch(() => {});
  }
});

leaveButton.addEventListener("click", async () => {
  if (!currentEntry) return;

  try {
    await queueRequest(`/api/queues/${currentEntry.serviceId}/leave`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: emailInput.value.trim() }),
    });
    showQueue(null);
    await loadServices();
    await refreshWait();
    showMessage("You left the queue.");
  } catch (error) {
    showMessage(error.message);
  }
});

serviceInput.addEventListener("change", refreshWait);
emailInput.addEventListener("change", async () => {
  try {
    await loadCurrentQueue();
  } catch (error) {
    showMessage(error.message);
  }
});

(async () => {
  emailInput.value = sessionStorage.getItem("queuesmart-email") || "";
  try {
    await loadServices();
    await loadCurrentQueue();
    await refreshWait();
  } catch (error) {
    showMessage(error.message);
  }
})();
