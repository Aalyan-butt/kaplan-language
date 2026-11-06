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
