import { getSettings } from "../app/config.js";
import { googleClients } from "../app/store.js";
import { MySQLStore } from "../app/mysql-store.js";
import { GoogleWorkspaceArtifacts } from "../app/workspace.js";
const settings = getSettings();
if (!settings.google_ready)
  throw new Error(
    "Google authorization is required only for this one-time recording copy.",
  );
const store = new MySQLStore(settings);
Object.assign(store, googleClients(settings));
const workspace = new GoogleWorkspaceArtifacts(settings, store);
let copied = 0;
try {
  for (const row of await store.all("Results")) {
    for (const number of [1, 2, 3]) {
      if (!row[`audio_${number}_url`]) continue;
      try {
        await store.readRecording(row.submission_id, number);
        continue;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      const bytes = await workspace.downloadRecording(
        row[`audio_${number}_url`],
      );
      await store.pool.execute(
        "INSERT INTO Recordings (submission_id, answer_number, content) VALUES (?, ?, ?)",
        [row.submission_id, number, bytes],
      );
      copied++;
    }
  }
  console.log(
    `Copied ${copied} recordings to MySQL. Google originals were preserved.`,
  );
} finally {
  await store.close();
}
