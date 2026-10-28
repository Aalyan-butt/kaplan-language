import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { getSettings } from "../app/config.js";
import { GoogleSheetStore } from "../app/store.js";
import { AccountService } from "../app/service.js";
import { SHEET_HEADERS } from "../app/constants.js";
import { LESSONS } from "../app/lessons.js";
import { prompt } from "./prompt.mjs";
const args = process.argv.slice(2),
  flag = (name) => args[args.indexOf(name) + 1];
let env = { ...process.env };
if (args.includes("--client-secrets")) {
  const raw = JSON.parse(await readFile(flag("--client-secrets"), "utf8")),
    client = raw.installed || raw.web;
  if (!client)
    throw new Error("Expected a Google Desktop OAuth client JSON file.");
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const redirect = `http://127.0.0.1:${server.address().port}/`,
    auth = new google.auth.OAuth2(
      client.client_id,
      client.client_secret,
      redirect,
    ),
    state = randomBytes(24).toString("hex");
  const code = new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url, redirect);
      if (url.searchParams.get("state") !== state) {
        res.writeHead(400).end("Invalid OAuth state.");
        return;
      }
      if (url.searchParams.get("error")) {
        res.end("Google authorization failed.");
        reject(new Error("Google authorization failed."));
        return;
      }
      if (!url.searchParams.get("code")) {
        res.writeHead(400).end("Missing OAuth code.");
        return;
      }
      res.end("Google connected. You can close this tab.");
      resolve(url.searchParams.get("code"));
    });
    server.setTimeout(300000);
  });
  console.log(
    "Open this URL in your browser to connect Google:\n" +
      auth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        state,
        scope: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
      }),
  );
  try {
    const { tokens } = await auth.getToken(await code);
    if (!tokens.refresh_token)
      throw new Error("No refresh token returned. Reconnect with consent.");
    env = {
      ...env,
      GOOGLE_CLIENT_ID: client.client_id,
      GOOGLE_CLIENT_SECRET: client.client_secret,
      GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
    };
  } finally {
    server.close();
  }
}
if (!env.GOOGLE_REFRESH_TOKEN)
  throw new Error(
    "Set existing Google OAuth variables or run with --client-secrets <file>.",
  );
const settings = getSettings({
  ...env,
  APP_SECRET: env.APP_SECRET || randomBytes(32).toString("hex"),
});
if (
  Boolean(settings.google_spreadsheet_id) !==
  Boolean(settings.google_drive_folder_id)
)
  throw new Error(
    "Set both existing storage IDs, or leave both empty for a new installation.",
  );
if (!settings.google_spreadsheet_id) {
  const auth = new google.auth.OAuth2(
    settings.google_client_id,
    settings.google_client_secret,
  );
  auth.setCredentials({ refresh_token: settings.google_refresh_token });
  const sheets = google.sheets({ version: "v4", auth }),
    drive = google.drive({ version: "v3", auth }),
    names = Object.keys(SHEET_HEADERS).sort(
      (a, b) =>
        Number(["Users", "Sessions"].includes(a)) -
        Number(["Users", "Sessions"].includes(b)),
    );
  const { data: sheet } = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "Kaplan English Placement Test - Master" },
      sheets: names.map((title) => ({
        properties: { title, hidden: ["Users", "Sessions"].includes(title) },
      })),
    },
  });
  settings.google_spreadsheet_id = sheet.spreadsheetId;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheet.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: Object.entries(SHEET_HEADERS).map(([name, headers]) => ({
        range: `'${name}'!A1`,
        values: [headers],
      })),
    },
  });
  const { data: folder } = await drive.files.create({
    requestBody: {
      name: "Kaplan English Placement Test",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  settings.google_drive_folder_id = folder.id;
  await drive.files.update({
    fileId: sheet.spreadsheetId,
    addParents: folder.id,
    fields: "id",
  });
  const store = new GoogleSheetStore(settings);
  await store.appendMany(
    "Lessons",
    LESSONS.map((l, i) => ({
      lesson_id: l.id,
      category: l.category,
      title: l.title,
      rule: l.rule,
      correct_examples: l.examples,
      common_mistake: l.mistake,
      display_order: i + 1,
      enabled: true,
    })),
  );
  await store.appendMany(
    "Settings",
    [
      ["school_name", "Kaplan"],
      ["language", "en-GB"],
      ["writing_prompt", "Describe a memorable day in your life."],
      ["writing_min_words", "120"],
      ["writing_max_words", "180"],
      ["level_a2_cutoff", "10"],
      ["level_b1_cutoff", "14"],
      ["level_b2_cutoff", "18"],
      ["checker_version", "rules-1.0"],
    ].map(([key, value]) => ({
      key,
      value,
      value_type: "string",
      updated_at: new Date().toISOString(),
      updated_by: "setup",
    })),
  );
  // Save secrets locally, never print them. Existing .env entries are preserved.
  let previous = "";
  try {
    previous = await readFile(".env", "utf8");
  } catch {}
  const updates = Object.fromEntries(
    [
      "app_secret",
      "google_client_id",
      "google_client_secret",
      "google_refresh_token",
      "google_spreadsheet_id",
      "google_drive_folder_id",
    ].map((k) => [k.toUpperCase(), settings[k]]),
  );
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    previous = pattern.test(previous)
      ? previous.replace(pattern, () => line)
      : previous + "\n" + line;
  }
  await writeFile(".env", previous + "\n");
  console.log(
    "Google storage created. Configuration saved in your local .env.",
  );
}
const store = new GoogleSheetStore(settings);
if (
  (await store.all("Users")).some(
    (u) => u.role === "admin" && u.status === "active",
  )
) {
  console.log(
    "Existing administrator found. Existing accounts and results were preserved.",
  );
} else {
  const email = await prompt("Administrator email: "),
    name = await prompt("Administrator name: "),
    password = await prompt("Administrator password: ", { secret: true }),
    confirmation = await prompt("Confirm password: ", { secret: true });
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const { createUser } = await import("../app/models.js");
  await new AccountService(store, settings).createUser(
    createUser.parse({
      name,
      email,
      temporary_password: password,
      role: "admin",
      attempts_allowed: 1,
    }),
  );
  console.log("Administrator created.");
}
