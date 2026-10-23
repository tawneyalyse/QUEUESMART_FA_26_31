
"use strict";

let services = [];
const page = location.pathname.split("/").pop() || "index.html";

function getElement(id) {
  return document.getElementById(id);
}

const emptyState = () => ({
  queue: null,
  history: [],
  notifications: [],
});

let state = emptyState();
let storageAvailable = true;

try {
  const saved = JSON.parse(
    sessionStorage.getItem("queuesmart-demo") || "null"
  );

  if (
    saved &&
    Array.isArray(saved.history) &&
    Array.isArray(saved.notifications)
  ) {
    state = saved;
  }
} catch (_) {
  storageAvailable = false;
}

function feedback(message) {
  if (getElement("feedback")) {
    getElement("feedback").textContent = message;
  }
}

async function requestServices(path = "/api/services", options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const result =
    response.status === 204 ? null : await response.json();

  if (!response.ok) {
    const message =
      result && Array.isArray(result.errors)
        ? result.errors.join(" ")
        : (result && result.message) || "The service request failed.";

    throw new Error(message);
  }

  return result;
}

function normalizeService(service) {
  return {
    ...service,
    id: service.id,
    name: service.serviceName,
    ahead: Number.isInteger(service.ahead) ? service.ahead : 0,
  };
}

let renderServiceTable = null;

async function loadServices() {
  try {
    const result = await requestServices();

    if (!Array.isArray(result)) {
      throw new Error("The backend returned an invalid service list.");
    }

    services = result.map(normalizeService);

    render();

    if (renderServiceTable) {
      renderServiceTable();
    }
  } catch (error) {
    feedback(`Could not load services from the backend. ${error.message}`);
  }
}

function save() {
  if (state.queue) {
    const service = services.find(
      (s) => String(s.id) === String(state.queue.id)
    );

    if (service) {
      service.ahead = state.queue.position - 1;
    }
  }

  try {
    sessionStorage.setItem("queuesmart-demo", JSON.stringify(state));
  } catch (_) {
    storageAvailable = false;

    feedback(
      "Browser storage is unavailable. Changes will last only on this page."
    );
  }
}

function notify(message) {
  state.notifications.unshift({
    message,
    date: new Date().toISOString(),
    read: false,
  });
}

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function readableDate(date) {
  return new Date(date).toLocaleString();
}

