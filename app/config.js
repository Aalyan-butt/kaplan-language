import "dotenv/config";
export function getSettings(env = process.env) {
  const number = (key, fallback, min, max) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`Invalid ${key}`);
    return n;
  };
  const s = {
    frontend_origin: (
      env.FRONTEND_ORIGIN ||
      env.URL ||
      "http://localhost:3000"
    ).replace(/\/$/, ""),
    app_secret: env.APP_SECRET || "development-only-change-this-secret",
    session_idle_minutes: number("SESSION_IDLE_MINUTES", 120, 15, 1440),
    account_lock_minutes: number("ACCOUNT_LOCK_MINUTES", 2, 1, 1440),
    max_login_failures: number("MAX_LOGIN_FAILURES", 5, 3, 20),
  };
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_SPREADSHEET_ID",
    "GOOGLE_DRIVE_FOLDER_ID",
  ])
    s[key.toLowerCase()] = env[key] || "";
  s.google_ready = [
    "google_client_id",
    "google_client_secret",
    "google_refresh_token",
    "google_spreadsheet_id",
    "google_drive_folder_id",
  ].every((k) => s[k]);
  if (
    s.app_secret.length < 24 ||
    (env.NETLIFY && s.app_secret === "development-only-change-this-secret")
  )
    throw new Error(
      "Set APP_SECRET to a random secret of at least 24 characters.",
    );
  return s;
}
