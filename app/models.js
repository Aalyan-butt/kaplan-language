import { z } from "zod";
const name = z
    .string()
    .min(2)
    .max(100)
    .transform((s) => s.trim().replace(/\s+/g, " ")),
  email = z.email(),
  password = z.string().min(6).max(128),
  attempts = z.number().int().min(1).max(20),
  role = z.enum(["student", "admin"]);
export const createUser = z.object({
  name,
  email,
  temporary_password: password,
  role: role.default("student"),
  attempts_allowed: attempts.default(1),
});
export const schemas = {
  login: z.object({ email, password: z.string().min(1).max(128) }),
  change: z.object({
    current_password: z.string().min(1).max(128),
    new_password: password,
  }),
  create: createUser,
  bulk: z.object({
    users: z
      .array(
        createUser.extend({ role: z.literal("student").default("student") }),
      )
      .min(1)
      .max(100),
  }),
  update: z.object({
    name: name.nullish(),
    email: email.nullish(),
    role: role.nullish(),
  }),
  status: z.object({ status: z.enum(["active", "disabled"]) }),
  password: z.object({ temporary_password: password }),
  attempts: z.object({ attempts_allowed: attempts }),
  override: z.object({
    teacher_level: z
      .enum(["", "Below A2", "A2", "B1", "B2", "Teacher review required"])
      .default(""),
    teacher_notes: z.string().max(5000).default(""),
  }),
};
export const submissionSchema = z.object({
  submission_id: z.uuid(),
  started_at: z.string().max(40),
  time_seconds: z.coerce.number().int().min(1).max(14400),
  paste_flag: z.preprocess(
    (v) =>
      typeof v === "string" && /^(true|false|1|0|yes|no|on|off)$/i.test(v)
        ? /^(true|1|yes|on)$/i.test(v)
        : v,
    z.boolean(),
  ),
  paste_events: z.coerce.number().int().min(0).max(1000),
  writing_answer: z.string().min(20).max(5000),
  speaking_transcript_1: z.string().max(3000).default(""),
  speaking_transcript_2: z.string().max(3000).default(""),
  speaking_transcript_3: z.string().max(3000).default(""),
  speaking_metrics: z
    .union([z.string().max(2000), z.array(z.unknown())])
    .default("[]"),
  uploaded_audio: z.boolean().optional(),
});
export const validate = (key) => (req, res, next) => {
  req.body = schemas[key].parse(req.body);
  next();
};
