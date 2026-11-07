import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Script } from "node:vm";
import { createSubmission, validMp3 } from "../app/submissions.js";
import { MemoryStore } from "../app/store.js";
import { AccountService } from "../app/service.js";
import { getSettings } from "../app/config.js";
test("frontend inline JavaScript parses and uses stable, chunked submission IDs", async () => {
  const html = await readFile("index.html", "utf8");
  for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    new Script(m[1]);
  assert.match(
    html,
    /state\.submissionId\s*\|\|\s*\(state\.submissionId\s*=\s*crypto\.randomUUID\(\)\)/,
  );
  assert.match(html, /\/chunks\//);
  assert.match(html, /uploaded_audio:\s*true/);
  assert.match(html, /q = CONFIG\.speaking\.questions\[i\] \|\| q/);
  assert.match(html, /function loadMp3Encoder\(\)/);
  assert.match(html, /CONFIG\.passwordMinLength \|\| 6/);
  assert.match(html, /function successView\(\) \{\s*returnToLogin\(\);/);
  assert.match(html, /addEventListener\("click", returnToLogin\)/);
  assert.doesNotMatch(html, /Thank you for completing your assessment/);
  assert.match(
    html,
    /if \(state\.openingReport \|\| document\.querySelector\("\.report-modal"\)\)\s*return/,
  );
  assert.match(html, /openReport\(id, detail\)/);
  assert.match(
    html,
    /recordings\.reduce\(\(n,\s*a\)\s*=>\s*n\s*\+\s*a\.size,\s*0\)\s*<=\s*3\.5\s*\*\s*1024\s*\*\s*1024/,
  );
  assert.match(html, /Promise\.allSettled\(\s*recordings\.map/);
  assert.match(html, /headers\.set\("X-CSRF-Token",\s*state\.csrf\)/);
  assert.match(
    html,
    /window\.SpeechRecognition\s*\|\|\s*window\.webkitSpeechRecognition/,
  );
  assert.match(html, /<textarea class="hidden" id="transcript\$\{i\}"/);
  assert.doesNotMatch(html, /Review speaking transcript/);
});
test("Google upload failure records retry job without using attempt", async () => {
  const store = new MemoryStore(),
    settings = getSettings({ APP_SECRET: "submission-test-secret-123456" }),
    service = new AccountService(store, settings);
  const created = await service.createUser({
    name: "Student One",
    email: "student@example.com",
    temporary_password: "Student!Pass1",
    role: "student",
    attempts_allowed: 1,
  });
  const user = await store.find("Users", "user_id", created.user_id);
  store.google = true;
  const req = {
    user,
    body: {
      submission_id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-10-28",
      time_seconds: 30,
      paste_flag: false,
      paste_events: 0,
      writing_answer: "Yesterday I went to the park with my friends.",
      speaking_metrics: JSON.stringify(
        Array.from({ length: 3 }, () => ({
          duration: 30,
          rms: 0.1,
          silence_ratio: 0.1,
          clipping_ratio: 0,
        })),
      ),
    },
    files: Object.fromEntries(
      [1, 2, 3].map((n) => [
        "audio_" + n,
        [{ buffer: Buffer.from("ID3test"), mimetype: "audio/mpeg" }],
      ]),
    ),
  };
  await assert.rejects(
    createSubmission(
      req,
      store,
      {
        createSubmission: async () => {
          throw new Error("Google unavailable");
        },
      },
      service,
    ),
    { status: 503 },
  );
  assert.equal((await store.all("Results")).length, 0);
  assert.equal((await store.all("Jobs")).length, 1);
  assert.equal(
    (await store.find("Users", "user_id", user.user_id)).attempts_used,
    "0",
  );
});
test("MP3 size and format checks preserve the original 6 MB limit", () => {
  assert.throws(
    () => validMp3(Buffer.alloc(6 * 1024 * 1024 + 1), "audio/mpeg", "Answer"),
    { status: 413 },
  );
  assert.throws(() => validMp3(Buffer.from("ID3test"), "audio/wav", "Answer"), {
    status: 415,
  });
  assert.throws(() => validMp3(Buffer.from("bad"), "audio/mpeg", "Answer"), {
    status: 422,
  });
  const audio = Buffer.alloc(6 * 1024 * 1024);
  audio.write("ID3");
  assert.equal(validMp3(audio, "audio/mpeg", "Answer").length, audio.length);
});

test("results rows and print list prefer teacher placement and fall back to suggested placement", async () => {
  const html = await readFile("index.html", "utf8");
  const start = html.indexOf("      function drawAdminPaneV3(tab)");
  const end = html.indexOf("      async function exportResults", start);
  assert.ok(start >= 0 && end > start);
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: "", value: "" });
    return nodes.get(selector);
  };
  const rows = [
    {
      name: "Student One",
      email: "one@example.com",
      submission_id: "one",
      total_score: 13,
      suggested_level: "A2",
      teacher_level: "B1",
    },
    {
      name: "Student Two",
      email: "two@example.com",
      submission_id: "two",
      total_score: 9,
      speaking_auto_score: 1.6,
      suggested_level: "Teacher review required",
    },
  ];
  const context = {
    document: { querySelector: node, querySelectorAll: () => [] },
    state: { adminResults: rows },
    esc: (value) => String(value ?? ""),
    exportResults() {},
    printResultList() {},
  };
  const helperStart = html.indexOf(
    "      function currentSuggestedPlacement(w, r)",
  );
  const helperEnd = html.indexOf(
    "      async function openReport",
    helperStart,
  );
  new Script(html.slice(helperStart, helperEnd)).runInNewContext(context);
  new Script(
    html.slice(start, end) + '\ndrawAdminPaneV3("responses");',
  ).runInNewContext(context);
  assert.match(node("#filteredResults").innerHTML, /Student One/);
  assert.match(node("#filteredResults").innerHTML, />B1<\/span>/);
  assert.match(node("#filteredResults").innerHTML, /Open report/);
  assert.match(node("#filteredResults").innerHTML, />Below A2<\/span>/);
  assert.doesNotMatch(
    node("#filteredResults").innerHTML,
    /Teacher review required/,
  );
  node("#levelFilter").value = "B1";
  node("#levelFilter").onchange();
  assert.match(node("#filteredResults").innerHTML, /Student One/);
  assert.doesNotMatch(node("#filteredResults").innerHTML, /Student Two/);
  node("#levelFilter").value = "Below A2";
  node("#levelFilter").onchange();
  assert.match(node("#filteredResults").innerHTML, /Student Two/);
  node("#levelFilter").value = "A2";
  node("#levelFilter").onchange();
  assert.doesNotMatch(node("#filteredResults").innerHTML, /Student One/);
  let printed = "";
  const printStart = html.indexOf("      function printResultList(rows)");
  const printEnd = html.indexOf("      function bulkAccountModal", printStart);
  new Script(
    html.slice(printStart, printEnd) + "\nprintResultList(state.adminResults);",
  ).runInNewContext({
    ...context,
    window: {
      open: () => ({
        document: {
          write: (value) => {
            printed = value;
          },
          close() {},
        },
        focus() {},
        print() {},
      }),
    },
  });
  assert.match(printed, /<td>B1<\/td>/);
  assert.match(printed, /<td>Below A2<\/td>/);
});

