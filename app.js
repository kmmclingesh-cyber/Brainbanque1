const schemas = {
  tasks: ["title", "owner", "dueDate", "priority", "status"],
  development: ["module", "owner", "stage", "targetDate", "notes"],
  clients: ["clientName", "contactPerson", "phone", "email", "status", "nextFollowUp"],
  documents: ["clientName", "documentName", "documentType", "driveUrl", "receivedDate"],
  users: ["name", "email", "role", "status"]
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
  receivedDate: "Received",
  name: "Name",
  role: "Role"
};

const rolePermissions = {
  Management: ["tasks", "development", "clients", "documents"],
  Administration: ["tasks", "clients", "documents"],
  Employee: ["tasks", "documents"],
  Developer: ["tasks", "development", "clients", "documents", "users", "developer", "settings"]
};

const defaultState = {
  tasks: [],
  development: [],
  clients: [],
  documents: [],
  users: [],
  currentUserId: "",
  settings: {
    scriptUrl: "https://script.google.com/macros/s/AKfycbyIU-9t4Q9mGdNiwRye5QzK9CuT0fxmXmjfESDu6dGm9Qgsn2TmRpMmXyadkbboYSTo/exec",
    officeName: "Brainbanque",
    syncInterval: 60000
  }
};

let state = loadState();
let activeView = "tasks";
let autoSyncTimer = null;
let isSyncing = false;

document.addEventListener("DOMContentLoaded", () => {
  ensureDeveloperAccount();
  bindAuth();
  bindNavigation();
  bindForms();
  bindSettings();
  bindActions();
  hydrateSettings();
  renderAll();
  renderAuthState();
  startAutoSync();
});

function loadState() {
  const saved = localStorage.getItem("brainbanque-office-manager");
  if (!saved) return structuredClone(defaultState);

  try {
    const parsed = JSON.parse(saved);
    const merged = { ...structuredClone(defaultState), ...parsed };
    merged.settings = { ...defaultState.settings, ...(parsed.settings || {}) };
    merged.settings.scriptUrl = merged.settings.scriptUrl || defaultState.settings.scriptUrl;
    merged.settings.syncInterval = Number(merged.settings.syncInterval) || defaultState.settings.syncInterval;
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
  if (!canAccess(viewName)) {
    viewName = firstAllowedView();
  }

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
  renderDeveloperPanel();
}

function bindForms() {
  document.querySelectorAll("[data-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const collection = form.dataset.form;
      if (!canWrite(collection)) {
        setSyncStatus("You do not have access to add records here");
        return;
      }
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
      if (collection === "users") {
        item.email = normalizeEmail(item.email);
        item.status = item.status || "Active";
        if (state.users.some((user) => normalizeEmail(user.email) === item.email)) {
          setSyncStatus("User already exists");
          return;
        }
      }
      state[collection].push(item);
      form.reset();
      saveState();
      renderTable(collection);
      renderAuthState();
      setSyncStatus("Unsynced local changes");
    });
  });
}

function bindSettings() {
  document.getElementById("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.scriptUrl = document.getElementById("scriptUrl").value.trim();
    state.settings.officeName = document.getElementById("officeName").value.trim() || "Brainbanque";
    state.settings.syncInterval = Number(document.getElementById("syncInterval").value) || 60000;
    saveState();
    setSyncStatus(state.settings.scriptUrl ? "Cloud sync ready" : "Local mode");
    startAutoSync();
  });
}

function bindActions() {
  document.getElementById("exportCsv").addEventListener("click", () => exportActiveCsv());
  document.getElementById("saveToCloud").addEventListener("click", () => saveToCloud());
  document.getElementById("syncNow").addEventListener("click", () => saveToCloud());
  document.getElementById("loadFromCloud").addEventListener("click", () => loadFromCloud());
  document.getElementById("logoutButton").addEventListener("click", logout);
  window.addEventListener("online", () => {
    setSyncStatus("Online. Auto sync resumed");
    startAutoSync();
  });
  window.addEventListener("offline", () => setSyncStatus("Offline. Auto sync paused"));
}

