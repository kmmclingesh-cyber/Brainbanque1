const SHEETS = {
  tasks: ["id", "createdAt", "title", "owner", "dueDate", "priority", "status"],
  development: ["id", "createdAt", "module", "owner", "stage", "targetDate", "notes"],
  clients: ["id", "createdAt", "clientName", "contactPerson", "phone", "email", "status", "nextFollowUp"],
  documents: ["id", "createdAt", "clientName", "documentName", "documentType", "driveUrl", "receivedDate"],
  users: ["id", "createdAt", "name", "email", "password", "role", "status"]
};

// These defaults are used unless Script Properties named SPREADSHEET_ID or DRIVE_FOLDER_ID are set.
const DEFAULT_SPREADSHEET_ID = "1l9TuPj5p0s0LM-8tkF5pytBEsQscoF7mQQiOijgrhVU";
const DEFAULT_DRIVE_FOLDER_ID = "1QaJy5Zz9yDimQ1MfiRPD-Rp_HG9WNFx0";

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents);
    const action = request.action;
    const payload = request.payload || {};

    if (action === "saveAll") {
      saveAll(payload);
      return jsonResponse({ ok: true, data: { savedAt: new Date().toISOString() } });
    }

    if (action === "loadAll") {
      return jsonResponse({ ok: true, data: loadAll() });
    }

    if (action === "uploadDocument") {
      return jsonResponse({ ok: true, data: uploadDocument(payload) });
    }

    throw new Error("Unknown action: " + action);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function saveAll(payload) {
  Object.keys(SHEETS).forEach(function (key) {
    writeSheet(key, payload[key] || []);
  });
}

function loadAll() {
  const data = {};
  Object.keys(SHEETS).forEach(function (key) {
    data[key] = readSheet(key);
  });
  return data;
}

function writeSheet(key, rows) {
  const sheet = getSheet(key);
  const headers = SHEETS[key];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (!rows.length) return;

  const values = rows.map(function (row) {
    return headers.map(function (header) {
      return row[header] || "";
    });
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function readSheet(key) {
  const sheet = getSheet(key);
  const headers = SHEETS[key];
  ensureHeaders(sheet, headers);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row) {
    const item = {};
    headers.forEach(function (header, index) {
      item[header] = row[index] instanceof Date ? row[index].toISOString() : row[index];
    });
    return item;
  });
}

function uploadDocument(payload) {
  const folderId = getConfigValue("DRIVE_FOLDER_ID", DEFAULT_DRIVE_FOLDER_ID);

  const bytes = Utilities.base64Decode(payload.base64);
  const blob = Utilities.newBlob(bytes, payload.mimeType || "application/octet-stream", payload.fileName);
  const file = DriveApp.getFolderById(folderId).createFile(blob);

  return {
    fileId: file.getId(),
    name: file.getName(),
    url: file.getUrl()
  };
}

function getSheet(key) {
  const spreadsheetId = getConfigValue("SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID);

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheetName = titleCase(key);
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  ensureHeaders(sheet, SHEETS[key]);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0];
  const hasHeaders = headers.every(function (header, index) {
    return existing[index] === header;
  });

  if (!hasHeaders) range.setValues([headers]);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getConfigValue(propertyName, defaultValue) {
  return PropertiesService.getScriptProperties().getProperty(propertyName) || defaultValue;
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
