"use strict";
const services = [
  { id: "advising", name: "Academic Advising", duration: 10, ahead: 3 },
  { id: "financial-aid", name: "Financial Aid", duration: 15, ahead: 4 },
  { id: "registration", name: "Registration", duration: 8, ahead: 2 },
  { id: "transcripts", name: "Transcript Request", duration: 5, ahead: 1 },
  { id: "student-id", name: "Student ID Services", duration: 5, ahead: 2 },
];
const page = location.pathname.split("/").pop() || "index.html";
function getElement(id) {
  return document.getElementById(id);
}
const emptyState = () => ({ queue: null, history: [], notifications: [] });
let state = emptyState();
let storageAvailable = true;
try {
  const saved = JSON.parse(sessionStorage.getItem("queuesmart-demo") || "null");
  if (
    saved &&
    Array.isArray(saved.history) &&
    Array.isArray(saved.notifications)
  )
    state = saved;
} catch (_) {
  storageAvailable = false;
}
// Admin service edits share the existing demo session and storage key.
if (Array.isArray(state.services)) services.splice(0, services.length, ...state.services);
function feedback(message) {
  if (getElement("feedback")) getElement("feedback").textContent = message;
}
function save() {
  if (state.queue) {
    const service = services.find((s) => s.id === state.queue.id);
    if (service) service.ahead = state.queue.position - 1;
  }
  state.services = services;
  try {
    sessionStorage.setItem("queuesmart-demo", JSON.stringify(state));
  } catch (_) {
    storageAvailable = false;
    feedback(
      "Browser storage is unavailable. Changes will last only on this page.",
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
    if (!page.startsWith("admin_") && !["service_management.html", "queue_management.html"].includes(page))
      studentLinks.splice(studentLinks.length - 1, 0, ["admin_dashboard.html", "Admin View"]);
    for (const [file, label] of (page.startsWith("admin_") || ["service_management.html", "queue_management.html"].includes(page) ? adminLinks : studentLinks)) {
      const a = element("a", label);
      a.href = file;
      if (file === page) a.setAttribute("aria-current", "page");
      if (file === "index.html")
        a.addEventListener("click", () => {
          try {
            sessionStorage.removeItem("queuesmart-demo");
            sessionStorage.removeItem("queuesmart-email");
          } catch (_) {}
        });
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
          `Estimated wait: ${(currentQueue.position - 1) * currentQueue.duration} minutes`,
          `Status: ${currentQueue.position <= 2 ? "Almost ready" : "Waiting"}`,
        ]
      : ["You are not currently in a queue."];
    lines.forEach((line) =>
      getElement("queue-summary").append(element("p", line)),
    );
  }
  const unread = state.notifications.filter((n) => !n.read).length;
  if (getElement("notification-summary"))
    getElement("notification-summary").textContent =
      `${unread} unread notification${unread === 1 ? "" : "s"}.`;
  for (const id of ["notification-list", "recent-notifications"]) {
    if (!getElement(id)) continue;
    getElement(id).replaceChildren();
    const items =
      id === "recent-notifications"
        ? state.notifications.slice(0, 3)
        : state.notifications;
    if (!items.length)
      getElement(id).append(
        element("li", "No notifications yet. Join a queue to get started."),
      );
    items.forEach((n) => {
      const li = element("li", `${n.read ? "" : "Unread: "}${n.message}`);
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
      [readableDate(h.joined), h.name, h.outcome].forEach((value) =>
        row.append(element("td", value)),
      );
      getElement("history-list").append(row);
    });
    getElement("history-empty").textContent = state.history.length
      ? ""
      : "No past queues yet. Completed or left queues will appear here.";
  }
  if (getElement("join-button"))
    getElement("join-button").disabled = !!currentQueue;
  for (const id of ["leave-button", "advance-button", "serve-button"])
    if (getElement(id))
      getElement(id).disabled =
        !currentQueue ||
        (id === "advance-button" && currentQueue.position === 1);
  if (getElement("mark-read")) getElement("mark-read").disabled = unread === 0;
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
        : `You left the ${currentQueue.name} queue.`,
  );
  state.queue = null;
  save();
  render();
  if (storageAvailable)
    feedback(
      outcome === "Served"
        ? "Visit completed and added to History."
        : "You left the queue. History has been updated.",
    );
}
if (getElement("services"))
  services.forEach((s) =>
    getElement("services").append(
      element(
        "li",
        `${s.name} — Open · estimated wait ${s.ahead * s.duration} minutes`,
      ),
    ),
  );