function render() {
  if (getElement("navigation")) {
    getElement("navigation").replaceChildren();

    const studentLinks = [
      ["user_dashboard.html", "Dashboard"],
      ["join_queue.html", "Join Queue"],
      ["queue_status.html", "Queue Status"],
      ["history.html", "History"],
      ["notifications.html", "Notifications"],
      ["index.html", "Logout"],
    ];

    const adminLinks = [
      ["admin_dashboard.html", "Admin Dashboard"],
      ["service_management.html", "Service Management"],
      ["queue_management.html", "Queue Management"],
      ["admin_queue_status.html", "Admin Queue Status"],
      ["user_dashboard.html", "Student View"],
      ["index.html", "Logout"],
    ];

    if (
      !page.startsWith("admin_") &&
      !["service_management.html", "queue_management.html"].includes(page)
    ) {
      studentLinks.splice(studentLinks.length - 1, 0, [
        "admin_dashboard.html",
        "Admin View",
      ]);
    }

    const links =
      page.startsWith("admin_") ||
      ["service_management.html", "queue_management.html"].includes(page)
        ? adminLinks
        : studentLinks;

    for (const [file, label] of links) {
      const a = element("a", label);
      a.href = file;

      if (file === page) {
        a.setAttribute("aria-current", "page");
      }

      if (file === "index.html") {
        a.addEventListener("click", () => {
          try {
            sessionStorage.removeItem("queuesmart-demo");
            sessionStorage.removeItem("queuesmart-email");
          } catch (_) {}
        });
      }

      getElement("navigation").append(a);
    }
  }

  const currentQueue = state.queue;

  if (getElement("queue-summary")) {
    getElement("queue-summary").replaceChildren();

    const lines = currentQueue
      ? [
          `Service: ${currentQueue.name}`,
          `Position: ${currentQueue.position}`,
          `Estimated wait: ${
            (currentQueue.position - 1) * currentQueue.duration
          } minutes`,
          `Status: ${
            currentQueue.position <= 2 ? "Almost ready" : "Waiting"
          }`,
        ]
      : ["You are not currently in a queue."];

    lines.forEach((line) => {
      getElement("queue-summary").append(element("p", line));
    });
  }

  const unread = state.notifications.filter((n) => !n.read).length;

  if (getElement("notification-summary")) {
    getElement("notification-summary").textContent =
      `${unread} unread notification${unread === 1 ? "" : "s"}.`;
  }

  for (const id of ["notification-list", "recent-notifications"]) {
    if (!getElement(id)) continue;

    getElement(id).replaceChildren();

    const items =
      id === "recent-notifications"
        ? state.notifications.slice(0, 3)
        : state.notifications;

    if (!items.length) {
      getElement(id).append(
        element("li", "No notifications yet. Join a queue to get started.")
      );
    }

    items.forEach((n) => {
      const li = element(
        "li",
        `${n.read ? "" : "Unread: "}${n.message}`
      );

      const time = element("time", readableDate(n.date));
      time.dateTime = n.date;

      li.append(time);
      getElement(id).append(li);
    });
  }

  if (getElement("history-list")) {
    getElement("history-list").replaceChildren();

    state.history.forEach((h) => {
      const row = document.createElement("tr");

      [readableDate(h.joined), h.name, h.outcome].forEach((value) => {
        row.append(element("td", value));
      });

      getElement("history-list").append(row);
    });

    getElement("history-empty").textContent = state.history.length
      ? ""
      : "No past queues yet. Completed or left queues will appear here.";
  }

  if (getElement("services")) {
    getElement("services").replaceChildren();

    if (!services.length) {
      getElement("services").append(
        element("li", "No services are currently available.")
      );
    }

    services.forEach((s) => {
      getElement("services").append(
        element(
          "li",
          `${s.name} - Open; estimated wait ${
            s.ahead * s.duration
          } minutes`
        )
      );
    });
  }

  if (getElement("service")) {
    const select = getElement("service");
    const previousValue = select.value;

    select.replaceChildren();

    select.append(element("option", "Select a service"));
    select.options[0].value = "";

    services.forEach((s) => {
      const option = element("option", s.name);
      option.value = s.id;
      select.append(option);
    });

    if (services.some((s) => String(s.id) === previousValue)) {
      select.value = previousValue;
    }

    if (!select.dataset.listenerAdded) {
      select.addEventListener("change", () => {
        const service = services.find(
          (s) => String(s.id) === select.value
        );

        getElement("estimate").textContent = service
          ? `Estimated wait: ${
              service.ahead * service.duration
            } minutes`
          : "Select a service to see the estimated wait.";
      });

      select.dataset.listenerAdded = "true";
    }

    select.dispatchEvent(new Event("change"));
  }

  if (getElement("join-button")) {
    getElement("join-button").disabled = !!currentQueue;
  }

  for (const id of ["leave-button", "advance-button", "serve-button"]) {
    if (getElement(id)) {
      getElement(id).disabled =
        !currentQueue ||
        (id === "advance-button" && currentQueue.position === 1);
    }
  }

  if (getElement("mark-read")) {
    getElement("mark-read").disabled = unread === 0;
  }
}

function completeQueue(outcome) {
  if (!state.queue) return;

  const currentQueue = state.queue;

  state.history.unshift({
    name: currentQueue.name,
    joined: currentQueue.joined,
    outcome,
  });

  notify(
    outcome === "Served"
      ? `You were served at ${currentQueue.name}. Your visit is now in History.`
      : outcome === "Removed by admin"
        ? `An administrator removed you from the ${currentQueue.name} queue.`
        : `You left the ${currentQueue.name} queue.`
  );

  state.queue = null;
  save();
  render();

  if (storageAvailable) {
    feedback(
      outcome === "Served"
        ? "Visit completed and added to History."
        : "You left the queue. History has been updated."
    );
  }
}

if (getElement("join-form")) {
  getElement("join-form").addEventListener("submit", (event) => {
    event.preventDefault();

    if (!event.currentTarget.reportValidity()) return;

    if (state.queue) {
      feedback("Leave your current queue before joining another.");
      return;
    }

    const service = services.find(
      (s) => String(s.id) === getElement("service").value
    );

    if (!service) {
      feedback("Select a valid student service.");
      return;
    }

    state.queue = {
      ...service,
      position: service.ahead + 1,
      joined: new Date().toISOString(),
    };

    notify(
      `You joined ${service.name}. Position: ${state.queue.position}. Estimated wait: ${
        service.ahead * service.duration
      } minutes.`
    );

    save();
    render();

    if (storageAvailable) {
      feedback("You joined the queue. Open Queue Status for updates.");
    }
  });
}

if (getElement("leave-button")) {
  getElement("leave-button").addEventListener("click", () => {
    completeQueue("Left queue");
  });
}

if (getElement("serve-button")) {
  getElement("serve-button").addEventListener("click", () => {
    completeQueue("Served");
  });
}

if (getElement("advance-button")) {
  getElement("advance-button").addEventListener("click", () => {
    if (!state.queue || state.queue.position <= 1) return;

    state.queue.position--;

    const currentQueue = state.queue;

    notify(
      `${currentQueue.name}: position ${currentQueue.position}, estimated wait ${
        (currentQueue.position - 1) * currentQueue.duration
      } minutes.${currentQueue.position <= 2 ? " You are almost ready!" : ""}`
    );

    save();
    render();

    if (storageAvailable) {
      feedback("Demo queue advanced. A notification was added.");
    }
  });
}

