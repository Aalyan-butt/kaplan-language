import { getSettings } from "../app/config.js";
import { GoogleSheetStore } from "../app/store.js";
import { MySQLStore } from "../app/mysql-store.js";
import { SHEET_HEADERS } from "../app/constants.js";
const settings = getSettings();
if (!settings.google_ready)
  throw new Error(
    "Existing Google configuration is required for this one-time import.",
  );
const source = new GoogleSheetStore(settings),
  destination = new MySQLStore(settings);
const connection = await destination.pool.getConnection();
try {
  // Read before beginning the transaction; never change the source Sheet.
  const data = Object.fromEntries(
    await Promise.all(
      Object.keys(SHEET_HEADERS)
        .filter((name) => name !== "Sessions")
        .map(async (name) => [name, await source.all(name)]),
    ),
  );
  await connection.beginTransaction();
  for (const name of Object.keys(SHEET_HEADERS)) {
    const [rows] = await connection.query(
      "SELECT COUNT(*) AS count FROM `" + name + "`",
    );
    if (Number(rows[0].count))
      throw new Error(
        "Destination must be empty. No imported data was committed.",
      );
  }
  const transactionStore = new MySQLStore(settings, connection);
  for (const [name, rows] of Object.entries(data))
    await transactionStore.appendMany(name, rows);
  await connection.commit();
  console.log(
    "Imported accounts, password hashes, results, lessons, settings, jobs and audit records. Existing sessions were excluded; sign in again. Google records were not changed.",
  );
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await destination.close();
}
