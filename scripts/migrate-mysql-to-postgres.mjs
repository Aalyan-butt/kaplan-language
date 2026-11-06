import { getSettings } from "../app/config.js";
import { MySQLStore } from "../app/mysql-store.js";
import { PostgresStore } from "../app/postgres-store.js";
import { SHEET_HEADERS } from "../app/constants.js";
const settings = getSettings();
if (!settings.database_url)
  throw new Error(
    "Set DATABASE_URL to the hosted PostgreSQL connection URL in your private environment. Run npm run setup:postgres first.",
  );
const source = new MySQLStore({ ...settings, google_artifacts: false }),
  destination = new PostgresStore(settings);
let client;
try {
  client = await destination.pool.connect();
  await client.query("BEGIN");
  const target = new PostgresStore(settings, client);
  for (const table of [
    ...Object.keys(SHEET_HEADERS),
    "Recordings",
    "AudioChunks",
  ]) {
    const { rows } = await client.query(
      'SELECT COUNT(*) AS count FROM "' + table + '"',
    );
    if (Number(rows[0].count))
      throw new Error(
        "Destination is not empty. Import stopped without overwriting data.",
      );
  }
  const counts = {};
  for (const table of Object.keys(SHEET_HEADERS).filter(
    (name) => name !== "Sessions",
  )) {
    const rows = await source.all(table);
    for (const row of rows) await target.append(table, row);
    counts[table] = rows.length;
  }
  const [recordings] = await source.pool.execute(
    "SELECT submission_id, answer_number, content FROM Recordings",
  );
  for (const row of recordings)
    await client.query(
      'INSERT INTO "Recordings" (submission_id, answer_number, content) VALUES ($1,$2,$3)',
      [row.submission_id, row.answer_number, row.content],
    );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      imported: counts,
      recordings: recordings.length,
      sessions: "Sign in again. Source data preserved.",
    }),
  );
} catch (error) {
  if (client) await client.query("ROLLBACK");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await source.close();
  await destination.close();
}
