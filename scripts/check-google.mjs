import { getSettings } from "../app/config.js";
import { googleClients, column } from "../app/store.js";
import { SHEET_HEADERS } from "../app/constants.js";

// Read-only: validate existing storage without exposing records or credentials.
const settings = getSettings();
if (!settings.google_ready) {
  console.error("Google configuration is incomplete.");
  process.exitCode = 1;
} else {
  try {
    const { sheets, drive } = googleClients(settings);
    const names = Object.keys(SHEET_HEADERS);
    const [headers, folder] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: settings.google_spreadsheet_id,
        ranges: names.map(
          (name) => `'${name}'!A1:${column(SHEET_HEADERS[name].length)}1`,
        ),
      }),
      drive.files.get({
        fileId: settings.google_drive_folder_id,
        fields: "mimeType,trashed,capabilities(canAddChildren)",
      }),
    ]);
    const mismatches = names.filter(
      (name, index) =>
        JSON.stringify(headers.data.valueRanges?.[index]?.values?.[0]) !==
        JSON.stringify(SHEET_HEADERS[name]),
    );
    if (mismatches.length)
      throw new Error(`Sheet headers differ: ${mismatches.join(", ")}.`);
    if (
      folder.data.trashed ||
      folder.data.mimeType !== "application/vnd.google-apps.folder"
    ) {
      throw new Error("Configured Drive location is not an active folder.");
    }
    if (!folder.data.capabilities?.canAddChildren)
      throw new Error("Google account cannot upload to the configured folder.");
    console.log(
      `Google OAuth and all ${names.length} Sheet schemas verified. Drive folder is accessible and writable. No data was changed.`,
    );
  } catch (error) {
    // Google error objects can include OAuth request configuration; never dump them.
    const ownMessage =
      error.constructor === Error && !error.code ? error.message : null;
    console.error(
      ownMessage ||
        `Google connection check failed (${error.response?.status || error.code || "connection error"}).`,
    );
    process.exitCode = 1;
  }
}