if (getElement("mark-read")) {
  getElement("mark-read").addEventListener("click", () => {
    state.notifications.forEach((n) => {
      n.read = true;
    });

    save();
    render();

    if (storageAvailable) {
      feedback("All notifications marked as read.");
    }
  });
}

if (getElement("auth-form")) {
  getElement("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const email = getElement("email").value.trim().toLowerCase();
    const password = getElement("password").value;

    getElement("email").value = email;

    if (!form.reportValidity()) return;

    const isRegister = page === "register.html";

    try {
      const response = await fetch(
        isRegister ? "/api/register" : "/api/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        feedback(result.message || "Login or registration failed.");
        return;
      }

      location.href =
        result.role === "Administrator"
          ? "admin_dashboard.html"
          : "user_dashboard.html";
    } catch (_) {
      feedback("Could not connect to the server.");
    }
  });
}

window.QueueSmartValidation = {
  validateService(form) {
    const fields = [
      "serviceName",
      "description",
      "duration",
      "priority",
    ].map((name) => form.elements.namedItem(name));

    if (fields.some((field) => !field)) {
      throw new Error(
        "Service form requires serviceName, description, duration, and priority fields."
      );
    }

    const [name, description, duration, priority] = fields;

    fields.forEach((field) => {
      field.required = true;
      field.setCustomValidity("");
    });

    name.maxLength = 100;
    description.maxLength = 500;

    name.value = name.value.trim();
    description.value = description.value.trim();

    if (name.value.length > 100) {
      name.setCustomValidity("Use no more than 100 characters.");
    }

    if (!description.value) {
      description.setCustomValidity("Description is required.");
    } else if (description.value.length > 500) {
      description.setCustomValidity("Use no more than 500 characters.");
    }

    duration.type = "number";
    duration.min = "1";
    duration.step = "1";

    if (
      !Number.isInteger(Number(duration.value)) ||
      Number(duration.value) < 1
    ) {
      duration.setCustomValidity(
        "Enter a positive whole number of minutes."
      );
    }

    if (!["low", "medium", "high"].includes(priority.value)) {
      priority.setCustomValidity("Select low, medium, or high.");
    }

    return form.reportValidity();
  },
};

let editingServiceId = null;

if (getElement("service-form")) {
  const form = getElement("service-form");
  const list = getElement("service-list");
  const cancelButton = getElement("cancel-edit");
  const saveButton = getElement("save-service");

  function renderServices() {
    list.replaceChildren();

    getElement("empty-services").hidden = services.length > 0;

    services.forEach((service) => {
      const row = document.createElement("tr");

      [
        service.name,
        service.description || "",
        `${service.duration} minutes`,
        service.priority || "medium",
      ].forEach((value) => {
        row.append(element("td", value));
      });

      const actions = element("td", "");
      const editButton = element("button", "Edit");
      editButton.type = "button";

      editButton.addEventListener("click", () => {
        editingServiceId = service.id;

        form.elements.namedItem("serviceName").value = service.name;
        form.elements.namedItem("description").value =
          service.description || "";
        form.elements.namedItem("duration").value = service.duration;
        form.elements.namedItem("priority").value =
          service.priority || "medium";

        getElement("form-heading").textContent = "Edit Service";
        saveButton.textContent = "Update Service";
        cancelButton.hidden = false;
      });

      actions.append(editButton);
      row.append(actions);
      list.append(row);
    });
  }

  function resetServiceForm() {
    editingServiceId = null;
    form.reset();

    getElement("form-heading").textContent = "Create a Service";
    saveButton.textContent = "Create Service";
    cancelButton.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!window.QueueSmartValidation.validateService(form)) return;

    const name = form.elements.namedItem("serviceName").value.trim();
    const description = form.elements.namedItem("description").value.trim();
    const duration = Number(form.elements.namedItem("duration").value);
    const priority = form.elements.namedItem("priority").value;

    const payload = {
      serviceName: name,
      description,
      duration,
      priority,
    };

    try {
      if (editingServiceId !== null) {
        await requestServices(`/api/services/${editingServiceId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        feedback("Service updated.");
      } else {
        await requestServices("/api/services", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        feedback("Service created.");
      }

      await loadServices();
      resetServiceForm();
    } catch (error) {
      feedback(error.message);
    }
  });

  cancelButton.addEventListener("click", resetServiceForm);

  renderServiceTable = renderServices;
  renderServices();
}

render();
loadServices();

if (!storageAvailable) {
  feedback(
    "Browser storage is unavailable. Changes will last only on this page."
  );
}
