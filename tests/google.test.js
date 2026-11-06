import test from "node:test";
import assert from "node:assert/strict";
import { GoogleSheetStore } from "../app/store.js";
import { GoogleWorkspaceArtifacts, reportHtml } from "../app/workspace.js";
import { getSettings } from "../app/config.js";
import { analyse } from "../app/checker.js";
import { speakingRecordingAssessment } from "../app/submissions.js";
const settings = getSettings({
  APP_SECRET: "google-test-secret-123456789",
  GOOGLE_SPREADSHEET_ID: "sheet",
  GOOGLE_DRIVE_FOLDER_ID: "folder",
});
test("Google Sheet adapter preserves row schema, RAW writes and hyperlinks", async () => {
  const store = new GoogleSheetStore(settings),
    calls = [];
  let rows = [["id-1", "student@example.com", "Student", "student"]];
  const values = {
    get: async (p) => {
      calls.push(["get", p]);
      return { data: { values: rows } };
    },
    append: async (p) => {
      calls.push(["append", p]);
      return { data: {} };
    },
    update: async (p) => {
      calls.push(["update", p]);
      return { data: {} };
    },
    batchUpdate: async (p) => {
      calls.push(["batchUpdate", p]);
      return { data: {} };
    },
  };
  store.sheets = { spreadsheets: { values } };
  assert.equal(
    (await store.find("Users", "email", "STUDENT@example.com")).user_id,
    "id-1",
  );
  await store.update("Users", "user_id", "id-1", {
    must_change_password: false,
    attempts_allowed: 2,
  });
  const update = calls.find(([k]) => k === "update")[1];
  assert.equal(update.valueInputOption, "RAW");
  assert.equal(update.requestBody.values[0][7], "FALSE");
  await store.append("Audit", { action: "TEST", success: true });
  assert.equal(
    calls.find(([k]) => k === "append")[1].requestBody.values[0][6],
    "TRUE",
  );
  rows = [["submission-1"]];
  await store.setResultHyperlinks("submission-1", [
    "https://drive.google.com/file/d/a/view",
  ]);
  assert.equal(
    calls.find(([k]) => k === "batchUpdate")[1].requestBody.valueInputOption,
    "USER_ENTERED",
  );
});
test("Google Sheet reads are cached and concurrent reads are deduplicated", async () => {
  const store = new GoogleSheetStore(settings);
  let reads = 0;
  store.sheets = {
    spreadsheets: {
      values: {
        get: async () => {
          reads++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { data: { values: [["id-1", "student@example.com"]] } };
        },
      },
    },
  };
  const results = await Promise.all(
    Array.from({ length: 25 }, () => store.all("Users")),
  );
  assert.equal(reads, 1);
  assert.equal(results[0][0].user_id, "id-1");
  results[0][0].user_id = "changed-locally";
  assert.equal((await store.all("Users"))[0].user_id, "id-1");
  assert.equal(reads, 1);
});
test("Drive downloads and Google Doc report content", async () => {
  const bytes = Buffer.from("test-binary"),
    drive = {
      files: {
        export: async (p) => {
          assert.equal(p.mimeType, "application/pdf");
          return { data: bytes };
        },
        get: async (p) => {
          assert.equal(p.alt, "media");
          return { data: bytes };
        },
      },
    };
  const workspace = new GoogleWorkspaceArtifacts(settings, { drive });
  assert.deepEqual(
    await workspace.exportReportPdf(
      "https://docs.google.com/document/d/doc-1/edit",
    ),
    bytes,
  );
  assert.deepEqual(
    await workspace.downloadRecording(
      "https://drive.google.com/file/d/audio-1/view",
    ),
    bytes,
  );
  await assert.rejects(workspace.exportReportPdf(""), { status: 409 });
  const report = analyse("I buyed a gift yesterday and i go to park");
  const speaking = speakingRecordingAssessment(
    Array.from({ length: 3 }, () => ({
      duration: 30,
      rms: 0.1,
      silence_ratio: 0.1,
      clipping_ratio: 0,
    })),
  );
  const html = reportHtml(
    { name: "<Student>", email: "student@example.com" },
    "<script>alert(1)</script>",
    ["", "", ""],
    report,
    speaking,
    [1, 2, 3].map((n) => ({ webViewLink: "https://drive.google.com/" + n })),
  );
  assert.match(html, /&lt;Student&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /Speaking grammar, sentences and recordings/);
  assert.match(html, /Listen to answer 3/);
});
test("chunk reconstruction reads durable Drive files in order and rejects gaps", async () => {
  const files = [];
  for (let answer = 1; answer <= 3; answer++)
    for (let index = 1; index >= 0; index--)
      files.push({
        id: `${answer}-${index}`,
        appProperties: {
          answer: String(answer),
          index: String(index),
          total: "2",
          user_id: "student-1",
        },
      });
  const drive = {
    files: {
      list: async () => ({ data: { files } }),
      get: async (p) => ({
        data: Buffer.from(p.fileId.endsWith("-0") ? "ID3start" : "end"),
      }),
    },
  };
  const workspace = new GoogleWorkspaceArtifacts(settings, { drive });
  workspace.attemptFolder = async () => "attempt-folder";
  assert.deepEqual(
    (await workspace.readChunks({ user_id: "student-1" }, "submission")).map(
      (b) => b.toString(),
    ),
    ["ID3startend", "ID3startend", "ID3startend"],
  );
  files.pop();
  await assert.rejects(
    workspace.readChunks({ user_id: "student-1" }, "submission"),
    { status: 422 },
  );
});
