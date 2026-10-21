"use strict";
// Extends app.js: no second storage key, login system, or queue store.
let editingServiceId = null;
const activeStudent = (s) => state.queue && state.queue.id === s.id;
const waitingCount = (s) => s.ahead + (activeStudent(s) ? 1 : 0);
function adminButton(label, action, disabled = false) {
  const button = element("button", label);
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}
function adminSave(message) {
  save();
  render();
  renderAdmin();
  if (storageAvailable) feedback(message);
}
function renderAdmin() {
  if (getElement("admin-summary")) {
    getElement("admin-summary").replaceChildren(
      element("p", `Services: ${services.length}`),
      element("p", `Students waiting: ${services.reduce((total, s) => total + waitingCount(s), 0)}`),
      element("p", `Completed visits in this session: ${state.history.filter((h) => h.outcome === "Served").length}`),
    );
  }
  if (getElement("service-list")) {
    getElement("service-list").replaceChildren();
    services.forEach((s) => {
      const row = element("tr", "");
      [s.name, s.description || "Student support service", `${s.duration} minutes`, s.priority || "medium"].forEach((v) => row.append(element("td", v)));
      const actions = element("td", "");
      actions.append(adminButton(`Edit ${s.name}`, () => {
        editingServiceId = s.id;
        const form = getElement("service-form");
        form.elements.serviceName.value = s.name;
        form.elements.description.value = s.description || "Student support service";
        form.elements.duration.value = s.duration;
        form.elements.priority.value = s.priority || "medium";
        getElement("save-service").textContent = "Save Changes";
        getElement("cancel-edit").hidden = false;
        form.elements.serviceName.focus();
      }));
      row.append(actions);
      getElement("service-list").append(row);
    });
  }
  if (getElement("admin-status")) {
    getElement("admin-status").replaceChildren();
    services.forEach((s) => {
      const row = element("tr", "");
      [s.name, waitingCount(s), `${waitingCount(s) * s.duration} minutes`, activeStudent(s) ? state.queue.position : "—", waitingCount(s) ? "Waiting" : "Empty"].forEach((v) => row.append(element("td", v)));
      getElement("admin-status").append(row);
    });
  }
  if (getElement("managed-queue")) renderManagedQueue();
}
function selectedService() {
  return services.find((s) => s.id === getElement("admin-service").value);
}
function updateStudentPosition(s, position) {
  state.queue.position = position;
  s.ahead = position - 1;
  notify(`${s.name}: position ${position}, estimated wait ${(position - 1) * s.duration} minutes.${position <= 2 ? " You are almost ready!" : ""}`);
}
function renderManagedQueue() {
  const s = selectedService();
  const container = getElement("managed-queue");
  container.replaceChildren();
  getElement("serve-next").disabled = !s || waitingCount(s) === 0;
  if (!s) return;
  container.append(element("h3", s.name), element("p", `${waitingCount(s)} waiting · ${s.duration} minutes per student`));
  if (!waitingCount(s)) { container.append(element("p", "This queue is empty.")); return; }
  const list = element("ol", "");
  for (let i = 0; i < s.ahead; i++) {
    const row = element("li", `Mock student ${i + 1} `);
    row.append(adminButton(`Remove mock student ${i + 1}`, () => {
      if (activeStudent(s)) updateStudentPosition(s, state.queue.position - 1);
      else s.ahead--;
      adminSave("Mock student removed. Queue totals updated.");
    }));
    list.append(row);
  }
  if (activeStudent(s)) {
    const row = element("li", "Current student ");
    row.append(adminButton("Move up one position", () => {
      updateStudentPosition(s, state.queue.position - 1);
      adminSave("Student moved up. A notification was added.");
    }, state.queue.position === 1));
    row.append(adminButton("Remove current student", () => {
      completeQueue("Removed by admin");
      renderAdmin();
      if (storageAvailable) feedback("Student removed. Notifications and history updated.");
    }));
    list.append(row);
  }
  container.append(list);
}
function resetServiceForm() {
  editingServiceId = null;
  getElement("service-form").reset();
  getElement("save-service").textContent = "Create Service";
  getElement("cancel-edit").hidden = true;
}
if (getElement("service-form")) {
  getElement("cancel-edit").addEventListener("click", resetServiceForm);
  getElement("service-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!window.QueueSmartValidation.validateService(form)) return;
    const name = form.elements.serviceName.value;
    if (services.some((s) => s.id !== editingServiceId && s.name.toLowerCase() === name.toLowerCase())) {
      feedback("A service with this name already exists."); return;
    }
    const changes = { name, description: form.elements.description.value, duration: Number(form.elements.duration.value), priority: form.elements.priority.value };
    if (editingServiceId) {
      const s = services.find((s) => s.id === editingServiceId);
      Object.assign(s, changes);
      if (activeStudent(s)) {
        Object.assign(state.queue, changes);
        notify(`${s.name} service details updated. Estimated wait: ${(state.queue.position - 1) * s.duration} minutes.`);
      }
    } else {
      let id = `service-${Date.now()}`;
      while (services.some((s) => s.id === id)) id += "-new";
      services.push({ id, ...changes, ahead: 0 });
    }
    resetServiceForm();
    adminSave("Service saved. It is available in Student View.");
  });
}
if (getElement("admin-service")) {
  services.forEach((s) => { const option = element("option", s.name); option.value = s.id; getElement("admin-service").append(option); });
  if (state.queue) getElement("admin-service").value = state.queue.id;
  getElement("admin-service").addEventListener("change", () => { feedback(""); renderAdmin(); });
  getElement("serve-next").addEventListener("click", () => {
    const s = selectedService();
    if (!s || !waitingCount(s)) return;
    if (s.ahead > 0) {
      if (activeStudent(s)) updateStudentPosition(s, state.queue.position - 1);
      else s.ahead--;
      adminSave("Next mock student served. Queue advanced.");
    } else if (activeStudent(s)) {
      completeQueue("Served");
      renderAdmin();
    }
  });
}
renderAdmin();
