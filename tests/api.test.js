import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../app/main.js";
import { MemoryStore } from "../app/store.js";
import { AccountService } from "../app/service.js";
import { getSettings } from "../app/config.js";
import {
  passwordValid,
  passwordHash,
  rehashRequired,
  strength,
} from "../app/security.js";
const settings = getSettings({
  APP_SECRET: "test-secret-that-is-long-enough",
  FRONTEND_ORIGIN: "https://school.example",
});
const metrics = Array.from({ length: 3 }, () => ({
  duration: 30,
  rms: 0.08,
  silence_ratio: 0.2,
  clipping_ratio: 0.001,
}));
async function fixture(t, options = {}) {
  const store = new MemoryStore(),
    svc = new AccountService(store, settings);
  await svc.createUser({
    name: "Main Admin",
    email: "admin@example.com",
    temporary_password: "Strong!Pass1",
    role: "admin",
    attempts_allowed: 1,
  });
  await svc.createUser({
    name: "Student One",
    email: "student@example.com",
    temporary_password: "Student!Pass1",
    role: "student",
    attempts_allowed: 1,
  });
  const server = createApp({ store, settings, ...options }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (
    path,
    { method = "GET", headers = {}, json, body } = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...headers,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body: json ? JSON.stringify(json) : body,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: response.status, headers: response.headers, data, text };
  };
  const login = async (
    email = "admin@example.com",
    password = "Strong!Pass1",
  ) => {
    const r = await request("/api/v1/auth/login", {
      method: "POST",
      json: { email, password },
    });
    assert.equal(r.status, 200, r.text);
    return {
      Authorization: "Bearer " + r.data.token,
      "X-CSRF-Token": r.data.csrf_token,
    };
  };
  return { store, svc, request, login };
}
const payload = (id) => ({
  submission_id: id,
  started_at: "2026-10-28T10:00:00Z",
  time_seconds: 300,
  paste_flag: false,
  paste_events: 0,
  writing_answer:
    "Yesterday I went to the park with my family because we were happy to celebrate a memorable day.",
  speaking_metrics: JSON.stringify(metrics),
});
const multipart = (p) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(p)) form.set(k, String(v));
  for (let n = 1; n <= 3; n++)
    form.set(
      `audio_${n}`,
      new Blob([Buffer.from("ID3test-mp3")], { type: "audio/mpeg" }),
      `answer-${n}.mp3`,
    );
  return form;
};
test("auth, CSRF, role checks, public fields and logout", async (t) => {
  const { request, login, store } = await fixture(t),
    admin = await login(),
    student = await login("student@example.com", "Student!Pass1");
  assert.equal((await request("/api/v1/admin/users")).status, 401);
  assert.equal(
    (
      await request("/api/v1/admin/users", {
        headers: { Authorization: admin.Authorization },
      })
    ).status,
    403,
  );
  for (const path of [
    "/api/v1/admin/users",
    "/api/v1/admin/results",
    "/api/v1/admin/exports/results.csv",
  ])
    assert.equal((await request(path, { headers: student })).status, 403);
  const users = await request("/api/v1/admin/users", { headers: admin });
  assert.equal(users.status, 200);
  assert.ok(
    users.data.users.every(
      (u) => !("password_hash" in u) && !("password_salt" in u),
    ),
  );
  const sessions = await store.all("Sessions");
  assert.ok(sessions.every((s) => s.token_hash.length === 64));
  assert.equal(
    (await request("/api/v1/auth/logout", { method: "POST", headers: admin }))
      .status,
    200,
  );
  assert.equal(
    (await request("/api/v1/auth/me", { headers: admin })).status,
    401,
  );
});
test("student lockout leaves administrators and other users usable", async (t) => {
  const { request, login } = await fixture(t);
  for (let i = 0; i < 5; i++)
    for (const email of ["admin@example.com", "student@example.com"])
      assert.equal(
        (
          await request("/api/v1/auth/login", {
            method: "POST",
            json: { email, password: "wrong" },
          })
        ).status,
        401,
      );
  await login();
  const locked = await request("/api/v1/auth/login", {
    method: "POST",
    json: { email: "student@example.com", password: "Student!Pass1" },
  });
  assert.equal(locked.status, 423);
  assert.match(locked.data.error.message, /Other accounts/);
});
test("account creation, bulk rejection, update, status, attempts and reset", async (t) => {
  const { request, login } = await fixture(t),
    headers = await login();
  const create = await request("/api/v1/admin/users", {
    method: "POST",
    headers,
    json: {
      name: "New Student",
      email: "new@example.com",
      temporary_password: "Student!Pass1",
    },
  });
  assert.equal(create.status, 201, create.text);
  const id = create.data.user.user_id;
  assert.equal(create.data.user.must_change_password, false);
  const bulk = await request("/api/v1/admin/users/bulk", {
    method: "POST",
    headers,
    json: {
      users: [
        {
          name: "Other Student",
          email: "other@example.com",
          temporary_password: "Student!Pass1",
        },
        {
          name: "Duplicate Student",
          email: "new@example.com",
          temporary_password: "Student!Pass1",
        },
      ],
    },
  });
  assert.equal(bulk.status, 201);
  assert.equal(bulk.data.created.length, 1);
  assert.equal(bulk.data.rejected.length, 1);
  const path = "/api/v1/admin/users/" + id;
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        headers,
        json: { name: "Updated Name", email: "updated@example.com" },
      })
    ).data.user.name,
    "Updated Name",
  );
  assert.equal(
    (
      await request(path + "/attempts", {
        method: "PATCH",
        headers,
        json: { attempts_allowed: 3 },
      })
    ).status,
    200,
  );
  const oldSession = await login("updated@example.com", "Student!Pass1");
  assert.equal(
    (
      await request(path + "/password", {
        method: "PATCH",
        headers,
        json: { temporary_password: "ResetStrong!Pass2" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/v1/auth/me", { headers: oldSession })).status,
    401,
  );
  await login("updated@example.com", "ResetStrong!Pass2");
  assert.equal(
    (
      await request(path + "/status", {
        method: "PATCH",
        headers,
        json: { status: "disabled" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/v1/auth/login", {
        method: "POST",
        json: { email: "updated@example.com", password: "ResetStrong!Pass2" },
      })
    ).status,
    403,
  );
  const me = await request("/api/v1/auth/me", { headers });
  assert.equal(
    (
      await request("/api/v1/admin/users/" + me.data.user.user_id + "/status", {
        method: "PATCH",
        headers,
        json: { status: "disabled" },
      })
    ).status,
    400,
  );
});
test("password change revokes other sessions and preserves the current session", async (t) => {
  const { request, login } = await fixture(t),
    first = await login(),
    second = await login();
  assert.equal(
    (
      await request("/api/v1/auth/change-password", {
        method: "POST",
        headers: first,
        json: {
          current_password: "Strong!Pass1",
          new_password: "NewStrong!Pass2",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/v1/auth/me", { headers: first })).status,
    200,
  );
  assert.equal(
    (await request("/api/v1/auth/me", { headers: second })).status,
    401,
  );
  await login("admin@example.com", "NewStrong!Pass2");
});
test("multipart submission, reports, overrides, CSV and idempotent retry", async (t) => {
  const { request, login, store } = await fixture(t),
    headers = await login("student@example.com", "Student!Pass1"),
    id = randomUUID(),
    p = payload(id);
  const saved = await request("/api/v1/student/submissions", {
    method: "POST",
    headers,
    body: multipart(p),
  });
  assert.equal(saved.status, 201, saved.text);
  assert.equal(saved.data.duplicate, false);
  assert.equal(
    (
      await request("/api/v1/student/submissions", {
        method: "POST",
        headers,
        body: multipart(p),
      })
    ).data.duplicate,
    true,
  );
  assert.equal(
    (
      await request("/api/v1/student/submissions", {
        method: "POST",
        headers,
        body: multipart(payload(randomUUID())),
      })
    ).status,
    409,
  );
  assert.equal(
    (await store.all("Users")).find((u) => u.role === "student").attempts_used,
    "1",
  );
  const admin = await login();
  const detail = await request("/api/v1/admin/results/" + id, {
    headers: admin,
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.data.report.writing.speaking_recording.answers.length, 3);
  const list = await request("/api/v1/admin/results", { headers: admin });
  assert.ok(!("writing_answer" in list.data.results[0]));
  await store.update("Results", "submission_id", id, {
    writing_answer: "=DANGEROUS()",
  });
  assert.equal(
    (
      await request("/api/v1/admin/results/" + id + "/override", {
        method: "PATCH",
        headers: admin,
        json: { teacher_level: "B1", teacher_notes: "Confirmed manually." },
      })
    ).status,
    200,
  );
  const csv = await request("/api/v1/admin/exports/results.csv", {
    headers: admin,
  });
  assert.equal(csv.status, 200);
  assert.match(csv.text, /'=DANGEROUS\(\)/);
  assert.equal(
    (await request("/api/v1/admin/results/" + id + "/pdf", { headers: admin }))
      .status,
    200,
  );
  assert.equal(
    (
      await request("/api/v1/admin/results/" + id + "/audio/1", {
        headers: admin,
      })
    ).status,
    409,
  );
});
test("chunked upload survives separate requests, supports retry and enforces ownership", async (t) => {
  const { request, login, svc, store } = await fixture(t),
    headers = await login("student@example.com", "Student!Pass1"),
    id = randomUUID();
  for (let n = 1; n <= 3; n++) {
    for (let index = 0; index < 2; index++) {
      const bytes = index === 0 ? "ID3start" : "end";
      const r = await request(
        `/api/v1/student/submissions/${id}/audio/${n}/chunks/${index}`,
        {
          method: "POST",
          headers,
          json: { total: 2, content: Buffer.from(bytes).toString("base64") },
        },
      );
      assert.equal(r.status, 200, r.text);
    }
  }
  const saved = await request("/api/v1/student/submissions", {
    method: "POST",
    headers,
    json: { ...payload(id), uploaded_audio: true },
  });
  assert.equal(saved.status, 201, saved.text);
  assert.equal(store.recordings.get(id)[0].toString(), "ID3startend");
  await svc.createUser({
    name: "Other Student",
    email: "other@example.com",
    temporary_password: "Student!Pass1",
    role: "student",
    attempts_allowed: 1,
  });
  const other = await login("other@example.com", "Student!Pass1");
  assert.equal(
    (
      await request("/api/v1/student/submissions", {
        method: "POST",
        headers: other,
        json: { ...payload(id), uploaded_audio: true },
      })
    ).status,
    409,
  );
});
test("validation rejects invalid input and uploads before consuming attempts", async (t) => {
  const { request, login, store } = await fixture(t),
    headers = await login("student@example.com", "Student!Pass1");
  assert.equal(
    (
      await request("/api/v1/auth/login", {
        method: "POST",
        json: { email: "bad", password: "a" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/api/v1/student/submissions", {
        method: "POST",
        headers,
        json: { ...payload(randomUUID()), uploaded_audio: true },
      })
    ).status,
    422,
  );
  const form = multipart(payload(randomUUID()));
  form.set("audio_1", new Blob(["not mp3"], { type: "audio/mpeg" }), "bad.mp3");
  assert.equal(
    (
      await request("/api/v1/student/submissions", {
        method: "POST",
        headers,
        body: form,
      })
    ).status,
    422,
  );
  const form2 = multipart({
    ...payload(randomUUID()),
    speaking_metrics: "[{}, {}, {}]",
  });
  assert.equal(
    (
      await request("/api/v1/student/submissions", {
        method: "POST",
        headers,
        body: form2,
      })
    ).status,
    422,
  );
  assert.equal(
    (await store.find("Users", "email", "student@example.com")).attempts_used,
    "0",
  );
});
test("security headers, CORS, static allowlist, expiry and disabled users", async (t) => {
  const { request, login, store } = await fixture(t);
  const health = await request("/health", {
    headers: { Origin: "https://school.example", "X-Request-ID": "test-id" },
  });
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  assert.equal(health.headers.get("x-request-id"), "test-id");
  assert.equal(
    health.headers.get("access-control-allow-origin"),
    "https://school.example",
  );
  assert.equal((await request("/.env")).status, 404);
  const headers = await login();
  const s = (await store.all("Sessions"))[0];
  await store.update("Sessions", "session_id", s.session_id, {
    expires_at: "2020-01-01T00:00:00Z",
  });
  assert.equal((await request("/api/v1/auth/me", { headers })).status, 401);
});
test("Argon2 hashes retain the original parameters and verify correctly", async () => {
  const hash = await passwordHash("Migration!Pass123");
  assert.match(hash, /^\$argon2id\$v=19\$m=65536,t=3,p=2\$/);
  assert.equal(rehashRequired(hash), false);
  assert.equal(await passwordValid(hash, "Migration!Pass123"), true);
  assert.equal(await passwordValid(hash, "wrong-password"), false);
});
test("password policy requires only a minimum of six characters", () => {
  assert.doesNotThrow(() => strength("abcdef"));
  assert.doesNotThrow(() => strength("123456"));
  assert.throws(() => strength("abcde"), {
    status: 422,
    message: "Password must contain 6 to 128 characters.",
  });
});
test("Google network failures return a safe, actionable error", async (t) => {
  const { store, request } = await fixture(t);
  store.find = async () => {
    throw Object.assign(
      new Error("Sensitive internal Google request details"),
      { code: "EACCES" },
    );
  };
  const result = await request("/api/v1/auth/login", {
    method: "POST",
    json: { email: "admin@example.com", password: "Strong!Pass1" },
  });
  assert.equal(result.status, 503);
  assert.match(result.data.error.message, /cannot connect to storage/);
  assert.ok(!result.text.includes("Sensitive internal"));
});
test("Google quota failures return a safe retry response", async (t) => {
  const { store, request } = await fixture(t);
  store.find = async () => {
    throw new Error("Quota exceeded for quota metric Read requests");
  };
  const result = await request("/api/v1/auth/login", {
    method: "POST",
    json: { email: "admin@example.com", password: "Strong!Pass1" },
  });
  assert.equal(result.status, 429);
  assert.equal(result.headers.get("retry-after"), "10");
  assert.match(result.data.error.message, /temporarily busy/i);
  assert.ok(!result.text.includes("quota metric"));
});
test("PDF download enforces verification and returns a valid PDF response", async (t) => {
  const pdf = Buffer.from("%PDF-1.7\ntest");
  const { store, request, login } = await fixture(t, {
    workspace: { exportReportPdf: async () => pdf },
  });
  const id = randomUUID();
  await store.append("Results", {
    submission_id: id,
    name: "Test Student",
    doc_url: "https://docs.google.com/document/d/test/edit",
  });
  const headers = await login();
  assert.equal(
    (
      await request("/api/v1/admin/results/" + id + "/pdf", {
        headers: { Authorization: headers.Authorization },
      })
    ).status,
    403,
  );
  const result = await request("/api/v1/admin/results/" + id + "/pdf", {
    headers,
  });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /application\/pdf/);
  assert.match(result.text, /^%PDF-/);
});

test("admin deletion removes accounts and report dependencies", async (t) => {
  const { request, login, store } = await fixture(t);
  const admin = await login();
  const student = await login("student@example.com", "Student!Pass1");
  const account = await store.find("Users", "email", "student@example.com");
  await store.append("Results", {
    submission_id: "delete-me",
    user_id: account.user_id,
  });
  await store.append("Errors", { error_id: "e", submission_id: "delete-me" });
  assert.equal(
    (
      await request("/api/v1/admin/results/delete-me", {
        method: "DELETE",
        headers: student,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/v1/admin/results/delete-me", {
        method: "DELETE",
        headers: admin,
      })
    ).status,
    200,
  );
  assert.equal((await store.all("Errors")).length, 0);
  assert.equal(
    (
      await request("/api/v1/admin/users/" + account.user_id, {
        method: "DELETE",
        headers: admin,
      })
    ).status,
    200,
  );
  assert.equal(
    await store.find("Users", "user_id", account.user_id),
    undefined,
  );
  assert.equal(
    (await store.all("Sessions")).some((s) => s.user_id === account.user_id),
    false,
  );
});

test("legacy scores agree across results list, report and CSV without opening reports first", async (t) => {
  const { request, login, store } = await fixture(t);
  const headers = await login();
  await store.append("Results", {
    submission_id: "stale-grade",
    name: "Legacy Student",
    submitted_at: "2026-11-07",
    writing_answer:
      "My last day at my college is memorable day in my life because I will started new states in my life. My teachers also advice to pay attention. She also advice us to achieve aim in life.",
    total_score: 16,
    suggested_level: "B1",
    grammar_score: 5,
    teacher_level: "B2",
    report_json: JSON.stringify({
      total: 16,
      level: "B1",
      scores: { grammar: 5 },
    }),
  });
  const list = await request("/api/v1/admin/results", { headers });
  const summary = list.data.results.find(
    (r) => r.submission_id === "stale-grade",
  );
  assert.notEqual(summary.total_score, 16);
  const detail = await request("/api/v1/admin/results/stale-grade", {
    headers,
  });
  const report = detail.data.report.writing;
  assert.equal(summary.total_score, report.total);
  assert.equal(summary.suggested_level, report.level);
  assert.equal(summary.grammar_score, report.scores.grammar);
  assert.equal(
    summary.speaking_auto_score,
    report.speaking_assessment.overall_score,
  );
  assert.equal(detail.data.result.total_score, report.total);
  assert.equal(summary.teacher_level, "B2");
  const csv = await request("/api/v1/admin/exports/results.csv", { headers });
  const lines = csv.text
    .trim()
    .split("\r\n")
    .map((line) => line.slice(1, -1).split('","'));
  assert.equal(lines[1][lines[0].indexOf("total_score")], String(report.total));
  assert.equal(lines[1][lines[0].indexOf("suggested_level")], report.level);
});
