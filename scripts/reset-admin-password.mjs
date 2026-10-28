import { getSettings } from "../app/config.js";
import { GoogleSheetStore } from "../app/store.js";
import { passwordHash, strength, iso } from "../app/security.js";
import { AccountService } from "../app/service.js";
import { prompt } from "./prompt.mjs";
const settings = getSettings();
if (!settings.google_ready)
  throw new Error("Google configuration is incomplete.");
const store = new GoogleSheetStore(settings),
  email = (await prompt("Administrator email: ")).trim().toLowerCase(),
  user = await store.find("Users", "email", email);
if (!user || user.role !== "admin")
  throw new Error("Administrator account not found.");
const password = await prompt("New password: ", { secret: true }),
  confirmation = await prompt("Confirm password: ", { secret: true });
if (password !== confirmation) throw new Error("Passwords do not match.");
strength(password);
await store.update("Users", "user_id", user.user_id, {
  password_hash: await passwordHash(password),
  password_salt: "embedded-in-argon2",
  password_version: Number(user.password_version || 1) + 1,
  must_change_password: false,
  failed_login_count: 0,
  locked_until: "",
  updated_at: iso(),
});
for (const session of await store.all("Sessions"))
  if (session.user_id === user.user_id && !session.revoked_at)
    await store.update("Sessions", "session_id", session.session_id, {
      revoked_at: iso(),
    });
await new AccountService(store, settings).audit(
  "PASSWORD_RESET",
  { user_id: "local-cli", email: "local-cli" },
  user,
);
console.log("Administrator password reset and sessions revoked.");
