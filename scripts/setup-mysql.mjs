import { readFile } from "node:fs/promises";
import { createConnection } from "mysql2/promise";
import { getSettings } from "../app/config.js";
import { mysqlOptions, MySQLStore } from "../app/mysql-store.js";
import { LESSONS } from "../app/lessons.js";
import { AccountService } from "../app/service.js";
import { prompt } from "./prompt.mjs";
const settings = getSettings();
if (settings.mysql_database !== "kaplan")
  throw new Error(
    "For a custom database, import sql/schema.sql into that database after adjusting CREATE DATABASE and USE.",
  );
const options = mysqlOptions(settings);
delete options.database;
delete options.connectionLimit;
delete options.waitForConnections;
const connection = await createConnection(options);
try {
  const schema = await readFile(
    new URL("../sql/schema.sql", import.meta.url),
    "utf8",
  );
  for (const statement of schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await connection.query(statement);
} finally {
  await connection.end();
}
const store = new MySQLStore(settings);
try {
  if (
    process.argv.includes("--create-admin") &&
    !(await store.all("Lessons")).length
  )
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
  if (process.argv.includes("--create-admin")) {
    const email = await prompt("Administrator email: ");
    const name = await prompt("Administrator name: ");
    const password = await prompt("Administrator password: ", { secret: true });
    if (password !== (await prompt("Confirm password: ", { secret: true })))
      throw new Error("Passwords do not match.");
    await new AccountService(store, settings).createUser({
      email,
      name,
      temporary_password: password,
      role: "admin",
      attempts_allowed: 1,
    });
  }
  console.log("MySQL schema is ready. Existing records were preserved.");
} finally {
  await store.close();
}
