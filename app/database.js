import { MySQLStore } from "./mysql-store.js";
import { PostgresStore } from "./postgres-store.js";
import { HttpError } from "./security.js";
export function createStore(settings) {
  if (settings.database_provider === "postgres") {
    if (!settings.database_url)
      throw new HttpError(
        503,
        "Hosted database is not configured. Enable Netlify Database and redeploy.",
      );
    return new PostgresStore(settings);
  }
  if (
    process.env.NETLIFY &&
    ["localhost", "127.0.0.1", "::1"].includes(settings.mysql_host)
  )
    throw new HttpError(
      503,
      "Netlify cannot use MySQL on your PC. Configure a hosted database.",
    );
  return new MySQLStore(settings);
}
