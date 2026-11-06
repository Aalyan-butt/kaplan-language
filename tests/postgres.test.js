import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { PostgresStore } from "../app/postgres-store.js";
import { createStore } from "../app/database.js";
import { getSettings } from "../app/config.js";
import { AccountService } from "../app/service.js";
import { createApp } from "../app/main.js";

test("database selection always uses PostgreSQL and requires a connection URL", () => {
  const local = getSettings({
    APP_SECRET: "test-secret-long-enough-for-config",
  });
  assert.equal(local.database_provider, "postgres");
  const hosted = getSettings({
    NETLIFY: "true",
    APP_SECRET: "test-secret-long-enough-for-config",
  });
  assert.equal(hosted.database_provider, "postgres");
  assert.throws(() => createStore(hosted), /Set DATABASE_URL/);
});
test("PostgreSQL login, sessions, updates, uniqueness and durable recordings work without Google", async () => {
  const db = new PGlite();
  const settings = getSettings({
    APP_SECRET: "test-secret-long-enough-for-config",
  });
  const store = new PostgresStore(settings, {
    query: (sql, params) => db.query(sql, params),
    end: () => db.close(),
  });
  let server;
  try {
    await db.exec(
      await readFile(new URL("../sql/postgres.sql", import.meta.url), "utf8"),
    );
    const svc = new AccountService(store, settings);
    await svc.createUser({
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      temporary_password: "Example!Pass1",
      attempts_allowed: 1,
    });
    const user = await store.find("Users", "email", "ADMIN@example.com");
    assert.equal(user.role, "admin");
    assert.equal(await store.find("Users", "email", "' OR 1=1 --"), undefined);
    await assert.rejects(
      store.append("Users", {
        ...user,
        user_id: "another",
        email: "ADMIN@example.com",
      }),
      { code: "23505" },
    );
    assert.throws(() => store.columns("Users; DROP TABLE Users"));
    await store.update("Users", "user_id", user.user_id, { name: "Updated" });
    assert.equal(
      (await store.find("Users", "email", user.email)).name,
      "Updated",
    );
    server = createApp({ store, settings }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + "/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "Example!Pass1" }),
    });
    assert.equal(login.status, 200, await login.clone().text());
    const data = await login.json(),
      headers = {
        Authorization: "Bearer " + data.token,
        "X-CSRF-Token": data.csrf_token,
      };
    assert.equal((await store.all("Sessions")).length, 1);
    assert.equal(
      (await fetch(base + "/api/v1/admin/results", { headers })).status,
      200,
    );
    for (const n of [1, 2, 3]) {
      await store.putChunk(user, "submission", n, 1, 2, Buffer.from("two"));
      await store.putChunk(user, "submission", n, 0, 2, Buffer.from("one"));
      await store.putChunk(user, "submission", n, 0, 2, Buffer.from("ONE"));
    }
    const audio = await store.readChunks(user, "submission");
    assert.equal(audio[0].toString(), "ONEtwo");
    await store.saveRecordings("submission", audio);
    assert.equal(
      (await store.readRecording("submission", 2)).toString(),
      "ONEtwo",
    );
    await assert.rejects(store.readChunks(user, "submission"), { status: 422 });
    assert.equal(
      (await fetch(base + "/api/v1/auth/logout", { method: "POST", headers }))
        .status,
      200,
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
});
