import { readFile } from "node:fs/promises";
import { getSettings } from "../app/config.js";
import { createStore } from "../app/database.js";
import { AccountService } from "../app/service.js";
import { LESSONS } from "../app/lessons.js";
import { prompt } from "./prompt.mjs";
const store = createStore(getSettings());
let client;
try {
  client = await store.pool.connect();
  await client.query("BEGIN");
  await client.query(
    await readFile(new URL("../sql/postgres.sql", import.meta.url), "utf8"),
  );
  await client.query("COMMIT");
  console.log("PostgreSQL tables are ready. Existing records were preserved.");
  if (process.argv.includes("--create-admin")) {
    const email = await prompt("Administrator email: ");
    const name = await prompt("Administrator name: ");
    const password = await prompt("Administrator password: ", { secret: true });
    if (password !== (await prompt("Confirm password: ", { secret: true })))
      throw new Error("Passwords do not match.");
    await new AccountService(store, getSettings()).createUser({
      email,
      name,
      temporary_password: password,
      role: "admin",
      attempts_allowed: 1,
    });
    if (!(await store.all("Lessons")).length)
      await store.appendMany(
        "Lessons",
        LESSONS.map((lesson, i) => ({
          lesson_id: lesson.id,
          category: lesson.category,
          title: lesson.title,
          rule: lesson.rule,
          correct_examples: lesson.examples,
          common_mistake: lesson.mistake,
          display_order: i + 1,
          enabled: true,
        })),
      );
    console.log("Administrator created.");
  }
} catch (error) {
  if (client) await client.query("ROLLBACK");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await store.close();
}
