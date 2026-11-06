import { PostgresStore } from "./postgres-store.js";
import { HttpError } from "./security.js";
export function createStore(settings) {
  if (!settings.database_url)
    throw new HttpError(
      503,
      "PostgreSQL is not configured. Set DATABASE_URL in the backend environment and restart or redeploy.",
    );
  return new PostgresStore(settings);
}
