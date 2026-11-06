import pg from "pg";
const { Pool } = pg;
import { SHEET_HEADERS } from "./constants.js";
import { cell, googleClients } from "./store.js";
import { HttpError } from "./security.js";

const identifier = (name) => '"' + name + '"';
const placeholders = (count) =>
  Array.from({ length: count }, (_, i) => "$" + (i + 1));
export class PostgresStore {
  constructor(settings, pool) {
    this.pool =
      pool ||
      new Pool({
        connectionString: settings.database_url,
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        allowExitOnIdle: true,
      });
    this.google = Boolean(settings.google_artifacts && settings.google_ready);
    if (this.google) Object.assign(this, googleClients(settings));
  }
  columns(table, key) {
    const columns = SHEET_HEADERS[table];
    if (!columns || (key && !columns.includes(key)))
      throw new Error("Invalid storage field.");
    return columns;
  }
  async all(table) {
    this.columns(table);
    const { rows } = await this.pool.query(
      `SELECT * FROM ${identifier(table)} ORDER BY _row_id`,
    );
    return rows.map(({ _row_id, ...row }) => row);
  }
  async find(table, key, value) {
    this.columns(table, key);
    const { rows } = await this.pool.query(
      `SELECT * FROM ${identifier(table)} WHERE ${key === "email" ? "LOWER(" + identifier(key) + ")" : identifier(key)} = $1 LIMIT 1`,
      [key === "email" ? cell(value).toLowerCase() : cell(value)],
    );
    if (!rows.length) return undefined;
    const { _row_id, ...row } = rows[0];
    return row;
  }
  async append(table, record) {
    const columns = this.columns(table);
    await this.pool.query(
      `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(",")}) VALUES (${placeholders(columns.length).join(",")})`,
      columns.map((key) => cell(record[key])),
    );
  }
  async appendMany(table, records) {
    for (const record of records) await this.append(table, record);
  }
  async update(table, key, value, changes) {
    const columns = this.columns(table, key).filter((column) =>
      Object.hasOwn(changes, column),
    );
    if (!columns.length) return Boolean(await this.find(table, key, value));
    const result = await this.pool.query(
      `UPDATE ${identifier(table)} SET ${columns.map((column, i) => identifier(column) + " = $" + (i + 1)).join(",")} WHERE ${identifier(key)} = $${columns.length + 1}`,
      [...columns.map((column) => cell(changes[column])), cell(value)],
    );
    return result.rowCount > 0;
  }
  async setResultHyperlinks(id, urls) {
    await this.update(
      "Results",
      "submission_id",
      id,
      Object.fromEntries(urls.map((url, i) => [`audio_${i + 1}_play`, url])),
    );
  }
  async putChunk(user, id, number, index, total, bytes) {
    await this.pool.query(
      'INSERT INTO "AudioChunks" (user_id, submission_id, answer_number, chunk_index, chunk_total, content) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, submission_id, answer_number, chunk_index) DO UPDATE SET chunk_total = EXCLUDED.chunk_total, content = EXCLUDED.content',
      [user.user_id, id, number, index, total, bytes],
    );
  }
  async readChunks(user, id) {
    return Promise.all(
      [1, 2, 3].map(async (number) => {
        const { rows } = await this.pool.query(
          'SELECT chunk_index, chunk_total, content FROM "AudioChunks" WHERE user_id = $1 AND submission_id = $2 AND answer_number = $3 ORDER BY chunk_index',
          [user.user_id, id, number],
        );
        if (
          !rows.length ||
          rows.length !== rows[0].chunk_total ||
          rows.some(
            (row, i) =>
              row.chunk_index !== i || row.chunk_total !== rows.length,
          )
        )
          throw new HttpError(
            422,
            `Speaking answer ${number} has incomplete uploads.`,
          );
        return Buffer.concat(rows.map((row) => row.content));
      }),
    );
  }
  async saveRecordings(id, recordings) {
    for (const [index, bytes] of recordings.entries())
      await this.pool.query(
        'INSERT INTO "Recordings" (submission_id, answer_number, content) VALUES ($1, $2, $3) ON CONFLICT (submission_id, answer_number) DO UPDATE SET content = EXCLUDED.content',
        [id, index + 1, bytes],
      );
    await this.pool.query(
      'DELETE FROM "AudioChunks" WHERE submission_id = $1',
      [id],
    );
  }
  async readRecording(id, number) {
    const { rows } = await this.pool.query(
      'SELECT content FROM "Recordings" WHERE submission_id = $1 AND answer_number = $2',
      [id, number],
    );
    if (!rows.length) throw new HttpError(404, "Recording not found.");
    return Buffer.from(rows[0].content);
  }
  async close() {
    await this.pool.end();
  }
}
