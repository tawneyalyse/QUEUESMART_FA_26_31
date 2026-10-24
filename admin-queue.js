"use strict";

const serviceSelect = document.getElementById("admin-service");
const queueContainer = document.getElementById("managed-queue");
const serveButton = document.getElementById("serve-next");
const feedbackElement = document.getElementById("feedback");

async function loadServices() {
  try {
    const response = await fetch("/api/queues/services");
    const result = await response.json();

    serviceSelect.replaceChildren();

    result.services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.name;
      serviceSelect.append(option);
    });

    if (result.services.length) {
      await loadQueue();
    }
  } catch {
    feedbackElement.textContent = "Could not load services.";
  }
}

async function loadQueue() {
  const serviceId = serviceSelect.value;

  if (!serviceId) return;

  try {
    const response = await fetch(`/api/queues/${serviceId}`);
    const result = await response.json();

    queueContainer.replaceChildren();

    if (!response.ok) {
      feedbackElement.textContent =
        result.message || "Could not load queue.";
      return;
    }

    const heading = document.createElement("h3");
    heading.textContent = result.service.name;
    queueContainer.append(heading);

    if (!result.queue.length) {
      const empty = document.createElement("p");
      empty.textContent = "No students are currently waiting.";
      queueContainer.append(empty);
      serveButton.disabled = true;
      return;
    }

    const list = document.createElement("ol");

    result.queue.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent =
        `${entry.userEmail} — Position ${entry.position} — Estimated wait ${entry.estimatedWait} minutes`;
      list.append(item);
    });

    queueContainer.append(list);
    serveButton.disabled = false;
  } catch {
    feedbackElement.textContent = "Could not load queue.";
  }
}

serviceSelect.addEventListener("change", loadQueue);

serveButton.addEventListener("click", async () => {
  const serviceId = serviceSelect.value;

  if (!serviceId) return;

  try {
    const response = await fetch(
      `/api/queues/${serviceId}/next`,
      {
        method: "POST",
      }
    );

    const result = await response.json();

    if (!response.ok) {
      feedbackElement.textContent =
        result.message || "Could not serve the next student.";
      return;
    }

    feedbackElement.textContent = "Next student served.";
    await loadQueue();
  } catch {
    feedbackElement.textContent =
      "Could not serve the next student.";
  }
});

loadServices();
