const schemas = {
  tasks: ["title", "owner", "dueDate", "priority", "status"],
  development: ["module", "owner", "stage", "targetDate", "notes"],
  clients: ["clientName", "contactPerson", "phone", "email", "status", "nextFollowUp"],
  documents: ["clientName", "documentName", "documentType", "driveUrl", "receivedDate"]
};

const labels = {
  title: "Task",
  owner: "Owner",
  dueDate: "Due Date",
  priority: "Priority",
  status: "Status",
  module: "Module",
  stage: "Stage",
  targetDate: "Target Date",
  notes: "Notes",
  clientName: "Client / Project",
  contactPerson: "Contact",
  phone: "Phone",
  email: "Email",
  nextFollowUp: "Next Follow-Up",
  documentName: "Document",
  documentType: "Type",
  driveUrl: "Drive Link",
  receivedDate: "Received"
};

const defaultState = {
  tasks: [],
  development: [],
  clients: [],
  documents: [],
  settings: {
    scriptUrl: "https://script.google.com/macros/s/AKfycbyIU-9t4Q9mGdNiwRye5QzK9CuT0fxmXmjfESDu6dGm9Qgsn2TmRpMmXyadkbboYSTo/exec",
    officeName: "Brainbanque"
  }
};

let state = loadState();
let activeView = "tasks";

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindForms();
  bindSettings();
  bindActions();
  hydrateSettings();
  renderAll();
});

function loadState() {
  const saved = localStorage.getItem("brainbanque-office-manager");
  if (!saved) return structuredClone(defaultState);

  try {
    const parsed = JSON.parse(saved);
    const merged = { ...structuredClone(defaultState), ...parsed };
    merged.settings = { ...defaultState.settings, ...(parsed.settings || {}) };
    merged.settings.scriptUrl = merged.settings.scriptUrl || defaultState.settings.scriptUrl;
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem("brainbanque-office-manager", JSON.stringify(state));
}

function bindNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

function showView(viewName) {
  activeView = viewName;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === viewName);
  });

  const view = document.getElementById(viewName);
  document.getElementById("viewTitle").textContent = view.dataset.title;
  document.getElementById("viewSubtitle").textContent = view.dataset.subtitle;
}

function bindForms() {
  document.querySelectorAll("[data-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const collection = form.dataset.form;
      const formData = new FormData(form);
      const item = Object.fromEntries(formData.entries());
      delete item.upload;

      const upload = formData.get("upload");
      if (collection === "documents" && upload && upload.size && state.settings.scriptUrl) {
        setSyncStatus("Uploading document...");
        const uploaded = await uploadDocument(upload);
        item.driveUrl = uploaded.url;
        item.documentName = item.documentName || uploaded.name;
      }

      item.id = crypto.randomUUID();
      item.createdAt = new Date().toISOString();
      state[collection].push(item);
      form.reset();
      saveState();
      renderTable(collection);
      setSyncStatus("Unsynced local changes");
    });
  });
}

function bindSettings() {
  document.getElementById("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.scriptUrl = document.getElementById("scriptUrl").value.trim();
    state.settings.officeName = document.getElementById("officeName").value.trim() || "Brainbanque";
    saveState();
    setSyncStatus(state.settings.scriptUrl ? "Cloud sync ready" : "Local mode");
  });
}

function bindActions() {
  document.getElementById("exportCsv").addEventListener("click", () => exportActiveCsv());
  document.getElementById("saveToCloud").addEventListener("click", () => saveToCloud());
  document.getElementById("syncNow").addEventListener("click", () => saveToCloud());
  document.getElementById("loadFromCloud").addEventListener("click", () => loadFromCloud());
}

function hydrateSettings() {
  document.getElementById("scriptUrl").value = state.settings.scriptUrl;
  document.getElementById("officeName").value = state.settings.officeName;
  setSyncStatus(state.settings.scriptUrl ? "Cloud sync ready" : "Local mode");
}

function renderAll() {
  Object.keys(schemas).forEach(renderTable);
}

function renderTable(collection) {
  const table = document.querySelector(`[data-table="${collection}"]`);
  const columns = schemas[collection];
  const rows = state[collection];
  table.innerHTML = "";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = labels[column] || column;
    headRow.appendChild(th);
  });
  const actionHead = document.createElement("th");
  actionHead.textContent = "Actions";
  headRow.appendChild(actionHead);
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = columns.length + 1;
    emptyCell.textContent = "No records yet.";
    emptyRow.appendChild(emptyCell);
    body.appendChild(emptyRow);
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      if (column === "driveUrl" && row[column]) {
        const link = document.createElement("a");
        link.href = row[column];
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Open";
        td.appendChild(link);
      } else if (["status", "priority", "stage"].includes(column) && row[column]) {
        const badge = document.createElement("span");
        badge.className = "status";
        badge.textContent = row[column];
        td.appendChild(badge);
      } else {
        td.textContent = row[column] || "-";
      }
      tr.appendChild(td);
    });
    tr.appendChild(createActionCell(collection, row.id));
    body.appendChild(tr);
  });

  table.appendChild(body);
}

function createActionCell(collection, id) {
  const td = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";

  const duplicate = document.createElement("button");
  duplicate.className = "icon-button";
  duplicate.type = "button";
  duplicate.title = "Duplicate";
  duplicate.textContent = "+";
  duplicate.addEventListener("click", () => {
    const item = state[collection].find((row) => row.id === id);
    state[collection].push({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    saveState();
    renderTable(collection);
  });

  const remove = document.createElement("button");
  remove.className = "icon-button delete-button";
  remove.type = "button";
  remove.title = "Delete";
  remove.textContent = "x";
  remove.addEventListener("click", () => {
    state[collection] = state[collection].filter((row) => row.id !== id);
    saveState();
    renderTable(collection);
    setSyncStatus("Unsynced local changes");
  });

  actions.append(duplicate, remove);
  td.appendChild(actions);
  return td;
}

function exportActiveCsv() {
  if (!schemas[activeView]) return;
  const columns = schemas[activeView];
  const csvRows = [columns.map((column) => labels[column] || column), ...state[activeView].map((row) => columns.map((column) => row[column] || ""))];
  const csv = csvRows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeView}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function saveToCloud() {
  if (!state.settings.scriptUrl) {
    showView("settings");
    setSyncStatus("Add Apps Script URL first");
    return;
  }

  setSyncStatus("Saving...");
  try {
    await callCloud("saveAll", {
      tasks: state.tasks,
      development: state.development,
      clients: state.clients,
      documents: state.documents
    });
    setSyncStatus(`Saved ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setSyncStatus("Cloud save failed");
    console.error(error);
  }
}

async function loadFromCloud() {
  if (!state.settings.scriptUrl) {
    setSyncStatus("Add Apps Script URL first");
    return;
  }

  setSyncStatus("Loading...");
  try {
    const data = await callCloud("loadAll", {});
    Object.keys(schemas).forEach((key) => {
      state[key] = Array.isArray(data[key]) ? data[key] : [];
    });
    saveState();
    renderAll();
    setSyncStatus(`Loaded ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setSyncStatus("Cloud load failed");
    console.error(error);
  }
}

async function callCloud(action, payload) {
  const response = await fetch(state.settings.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Cloud request failed");
  return result.data;
}

function setSyncStatus(message) {
  document.getElementById("syncStatus").textContent = message;
}

async function uploadDocument(file) {
  const base64 = await fileToBase64(file);
  return callCloud("uploadDocument", {
    fileName: file.name,
    mimeType: file.type,
    base64
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