test("report suggestion calculates from scores even when legacy level requires review", async () => {
  const html = await readFile("index.html", "utf8");
  const start = html.indexOf("      function currentSuggestedPlacement(w, r)");
  const end = html.indexOf("      async function openReport", start);
  const context = {};
  new Script(
    html.slice(start, end) +
      '\nresult = currentSuggestedPlacement({ total: 9 }, { speaking_auto_score: 1.6, suggested_level: "Teacher review required" });',
  ).runInNewContext(context);
  assert.equal(context.result.level, "Below A2");
  assert.equal(context.result.total, 7.7);
});

test("combined mistakes table includes labelled speaking grammar and excludes transcript punctuation", async () => {
  const html = await readFile("index.html", "utf8");
  const start = html.indexOf("      function reportMistakes(w, savedErrors");
  const end = html.indexOf("      function currentSuggestedPlacement", start);
  const context = {
    w: {
      issues: [{ category: "Articles", original: "a apple" }],
      speaking_language: [
        {
          answer: 3,
          issues: [
            { category: "Tense", original: "will" },
            { category: "Punctuation", original: "," },
          ],
        },
      ],
    },
  };
  new Script(
    html.slice(start, end) + "\nresult = reportMistakes(w);",
  ).runInNewContext(context);
  assert.equal(context.result.length, 2);
  assert.equal(context.result[1].answer_section, "Speaking answer 3");
  assert.equal(context.result[1].category, "Tense");
});

test("speaking cards leave corrections in the main report table", async () => {
  const html = await readFile("index.html", "utf8");
  const start = html.indexOf(
    "      function mergeSpeakingReport(modal, detail)",
  );
  const end = html.indexOf('      document.addEventListener("click"', start);
  const source = html.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source, /<h4>Mistakes and corrections/);
  assert.doesNotMatch(source, /table class="mistakes"/);
  assert.doesNotMatch(source, /row\.remove\(\)/);
  assert.match(html, /reportMistakes\(w, x\.errors\)\.map/);
});

test("accounts have no status column or activation controls", async () => {
  const html = await readFile("index.html", "utf8");
  assert.doesNotMatch(
    html,
    /<th>Status<\/th>|data-status-user|function toggleAccount/,
  );
  assert.match(html, /Their reports and recordings will be kept/);
});