function hydrateSettings() {
  document.getElementById("scriptUrl").value = state.settings.scriptUrl;
  document.getElementById("officeName").value = state.settings.officeName;
  document.getElementById("syncInterval").value = String(state.settings.syncInterval);
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
  renderDeveloperPanel();
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
    if (!canWrite(collection)) return;
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
    if (!canWrite(collection)) return;
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
  if (!schemas[activeView] || !canAccess(activeView)) return;
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
  if (isSyncing) return;
  if (!state.settings.scriptUrl) {
    showView("settings");
    setSyncStatus("Add Apps Script URL first");
    return;
  }
  if (!navigator.onLine) {
    setSyncStatus("Offline. Waiting for internet");
    return;
  }

  setSyncStatus("Saving...");
  isSyncing = true;
  try {
    await callCloud("saveAll", {
      tasks: state.tasks,
      development: state.development,
      clients: state.clients,
      documents: state.documents,
      users: state.users
    });
    setSyncStatus(`Saved ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setSyncStatus("Cloud save failed");
    console.error(error);
  } finally {
    isSyncing = false;
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
    ensureDeveloperAccount();
    saveState();
    renderAll();
    renderAuthState();
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

function bindAuth() {
  document.querySelectorAll(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => showAuthTab(button.dataset.authTab));
  });

  document.getElementById("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = normalizeEmail(formData.get("email"));
    const password = String(formData.get("password"));
    const user = state.users.find((item) => normalizeEmail(item.email) === email && item.password === password && item.status !== "Disabled");

    if (!user) {
      setAuthMessage("Invalid login or disabled user.");
      return;
    }

    state.currentUserId = user.id;
    saveState();
    setAuthMessage("");
    renderAuthState();
    showView(firstAllowedView());
  });

  document.getElementById("registerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const user = Object.fromEntries(formData.entries());
    user.id = crypto.randomUUID();
    user.createdAt = new Date().toISOString();
    user.email = normalizeEmail(user.email);
    user.status = "Active";

    if (state.users.some((item) => normalizeEmail(item.email) === user.email)) {
      setAuthMessage("This email is already registered.");
      return;
    }

    state.users.push(user);
    state.currentUserId = user.id;
    saveState();
    event.currentTarget.reset();
    renderAll();
    renderAuthState();
    showView(firstAllowedView());
    setSyncStatus("New user created. Sync pending");
  });
}

function showAuthTab(tabName) {
  document.querySelectorAll(".auth-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.authTab === tabName));
  document.getElementById("loginForm").classList.toggle("is-active", tabName === "login");
  document.getElementById("registerForm").classList.toggle("is-active", tabName === "register");
  setAuthMessage("");
}

function renderAuthState() {
  const user = getCurrentUser();
  const isLoggedIn = Boolean(user);
  document.body.classList.toggle("auth-locked", !isLoggedIn);
  document.getElementById("authScreen").classList.toggle("is-active", !isLoggedIn);
  document.getElementById("currentUserLabel").textContent = user ? user.name : "Not signed in";
  document.getElementById("currentRoleLabel").textContent = user ? user.role : "Login required";

  document.querySelectorAll("[data-permission]").forEach((element) => {
    const viewName = element.dataset.view || element.dataset.permission;
    element.hidden = !canAccess(viewName);
  });

  if (isLoggedIn && !canAccess(activeView)) {
    showView(firstAllowedView());
  }
}

function logout() {
  state.currentUserId = "";
  saveState();
  renderAuthState();
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId && user.status !== "Disabled");
}

function getCurrentRole() {
  const user = getCurrentUser();
  return user ? user.role : "";
}

function canAccess(viewName) {
  const role = getCurrentRole();
  return Boolean(rolePermissions[role] && rolePermissions[role].includes(viewName));
}

function canWrite(collection) {
  return canAccess(collection) || getCurrentRole() === "Developer";
}

function firstAllowedView() {
  const role = getCurrentRole();
  return rolePermissions[role] ? rolePermissions[role][0] : "tasks";
}

function ensureDeveloperAccount() {
  if (state.users.length) return;
  state.users.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: "Developer",
    email: "developer@brainbanque.local",
    password: "admin123",
    role: "Developer",
    status: "Active"
  });
  saveState();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function setAuthMessage(message) {
  document.getElementById("authMessage").textContent = message;
}

function startAutoSync() {
  if (autoSyncTimer) window.clearInterval(autoSyncTimer);
  autoSyncTimer = window.setInterval(() => {
    if (navigator.onLine && state.settings.scriptUrl && getCurrentUser()) {
      saveToCloud();
    } else if (!navigator.onLine) {
      setSyncStatus("Offline. Auto sync paused");
    }
  }, state.settings.syncInterval);
}

function renderDeveloperPanel() {
  const metricUsers = document.getElementById("metricUsers");
  if (!metricUsers) return;

  metricUsers.textContent = state.users.length;
  document.getElementById("metricTasks").textContent = state.tasks.length;
  document.getElementById("metricClients").textContent = state.clients.length;
  document.getElementById("metricDocuments").textContent = state.documents.length;

  const overview = document.getElementById("roleOverview");
  overview.innerHTML = "";
  Object.entries(rolePermissions).forEach(([role, permissions]) => {
    const item = document.createElement("div");
    item.className = "role-item";
    item.textContent = `${role}: ${permissions.join(", ")}`;
    overview.appendChild(item);
  });
}
