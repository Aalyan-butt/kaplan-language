import { createPool } from "mysql2/promise";
import { SHEET_HEADERS } from "./constants.js";
import { cell, googleClients } from "./store.js";
import { HttpError } from "./security.js";

export function mysqlOptions(settings) {
  return {
    host: settings.mysql_host,
    port: settings.mysql_port,
    database: settings.mysql_database,
    user: settings.mysql_user,
    password: settings.mysql_password,
    charset: "utf8mb4",
    connectionLimit: 5,
    waitForConnections: true,
    ...(settings.mysql_ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}
const identifier = (name) => "`" + name + "`";
export class MySQLStore {
  constructor(settings, pool) {
    this.pool = pool || createPool(mysqlOptions(settings));
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
    const [rows] = await this.pool.execute(
      `SELECT * FROM ${identifier(table)} ORDER BY _row_id`,
    );
    return rows.map(({ _row_id, ...row }) => row);
  }
  async find(table, key, value) {
    this.columns(table, key);
    const [rows] = await this.pool.execute(
      `SELECT * FROM ${identifier(table)} WHERE ${identifier(key)} = ? LIMIT 1`,
      [cell(value)],
    );
    if (!rows.length) return undefined;
    const { _row_id, ...row } = rows[0];
    return row;
  }
  async append(table, record) {
    const columns = this.columns(table);
    await this.pool.execute(
      `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
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
    const [result] = await this.pool.execute(
      `UPDATE ${identifier(table)} SET ${columns.map((column) => identifier(column) + " = ?").join(",")} WHERE ${identifier(key)} = ?`,
      [...columns.map((column) => cell(changes[column])), cell(value)],
    );
    return result.affectedRows > 0;
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
    await this.pool.execute(
      "INSERT INTO AudioChunks (user_id, submission_id, answer_number, chunk_index, chunk_total, content) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE chunk_total = VALUES(chunk_total), content = VALUES(content)",
      [user.user_id, id, number, index, total, bytes],
    );
  }
  async readChunks(user, id) {
    return Promise.all(
      [1, 2, 3].map(async (number) => {
        const [rows] = await this.pool.execute(
          "SELECT chunk_index, chunk_total, content FROM AudioChunks WHERE user_id = ? AND submission_id = ? AND answer_number = ? ORDER BY chunk_index",
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
      await this.pool.execute(
        "INSERT INTO Recordings (submission_id, answer_number, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)",
        [id, index + 1, bytes],
      );
    await this.pool.execute("DELETE FROM AudioChunks WHERE submission_id = ?", [
      id,
    ]);
  }
  async readRecording(id, number) {
    const [rows] = await this.pool.execute(
      "SELECT content FROM Recordings WHERE submission_id = ? AND answer_number = ?",
      [id, number],
    );
    if (!rows.length) throw new HttpError(404, "Recording not found.");
    return rows[0].content;
  }
  async close() {
    await this.pool.end();
  }
}
