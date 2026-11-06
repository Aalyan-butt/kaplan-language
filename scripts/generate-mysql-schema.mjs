import { writeFile, mkdir } from "node:fs/promises";
import { SHEET_HEADERS } from "../app/constants.js";
const indexed = new Set([
  "user_id",
  "email",
  "session_id",
  "token_hash",
  "submission_id",
  "error_id",
  "key",
  "lesson_id",
  "job_id",
]);
const unique = {
  Users: ["user_id", "email"],
  Sessions: ["session_id", "token_hash"],
  Results: ["submission_id"],
  Errors: ["error_id"],
  Settings: ["key"],
  Lessons: ["lesson_id"],
  Jobs: ["job_id"],
};
let sql =
  "-- Kaplan MySQL schema. Additive: existing records are never deleted.\nCREATE DATABASE IF NOT EXISTS kaplan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE kaplan;\n\n";
for (const [table, columns] of Object.entries(SHEET_HEADERS)) {
  const defs = [
    "`_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY",
    ...columns.map(
      (column) =>
        "`" +
        column +
        "` " +
        (indexed.has(column)
          ? "VARCHAR(255) NOT NULL DEFAULT ''"
          : "LONGTEXT NOT NULL"),
    ),
    ...(unique[table] || []).map(
      (column) => "UNIQUE KEY `uq_" + column + "` (`" + column + "`)",
    ),
  ];
  sql +=
    "CREATE TABLE IF NOT EXISTS `" +
    table +
    "` (\n  " +
    defs.join(",\n  ") +
    "\n) ENGINE=InnoDB;\n\n";
}
sql += `CREATE TABLE IF NOT EXISTS AudioChunks (
 user_id VARCHAR(255) NOT NULL, submission_id VARCHAR(255) NOT NULL,
 answer_number INT NOT NULL, chunk_index INT NOT NULL, chunk_total INT NOT NULL,
 content MEDIUMBLOB NOT NULL,
 PRIMARY KEY (user_id, submission_id, answer_number, chunk_index)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Recordings (
 submission_id VARCHAR(255) NOT NULL, answer_number INT NOT NULL,
 content MEDIUMBLOB NOT NULL, PRIMARY KEY (submission_id, answer_number)
) ENGINE=InnoDB;
`;
await mkdir("sql", { recursive: true });
await writeFile("sql/schema.sql", sql);
