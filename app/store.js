import { google } from "googleapis";
import { SHEET_HEADERS } from "./constants.js";
export const cell = (v) =>
  typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v == null ? "" : String(v);
export function column(n) {
  let s = "";
  while (n) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
export function googleClients(settings) {
  const auth = new google.auth.OAuth2(
    settings.google_client_id,
    settings.google_client_secret,
  );
  auth.setCredentials({ refresh_token: settings.google_refresh_token });
  return {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
  };
}
export class MemoryStore {
  constructor() {
    this.data = Object.fromEntries(
      Object.keys(SHEET_HEADERS).map((k) => [k, []]),
    );
    this.google = false;
    this.chunks = new Map();
  }
  async all(sheet) {
    return this.data[sheet].map((r) => ({ ...r }));
  }
  async find(sheet, key, value) {
    return (await this.all(sheet)).find((r) =>
      key === "email"
        ? r[key].toLowerCase() === value.toLowerCase()
        : r[key] === value,
    );
  }
  async append(sheet, record) {
    this.data[sheet].push(
      Object.fromEntries(SHEET_HEADERS[sheet].map((h) => [h, cell(record[h])])),
    );
  }
  async appendMany(sheet, records) {
    for (const r of records) await this.append(sheet, r);
  }
  async update(sheet, key, value, changes) {
    const row = this.data[sheet].find((r) =>
      key === "email"
        ? r[key].toLowerCase() === value.toLowerCase()
        : r[key] === value,
    );
    if (!row) return false;
    for (const [k, v] of Object.entries(changes))
      if (SHEET_HEADERS[sheet].includes(k)) row[k] = cell(v);
    return true;
  }
}
export class GoogleSheetStore extends MemoryStore {
  constructor(settings) {
    super();
    this.google = true;
    this.settings = settings;
    Object.assign(this, googleClients(settings));
    this.id = settings.google_spreadsheet_id;
    this.readCache = new Map();
    this.readsInFlight = new Map();
  }
  async all(sheet) {
    const now = Date.now(),
      cached = this.readCache.get(sheet);
    if (cached && cached.expires > now)
      return cached.rows.map((row) => ({ ...row }));
    if (this.readsInFlight.has(sheet))
      return (await this.readsInFlight.get(sheet)).map((row) => ({ ...row }));
    const promise = this.readSheet(sheet);
    this.readsInFlight.set(sheet, promise);
    try {
      const rows = await promise;
      const ttl = ["Users", "Sessions"].includes(sheet) ? 3000 : 15000;
      this.readCache.set(sheet, { rows, expires: Date.now() + ttl });
      return rows.map((row) => ({ ...row }));
    } finally {
      this.readsInFlight.delete(sheet);
    }
  }
  async readSheet(sheet) {
    const headers = SHEET_HEADERS[sheet];
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.id,
      range: `'${sheet}'!A2:${column(headers.length)}`,
    });
    return (data.values || [])
      .filter((r) => r.some((v) => String(v).trim()))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, cell(r[i])])));
  }
  async append(sheet, r) {
    return this.appendMany(sheet, [r]);
  }
  async appendMany(sheet, records) {
    if (!records.length) return;
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.id,
      range: `'${sheet}'!A:${column(SHEET_HEADERS[sheet].length)}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: records.map((r) => SHEET_HEADERS[sheet].map((h) => cell(r[h]))),
      },
    });
    const cached = this.readCache.get(sheet);
    if (cached) {
      cached.rows.push(
        ...records.map((record) =>
          Object.fromEntries(
            SHEET_HEADERS[sheet].map((header) => [
              header,
              cell(record[header]),
            ]),
          ),
        ),
      );
      cached.expires =
        Date.now() + (["Users", "Sessions"].includes(sheet) ? 3000 : 15000);
    }
  }
  async update(sheet, key, value, changes) {
    const rows = await this.all(sheet);
    const i = rows.findIndex((r) =>
      key === "email"
        ? r[key].toLowerCase() === value.toLowerCase()
        : r[key] === value,
    );
    if (i < 0) return false;
    const row = { ...rows[i], ...changes };
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.id,
      range: `'${sheet}'!A${i + 2}:${column(SHEET_HEADERS[sheet].length)}${i + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_HEADERS[sheet].map((h) => cell(row[h]))] },
    });
    const cached = this.readCache.get(sheet);
    if (cached) {
      cached.rows[i] = Object.fromEntries(
        SHEET_HEADERS[sheet].map((header) => [header, cell(row[header])]),
      );
      cached.expires =
        Date.now() + (["Users", "Sessions"].includes(sheet) ? 3000 : 15000);
    }
    return true;
  }
  async setResultHyperlinks(id, urls) {
    const i = (await this.all("Results")).findIndex(
      (r) => r.submission_id === id,
    );
    if (i < 0) return;
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.id,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: urls.map((url, n) => ({
          range: `'Results'!${column(SHEET_HEADERS.Results.indexOf(`audio_${n + 1}_play`) + 1)}${i + 2}`,
          values: [
            [
              `=HYPERLINK("${url.replaceAll('"', '""')}","Play answer ${n + 1}")`,
            ],
          ],
        })),
      },
    });
  }
}
