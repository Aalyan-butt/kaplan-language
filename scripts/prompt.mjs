import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
export async function prompt(question, { secret = false } = {}) {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: !!process.stdin.isTTY,
  });
  try {
    if (secret) {
      process.stdout.write(question);
      muted = true;
    }
    return await rl.question(secret ? "" : question);
  } finally {
    muted = false;
    rl.close();
    if (secret) process.stdout.write("\n");
  }
}
