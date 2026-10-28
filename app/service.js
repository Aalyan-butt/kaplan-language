import { randomUUID } from "node:crypto";
import {
  iso,
  passwordHash,
  passwordValid,
  rehashRequired,
  tokenHash,
  newToken,
  strength,
  HttpError,
} from "./security.js";
export const publicUser = (u) => ({
  user_id: u.user_id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  must_change_password: u.must_change_password === "TRUE",
  attempts_allowed: Number(u.attempts_allowed || 1),
  attempts_used: Number(u.attempts_used || 0),
  created_at: u.created_at || "",
  last_login_at: u.last_login_at || "",
  password_status:
    u.must_change_password === "TRUE" ? "Temporary" : "Set by user",
});
export class AccountService {
  constructor(store, settings) {
    this.store = store;
    this.settings = settings;
  }
  async audit(
    action,
    actor = {},
    target = {},
    success = true,
    details = {},
    user_agent = "",
    request_id = "",
  ) {
    await this.store.append("Audit", {
      timestamp: iso(),
      actor_user_id: actor?.user_id || "",
      actor_email: actor?.email || "",
      action,
      target_user_id: target?.user_id || "",
      target_email: target?.email || "",
      success,
      details: JSON.stringify(
        Object.fromEntries(
          Object.entries(details).filter(
            ([k]) =>
              ![
                "password",
                "temporary_password",
                "token",
                "csrf_nonce",
              ].includes(k),
          ),
        ),
      ),
      request_id,
      user_agent: user_agent.slice(0, 300),
    });
  }
  async createUser(p, actor) {
    const email = p.email.trim().toLowerCase();
    if (await this.store.find("Users", "email", email))
      throw new HttpError(409, "An account with this email already exists.");
    strength(p.temporary_password);
    const created = iso(),
      user = {
        user_id: randomUUID(),
        email,
        name: p.name.trim(),
        role: p.role,
        password_hash: await passwordHash(p.temporary_password),
        password_salt: "embedded-in-argon2",
        password_version: 1,
        must_change_password: false,
        status: "active",
        attempts_allowed: p.attempts_allowed,
        attempts_used: 0,
        failed_login_count: 0,
        locked_until: "",
        created_at: created,
        created_by: actor?.user_id || "setup",
        last_login_at: "",
        updated_at: created,
      };
    await this.store.append("Users", user);
    const stored = await this.store.find("Users", "email", email);
    await this.audit("USER_CREATED", actor, stored, true, { role: p.role });
    return publicUser(stored);
  }
  async login(email, password, agent = "", requestId = "") {
    const u = await this.store.find(
        "Users",
        "email",
        email.trim().toLowerCase(),
      ),
      bad = () => new HttpError(401, "Invalid email or password.");
    if (!u) {
      await this.audit(
        "LOGIN_FAILED",
        {},
        {},
        false,
        { email: email.toLowerCase(), reason: "unknown_account" },
        agent,
        requestId,
      );
      throw bad();
    }
    if (u.status !== "active") {
      await this.audit(
        "LOGIN_FAILED",
        {},
        u,
        false,
        { reason: "disabled" },
        agent,
        requestId,
      );
      throw new HttpError(403, "This account is disabled.");
    }
    if (u.role !== "admin" && Date.parse(u.locked_until) > Date.now()) {
      await this.audit(
        "LOGIN_BLOCKED",
        {},
        u,
        false,
        { reason: "locked" },
        agent,
        requestId,
      );
      throw new HttpError(
        423,
        `This account is temporarily locked after too many incorrect passwords. Wait ${this.settings.account_lock_minutes * 60} seconds and try again. Other accounts can still sign in.`,
      );
    }
    if (!(await passwordValid(u.password_hash, password))) {
      const failures =
          u.role === "admin" ? 0 : Number(u.failed_login_count || 0) + 1,
        lock = failures >= this.settings.max_login_failures;
      await this.store.update("Users", "user_id", u.user_id, {
        failed_login_count: lock ? 0 : failures,
        locked_until: lock
          ? iso(
              new Date(Date.now() + this.settings.account_lock_minutes * 60000),
            )
          : "",
        updated_at: iso(),
      });
      await this.audit(
        "LOGIN_FAILED",
        {},
        u,
        false,
        { reason: "bad_password" },
        agent,
        requestId,
      );
      throw bad();
    }
    const updates = {
      failed_login_count: 0,
      locked_until: "",
      last_login_at: iso(),
      updated_at: iso(),
    };
    if (rehashRequired(u.password_hash))
      Object.assign(updates, {
        password_hash: await passwordHash(password),
        password_salt: "embedded-in-argon2",
      });
    await this.store.update("Users", "user_id", u.user_id, updates);
    Object.assign(u, updates);
    const token = newToken(),
      nonce = newToken(24);
    await this.store.append("Sessions", {
      session_id: randomUUID(),
      user_id: u.user_id,
      token_hash: tokenHash(token, this.settings.app_secret),
      csrf_nonce: nonce,
      created_at: iso(),
      last_activity_at: iso(),
      expires_at: iso(
        new Date(Date.now() + this.settings.session_idle_minutes * 60000),
      ),
      revoked_at: "",
      user_agent: agent.slice(0, 300),
    });
    await this.audit("LOGIN_SUCCEEDED", u, u, true, {}, agent, requestId);
    return {
      token,
      csrf_token: nonce,
      expires_in: this.settings.session_idle_minutes * 60,
      user: publicUser(u),
    };
  }
  async authenticate(token) {
    const session = await this.store.find(
      "Sessions",
      "token_hash",
      tokenHash(token, this.settings.app_secret),
    );
    if (!session || session.revoked_at)
      throw new HttpError(401, "Session is invalid or expired.");
    if (!(Date.parse(session.expires_at) > Date.now())) {
      await this.store.update("Sessions", "session_id", session.session_id, {
        revoked_at: iso(),
      });
      throw new HttpError(401, "Session is invalid or expired.");
    }
    const user = await this.store.find("Users", "user_id", session.user_id);
    if (!user || user.status !== "active")
      throw new HttpError(403, "Account is disabled or unavailable.");
    if (!(Date.parse(session.last_activity_at) > Date.now() - 300000)) {
      const changes = {
        last_activity_at: iso(),
        expires_at: iso(
          new Date(Date.now() + this.settings.session_idle_minutes * 60000),
        ),
      };
      await this.store.update(
        "Sessions",
        "session_id",
        session.session_id,
        changes,
      );
      Object.assign(session, changes);
    }
    return { user, session };
  }
  async changePassword(user, current, next) {
    if (!(await passwordValid(user.password_hash, current)))
      throw new HttpError(400, "Current password is incorrect.");
    strength(next);
    if (await passwordValid(user.password_hash, next))
      throw new HttpError(400, "New password must be different.");
    await this.store.update("Users", "user_id", user.user_id, {
      password_hash: await passwordHash(next),
      password_salt: "embedded-in-argon2",
      password_version: Number(user.password_version || 1) + 1,
      must_change_password: false,
      updated_at: iso(),
    });
    await this.audit("PASSWORD_CHANGED", user, user);
  }
}
