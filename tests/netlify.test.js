import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app/main.js";
import { netlifyAdapter } from "../app/netlify-adapter.js";
import { MemoryStore } from "../app/store.js";
import { getSettings } from "../app/config.js";
import { AccountService } from "../app/service.js";
test("Netlify adapter handles rewrites, JSON auth, multipart and binary responses", async () => {
  const store = new MemoryStore(),
    settings = getSettings({ APP_SECRET: "netlify-test-secret-123456789" }),
    service = new AccountService(store, settings);
  await service.createUser({
    name: "Student Test",
    email: "student@example.com",
    temporary_password: "Student!Pass1",
    role: "student",
    attempts_allowed: 1,
  });
  const app = createApp({ store, settings });
  const handler = netlifyAdapter(app);
  let r = await handler(
    new Request("https://test.netlify.app/.netlify/functions/api/health"),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
  r = await handler(
    new Request("https://test.netlify.app/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com",
        password: "Student!Pass1",
      }),
    }),
  );
  assert.equal(r.status, 200);
  const session = await r.json();
  const headers = {
    Authorization: "Bearer " + session.token,
    "X-CSRF-Token": session.csrf_token,
  };
  r = await handler(
    new Request(
      "https://test.netlify.app/.netlify/functions/api/api/v1/auth/me",
      { headers },
    ),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).user.email, "student@example.com");
  const form = new FormData();
  for (const [k, v] of Object.entries({
    submission_id: "12345678-1234-4234-8234-123456789012",
    started_at: "2026-10-28",
    time_seconds: "1",
    paste_flag: "false",
    paste_events: "0",
    writing_answer: "Yesterday I went to the park with my friends.",
    speaking_metrics: JSON.stringify(
      Array.from({ length: 3 }, () => ({
        duration: 30,
        rms: 0.1,
        silence_ratio: 0.1,
        clipping_ratio: 0,
      })),
    ),
  }))
    form.set(k, v);
  for (let n = 1; n <= 3; n++)
    form.set(
      "audio_" + n,
      new Blob(["ID3test"], { type: "audio/mpeg" }),
      "answer.mp3",
    );
  r = await handler(
    new Request("https://test.netlify.app/api/v1/student/submissions", {
      method: "POST",
      headers,
      body: form,
    }),
  );
  assert.equal(r.status, 201, await r.clone().text());
  const large = Buffer.alloc(6 * 1024 * 1024, 7);
  // Use a dedicated app so its binary route precedes the API's 404 handler.
  const { default: express } = await import("express");
  const binaryApp = express();
  binaryApp.get("/binary", (req, res) => res.type("audio/mpeg").send(large));
  r = await netlifyAdapter(binaryApp)(
    new Request("https://test.netlify.app/binary"),
  );
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), large);
});
