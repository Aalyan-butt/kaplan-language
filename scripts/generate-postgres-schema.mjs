import { mkdir, writeFile } from "node:fs/promises";
import { SHEET_HEADERS } from "../app/constants.js";
const ids = {
  Users: ["user_id"],
  Sessions: ["session_id", "token_hash"],
  Results: ["submission_id"],
  Errors: ["error_id"],
  Settings: ["key"],
  Lessons: ["lesson_id"],
  Jobs: ["job_id"],
};
const q = (value) => '"' + value + '"';
let sql =
  "-- Application schema only. Never put user records or passwords in migrations.\n";
for (const [table, columns] of Object.entries(SHEET_HEADERS)) {
  const definitions = [
    "_row_id BIGSERIAL PRIMARY KEY",
    ...columns.map((column) => q(column) + " TEXT NOT NULL DEFAULT ''"),
    ...(ids[table] || []).map((column) => "UNIQUE (" + q(column) + ")"),
  ];
  sql +=
    "CREATE TABLE IF NOT EXISTS " +
    q(table) +
    " (\n  " +
    definitions.join(",\n  ") +
    "\n);\n";
}
sql +=
  'CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON "Users" (LOWER(email));\n';
sql += `CREATE TABLE IF NOT EXISTS "AudioChunks" (
 user_id TEXT NOT NULL, submission_id TEXT NOT NULL, answer_number INTEGER NOT NULL,
 chunk_index INTEGER NOT NULL, chunk_total INTEGER NOT NULL, content BYTEA NOT NULL,
 PRIMARY KEY(user_id, submission_id, answer_number, chunk_index)
);
CREATE TABLE IF NOT EXISTS "Recordings" (
 submission_id TEXT NOT NULL, answer_number INTEGER NOT NULL, content BYTEA NOT NULL,
 PRIMARY KEY(submission_id, answer_number)
);
`;
await mkdir("sql", { recursive: true });
await writeFile("sql/postgres.sql", sql);
