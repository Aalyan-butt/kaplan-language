import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getSettings } from "./config.js";
import { GoogleSheetStore } from "./store.js";
import { AccountService, publicUser } from "./service.js";
import { GoogleWorkspaceArtifacts } from "./workspace.js";
import { HttpError, iso, strength, passwordHash } from "./security.js";
import { validate } from "./models.js";
import { createSubmission } from "./submissions.js";
import { RESULT_HEADERS } from "./constants.js";
import { z } from "zod";
const root = fileURLToPath(new URL("../", import.meta.url));
export function createApp({ store, settings = getSettings(), workspace } = {}) {
  const app = express();
  app.disable("x-powered-by");
  let service;
  app.use((req, res, next) => {
    req.requestId = (req.get("X-Request-ID") || randomUUID()).slice(0, 100);
    res.set({
      "X-Request-ID": req.requestId,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    if (req.get("origin") === settings.frontend_origin) {
      res.set({
        "Access-Control-Allow-Origin": settings.frontend_origin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization,Content-Type,X-CSRF-Token,X-Request-ID",
        "Access-Control-Expose-Headers": "X-Request-ID",
        Vary: "Origin",
      });
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    if (Number(req.get("content-length")) > 20 * 1024 * 1024)
      throw new HttpError(
        413,
        "Request is larger than the 20 MB safety limit.",
      );
    next();
  });
  app.use(express.json({ limit: "20mb" }));
  app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "kaplan-placement-api" }),
  );
  for (const path of ["/", "/config.js", "/kaplan.png"])
    app.get(path, (req, res) =>
      res.sendFile(path === "/" ? "index.html" : path.slice(1), { root }),
    );
  app.use("/api", (req, res, next) => {
    if (!store) {
      if (!settings.google_ready)
        throw new HttpError(
          503,
          "Google configuration is incomplete. Set the Google environment variables.",
        );
      store = new GoogleSheetStore(settings);
    }
    service ??= new AccountService(store, settings);
    workspace ??= store.google
      ? new GoogleWorkspaceArtifacts(settings, store)
      : null;
    next();
  });
  const auth = async (req, res, next) => {
    if (!req.get("authorization")?.startsWith("Bearer "))
      throw new HttpError(401, "Authentication required.");
    Object.assign(
      req,
      await service.authenticate(req.get("authorization").slice(7)),
    );
    next();
  };
  const csrf = (req, res, next) => {
    if (
      !req.get("X-CSRF-Token") ||
      req.get("X-CSRF-Token") !== req.session.csrf_nonce
    )
      throw new HttpError(403, "Request verification failed.");
    next();
  };
  const admin = (req, res, next) => {
    if (req.user.role !== "admin")
      throw new HttpError(403, "Administrator access required.");
    next();
  };
  const student = (req, res, next) => {
    if (req.user.role !== "student")
      throw new HttpError(403, "Student access required.");
    next();
  };
  const target = async (id) => {
    const u = await store.find("Users", "user_id", id);
    if (!u) throw new HttpError(404, "Account not found.");
    return u;
  };
  const result = async (id) => {
    const r = await store.find("Results", "submission_id", id);
    if (!r) throw new HttpError(404, "Submission not found.");
    return r;
  };
  const revoke = async (id, except) => {
    for (const s of await store.all("Sessions"))
      if (s.user_id === id && s.session_id !== except && !s.revoked_at)
        await store.update("Sessions", "session_id", s.session_id, {
          revoked_at: iso(),
        });
  };
  app.post("/api/v1/auth/login", validate("login"), async (req, res) =>
    res.json(
      await service.login(
        req.body.email,
        req.body.password,
        req.get("user-agent") || "",
        req.requestId,
      ),
    ),
  );
  app.get("/api/v1/auth/me", auth, (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  app.post(
    "/api/v1/auth/change-password",
    auth,
    csrf,
    validate("change"),
    async (req, res) => {
      await service.changePassword(
        req.user,
        req.body.current_password,
        req.body.new_password,
      );
      await revoke(req.user.user_id, req.session.session_id);
      res.json({ ok: true });
    },
  );
  app.post("/api/v1/auth/logout", auth, csrf, async (req, res) => {
    await store.update("Sessions", "session_id", req.session.session_id, {
      revoked_at: iso(),
    });
    await service.audit("LOGOUT", req.user, req.user);
    res.json({ ok: true });
  });
  app.use("/api/v1/admin", auth, csrf, admin);
  app.get("/api/v1/admin/users", async (req, res) => {
    const users = (await store.all("Users"))
      .map(publicUser)
      .sort(
        (a, b) =>
          (a.role !== "admin") - (b.role !== "admin") ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
    res.json({ users });
  });
  app.post("/api/v1/admin/users", validate("create"), async (req, res) => {
    const user = await service.createUser(req.body, req.user);
    if (req.body.role === "admin" && workspace)
      await workspace.shareExistingWithAdmin(req.body.email);
    res.status(201).json({ user, temporary_password_shown_once: true });
  });
  app.post("/api/v1/admin/users/bulk", validate("bulk"), async (req, res) => {
    const created = [],
      rejected = [];
    for (const p of req.body.users)
      try {
        created.push(await service.createUser(p, req.user));
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        rejected.push({ email: p.email, reason: e.message });
      }
    res
      .status(201)
      .json({ created, rejected, temporary_passwords_shown_once: true });
  });
  app.patch(
    "/api/v1/admin/users/:id/status",
    validate("status"),
    async (req, res) => {
      const u = await target(req.params.id),
        status = req.body.status;
      if (u.user_id === req.user.user_id && status === "disabled")
        throw new HttpError(400, "You cannot disable your own account.");
      if (
        u.role === "admin" &&
        status === "disabled" &&
        (await store.all("Users")).filter(
          (x) => x.role === "admin" && x.status === "active",
        ).length <= 1
      )
        throw new HttpError(
          400,
          "The final active administrator cannot be disabled.",
        );
      await store.update("Users", "user_id", u.user_id, {
        status,
        updated_at: iso(),
      });
      await service.audit("USER_STATUS_CHANGED", req.user, u, true, { status });
      res.json({ ok: true });
    },
  );
  app.patch("/api/v1/admin/users/:id", validate("update"), async (req, res) => {
    const u = await target(req.params.id),
      changes = { updated_at: iso() };
    for (const k of ["name", "email", "role"])
      if (req.body[k] != null)
        changes[k] = k === "email" ? req.body[k].toLowerCase() : req.body[k];
    if (changes.email) {
      const existing = await store.find("Users", "email", changes.email);
      if (existing && existing.user_id !== u.user_id)
        throw new HttpError(409, "That email address is already in use.");
    }
    if (
      u.user_id === req.user.user_id &&
      changes.role &&
      changes.role !== "admin"
    )
      throw new HttpError(
        400,
        "You cannot remove your own administrator role.",
      );
    await store.update("Users", "user_id", u.user_id, changes);
    await service.audit(
      "USER_UPDATED",
      req.user,
      u,
      true,
      Object.fromEntries(
        Object.entries(changes).filter(([k]) => k !== "updated_at"),
      ),
    );
    if (changes.role === "admin" && u.role !== "admin" && workspace)
      await workspace.shareExistingWithAdmin(changes.email || u.email);
    res.json({ user: publicUser(await target(u.user_id)) });
  });
  app.patch(
    "/api/v1/admin/users/:id/password",
    validate("password"),
    async (req, res) => {
      const u = await target(req.params.id);
      strength(req.body.temporary_password);
      await store.update("Users", "user_id", u.user_id, {
        password_hash: await passwordHash(req.body.temporary_password),
        password_salt: "embedded-in-argon2",
        password_version: Number(u.password_version || 1) + 1,
        must_change_password: false,
        failed_login_count: 0,
        locked_until: "",
        updated_at: iso(),
      });
      await revoke(u.user_id);
      await service.audit("PASSWORD_RESET", req.user, u);
      res.json({ ok: true, temporary_password_shown_once: true });
    },
  );
  app.patch(
    "/api/v1/admin/users/:id/attempts",
    validate("attempts"),
    async (req, res) => {
      const u = await target(req.params.id);
      if (u.role !== "student")
        throw new HttpError(400, "Attempts apply only to students.");
      await store.update("Users", "user_id", u.user_id, {
        attempts_allowed: req.body.attempts_allowed,
        updated_at: iso(),
      });
      await service.audit("ATTEMPTS_CHANGED", req.user, u, true, req.body);
      res.json({ ok: true });
    },
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 6 * 1024 * 1024,
      files: 3,
      fields: 16,
      fieldSize: 20000,
    },
  }).fields([1, 2, 3].map((n) => ({ name: `audio_${n}`, maxCount: 1 })));
  app.post(
    "/api/v1/student/submissions/:id/uploads",
    auth,
    csrf,
    student,
    async (req, res) => {
      const id = z.uuid().parse(req.params.id);
      if (
        Number(req.user.attempts_used || 0) >=
        Number(req.user.attempts_allowed || 1)
      )
        throw new HttpError(409, "No test attempts remain for this account.");
      if (await store.find("Results", "submission_id", id))
        throw new HttpError(409, "This submission is already complete.");
      if (store.google) await workspace.attemptFolder(req.user, id);
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/student/submissions/:id/audio/:number/chunks/:index",
    auth,
    csrf,
    student,
    async (req, res) => {
      const id = z.uuid().parse(req.params.id),
        number = Number(req.params.number),
        index = Number(req.params.index),
        total = req.body.total,
        content = req.body.content;
      if (
        ![1, 2, 3].includes(number) ||
        !Number.isInteger(index) ||
        !Number.isInteger(total) ||
        total < 1 ||
        total > 6 ||
        index < 0 ||
        index >= total ||
        typeof content !== "string" ||
        content.length > 1400000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
      )
        throw new HttpError(422, "Invalid recording chunk.");
      const bytes = Buffer.from(content, "base64");
      if (!bytes.length || bytes.length > 1024 * 1024)
        throw new HttpError(
          413,
          "Recording chunks must be between 1 byte and 1 MB.",
        );
      const existing = await store.find("Results", "submission_id", id);
      if (existing)
        throw new HttpError(409, "This submission is already complete.");
      if (
        Number(req.user.attempts_used || 0) >=
        Number(req.user.attempts_allowed || 1)
      )
        throw new HttpError(409, "No test attempts remain for this account.");
      if (store.google)
        await workspace.putChunk(req.user, id, number, index, total, bytes);
      else {
        const key = `${req.user.user_id}:${id}:${number}`;
        let entry = store.chunks.get(key);
        if (index === 0 || !entry || entry.total !== total) {
          entry = { total, parts: new Map() };
          store.chunks.set(key, entry);
        }
        entry.parts.set(index, bytes);
      }
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/student/submissions",
    auth,
    csrf,
    student,
    upload,
    async (req, res) =>
      res
        .status(201)
        .json(await createSubmission(req, store, workspace, service)),
  );
  app.get("/api/v1/admin/results", async (req, res) => {
    const excluded = [
      "report_json",
      "writing_answer",
      "speaking_transcript_1",
      "speaking_transcript_2",
      "speaking_transcript_3",
    ];
    res.json({
      results: (await store.all("Results"))
        .map((r) =>
          Object.fromEntries(
            Object.entries(r).filter(([k]) => !excluded.includes(k)),
          ),
        )
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)),
    });
  });
  app.get("/api/v1/admin/results/:id", async (req, res) => {
    const row = await result(req.params.id);
    let report = {};
    try {
      report = JSON.parse(row.report_json || "{}");
    } catch {}
    const generatedErrors = [
      ...(report.issues || []),
      ...(report.speaking_language || []).flatMap(
        (answer) => answer.issues || [],
      ),
    ].map((issue, index) => ({
      error_id: `report-${index}`,
      submission_id: req.params.id,
      answer_section: issue.section || "writing",
      category: issue.category,
      original_text: issue.original,
      suggested_correction: issue.correction,
      explanation: issue.explanation,
      rule_id: issue.rule_id,
    }));
    res.json({
      result: Object.fromEntries(
        Object.entries(row).filter(([k]) => k !== "report_json"),
      ),
      report: { writing: report },
      errors: generatedErrors.length
        ? generatedErrors
        : (await store.all("Errors")).filter(
            (e) => e.submission_id === req.params.id,
          ),
    });
  });
  app.get("/api/v1/admin/results/:id/pdf", async (req, res) => {
    const row = await result(req.params.id);
    if (!workspace)
      throw new HttpError(409, "PDF export requires Google storage.");
    let content;
    try {
      content = await workspace.exportReportPdf(row.doc_url);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        503,
        "The PDF could not be exported from Google Drive. Try again.",
      );
    }
    const filename = row.name.replace(/[^\p{L}\p{N}_-]/gu, "-") || "student";
    await service.audit("REPORT_PDF_DOWNLOADED", req.user, {}, true, {
      submission_id: req.params.id,
    });
    res.type("pdf").attachment(`Kaplan-${filename}-report.pdf`).send(content);
  });
  app.get("/api/v1/admin/results/:id/audio/:number", async (req, res) => {
    const n = Number(req.params.number);
    if (![1, 2, 3].includes(n))
      throw new HttpError(404, "Recording not found.");
    const row = await result(req.params.id);
    if (!workspace)
      throw new HttpError(409, "Audio streaming requires Google storage.");
    let content;
    try {
      content = await workspace.downloadRecording(row[`audio_${n}_url`]);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        503,
        "The recording could not be loaded from Google Drive.",
      );
    }
    res
      .set(
        "Content-Disposition",
        `${["true", "1"].includes(req.query.download) ? "attachment" : "inline"}; filename="answer-${n}.mp3"`,
      )
      .type("audio/mpeg")
      .send(content);
  });
  app.patch(
    "/api/v1/admin/results/:id/override",
    validate("override"),
    async (req, res) => {
      const row = await result(req.params.id),
        changes = {
          ...req.body,
          override_by: req.user.email,
          override_at: iso(),
        };
      await store.update("Results", "submission_id", req.params.id, changes);
      await service.audit(
        "RESULT_OVERRIDE_SAVED",
        req.user,
        { user_id: row.user_id, email: row.email },
        true,
        { submission_id: req.params.id, teacher_level: req.body.teacher_level },
      );
      res.json({ ok: true, ...changes });
    },
  );
  app.get("/api/v1/admin/exports/results.csv", async (req, res) => {
    const headers = RESULT_HEADERS.filter(
      (k) => !["report_json", "speaking_metrics_json"].includes(k),
    );
    const quote = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const safe = (v) => (/^[=+\-@]/.test(String(v ?? "")) ? "'" + v : v);
    const csv =
      [
        headers,
        ...(await store.all("Results")).map((r) =>
          headers.map((h) => safe(r[h])),
        ),
      ]
        .map((row) => row.map(quote).join(","))
        .join("\r\n") + "\r\n";
    await service.audit("RESULTS_EXPORTED", req.user, {}, true, {
      format: "csv",
    });
    res
      .type("text/csv; charset=utf-8")
      .attachment("kaplan-results.csv")
      .send(csv);
  });
  app.use((req, res) =>
    res
      .status(404)
      .json({ error: { message: "Not found.", request_id: req.requestId } }),
  );
  app.use((err, req, res, next) => {
    const storageConnectionError = [
      "EACCES",
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ETIMEDOUT",
    ].includes(err.code);
    const validation = err instanceof z.ZodError,
      status = storageConnectionError
        ? 503
        : validation
          ? 422
          : err instanceof multer.MulterError
            ? err.code === "LIMIT_FILE_SIZE"
              ? 413
              : 422
            : err.status || 500;
    const message = storageConnectionError
      ? "The backend cannot connect to Google storage. Check its network access and try again."
      : validation
        ? "Invalid request: " +
          err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : status < 500 || err instanceof HttpError
          ? err.message
          : "The service could not complete this request.";
    if (status >= 500)
      console.error(
        JSON.stringify({
          request_id: req.requestId,
          status,
          error_type: err.constructor.name,
          ...(storageConnectionError ? { code: err.code } : {}),
        }),
      );
    res.status(status).json({ error: { message, request_id: req.requestId } });
  });
  return app;
}
