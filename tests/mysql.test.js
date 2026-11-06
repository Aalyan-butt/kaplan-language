import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createConnection } from "mysql2/promise";
import { MySQLStore, mysqlOptions } from "../app/mysql-store.js";
import { getSettings } from "../app/config.js";
import { AccountService } from "../app/service.js";
import { createApp } from "../app/main.js";

test(
  "MySQL persists accounts, sessions and audio without Google and rejects duplicate/injected records",
  { skip: process.env.MYSQL_INTEGRATION !== "1" },
  async () => {
    const settings = getSettings({
      ...process.env,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REFRESH_TOKEN: "",
      GOOGLE_SPREADSHEET_ID: "",
      GOOGLE_DRIVE_FOLDER_ID: "",
      GOOGLE_ARTIFACTS: "false",
    });
    const database = "kaplan_test_" + randomUUID().replaceAll("-", "");
    const options = mysqlOptions(settings);
    delete options.database;
    delete options.connectionLimit;
    delete options.waitForConnections;
    const admin = await createConnection(options);
    settings.mysql_database = database;
    const store = new MySQLStore(settings),
      restarted = new MySQLStore(settings);
    let server;
    try {
      const sql = (
        await readFile(new URL("../sql/schema.sql", import.meta.url), "utf8")
      ).replaceAll("kaplan", database);
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await admin.query(statement);
      const service = new AccountService(store, settings);
      await service.createUser({
        email: "admin@example.com",
        name: "Admin",
        role: "admin",
        temporary_password: "Example!Pass1",
        attempts_allowed: 1,
      });
      assert.equal(
        (await restarted.find("Users", "email", "ADMIN@example.com")).role,
        "admin",
      );
      assert.equal(
        await restarted.find("Users", "email", "' OR 1=1 --"),
        undefined,
      );
      await assert.rejects(
        store.append(
          "Users",
          await store.find("Users", "email", "admin@example.com"),
        ),
        { code: "ER_DUP_ENTRY" },
      );
      assert.throws(() => store.columns("Users; DROP TABLE Users"));
      server = createApp({ settings, store: restarted }).listen(0, "127.0.0.1");
      await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(base + "/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "Example!Pass1",
        }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await restarted.all("Sessions")).length, 1);
      const user = await store.find("Users", "email", "admin@example.com"),
        id = randomUUID();
      for (const n of [1, 2, 3]) {
        await store.putChunk(user, id, n, 1, 2, Buffer.from("second"));
        await store.putChunk(user, id, n, 0, 2, Buffer.from("first"));
      }
      const audio = await restarted.readChunks(user, id);
      assert.equal(audio[0].toString(), "firstsecond");
      await restarted.saveRecordings(id, audio);
      assert.equal(
        (await store.readRecording(id, 2)).toString(),
        "firstsecond",
      );
      await assert.rejects(store.readChunks(user, id), { status: 422 });
      await assert.rejects(store.readRecording(randomUUID(), 1), {
        status: 404,
      });
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await store.close();
      await restarted.close();
      await admin.query("DROP DATABASE `" + database + "`");
      await admin.end();
    }
  },
);
