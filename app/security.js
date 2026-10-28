import { randomBytes, createHmac } from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
export const iso = (value = new Date()) =>
  value.toISOString().replace(/\.\d{3}Z$/, "+00:00");
const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 2,
  outputLen: 32,
};
export const passwordHash = (password) => hash(password, options);
export async function passwordValid(encoded, password) {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}
export const rehashRequired = (encoded) => {
  return !/^\$argon2id\$v=19\$m=65536,t=3,p=2\$/.test(encoded);
};
export const tokenHash = (token, secret) =>
  createHmac("sha256", secret).update(token).digest("hex");
export const newToken = (bytes = 48) =>
  randomBytes(bytes).toString("base64url");
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function strength(password) {
  if (password.length < 10 || password.length > 128)
    throw new HttpError(422, "Password must contain 10 to 128 characters.");
  if (
    [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter((r) =>
      r.test(password),
    ).length < 3
  )
    throw new HttpError(
      422,
      "Use at least three of: uppercase, lowercase, number, symbol.",
    );
}