if (getElement("service")) {
  services.forEach((s) => {
    const option = element("option", s.name);
    option.value = s.id;
    getElement("service").append(option);
  });
  getElement("service").addEventListener("change", () => {
    const s = services.find((s) => s.id === getElement("service").value);
    getElement("estimate").textContent = s
      ? `Estimated wait: ${s.ahead * s.duration} minutes`
      : "Select a service to see the estimated wait.";
  });
}
if (getElement("join-form"))
  getElement("join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (state.queue) {
      feedback("Leave your current queue before joining another.");
      return;
    }
    const s = services.find((s) => s.id === getElement("service").value);
    if (!s) {
      feedback("Select a valid student service.");
      return;
    }
    state.queue = {
      ...s,
      position: s.ahead + 1,
      joined: new Date().toISOString(),
    };
    notify(
      `You joined ${s.name}. Position: ${state.queue.position}. Estimated wait: ${s.ahead * s.duration} minutes.`,
    );
    save();
    render();
    if (storageAvailable)
      feedback("You joined the queue. Open Queue Status for updates.");
  });
if (getElement("leave-button"))
  getElement("leave-button").addEventListener("click", () =>
    completeQueue("Left queue"),
  );
if (getElement("serve-button"))
  getElement("serve-button").addEventListener("click", () =>
    completeQueue("Served"),
  );
if (getElement("advance-button"))
  getElement("advance-button").addEventListener("click", () => {
    if (!state.queue || state.queue.position <= 1) return;
    state.queue.position--;
    const currentQueue = state.queue;
    notify(
      `${currentQueue.name}: position ${currentQueue.position}, estimated wait ${(currentQueue.position - 1) * currentQueue.duration} minutes.${currentQueue.position <= 2 ? " You are almost ready!" : ""}`,
    );
    save();
    render();
    if (storageAvailable)
      feedback("Demo queue advanced. A notification was added.");
  });
if (getElement("mark-read"))
  getElement("mark-read").addEventListener("click", () => {
    state.notifications.forEach((n) => (n.read = true));
    save();
    render();
    if (storageAvailable) feedback("All notifications marked as read.");
  });
if (getElement("auth-form"))
  getElement("auth-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    getElement("email").value = getElement("email").value.trim();
    if (!form.reportValidity()) return;
    if (page === "register.html") {
      form.reset();
      feedback(
        "Demo registration validated. You can now go to Login; no account or password was saved.",
      );
      return;
    }
    try {
      const email = getElement("email").value.toLowerCase();
      if (sessionStorage.getItem("queuesmart-email") !== email)
        sessionStorage.removeItem("queuesmart-demo");
      sessionStorage.setItem("queuesmart-email", email);
    } catch (_) {}
    location.href = "user_dashboard.html";
  });
window.QueueSmartValidation = {
  validateService(form) {
    const fields = ["serviceName", "description", "duration", "priority"].map(
      (name) => form.elements.namedItem(name),
    );
    if (fields.some((field) => !field))
      throw new Error(
        "Service form requires serviceName, description, duration, and priority fields.",
      );
    const [name, description, duration, priority] = fields;
    fields.forEach((field) => {
      field.required = true;
      field.setCustomValidity("");
    });
    name.maxLength = 100;
    name.value = name.value.trim();
    description.value = description.value.trim();
    if (name.value.length > 100)
      name.setCustomValidity("Use no more than 100 characters.");
    duration.type = "number";
    duration.min = "1";
    duration.step = "1";
    if (!Number.isInteger(Number(duration.value)) || Number(duration.value) < 1)
      duration.setCustomValidity("Enter a positive whole number of minutes.");
    if (!["low", "medium", "high"].includes(priority.value))
      priority.setCustomValidity("Select low, medium, or high.");
    return form.reportValidity();
  },
};
render();
if (!storageAvailable)
  feedback(
    "Browser storage is unavailable. Changes will last only on this page.",
  );
