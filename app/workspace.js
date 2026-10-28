import { Readable } from "node:stream";
import { HttpError } from "./security.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function correctedHtml(text, issues) {
  let output = "",
    position = 0;
  for (const i of [...issues].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )) {
    if (i.start < position || i.start > text.length) continue;
    output += esc(text.slice(position, i.start));
    if (i.original === "end of answer") {
      output += `<ins>${esc(i.correction)}</ins>`;
      position = i.start;
      continue;
    }
    output +=
      `<del>${esc(text.slice(i.start, i.end))}</del>` +
      (i.correction ? ` <ins>${esc(i.correction)}</ins>` : "");
    position = i.end;
  }
  return (output + esc(text.slice(position))).replaceAll("\n", "<br>");
}
export function speakingLanguageHtml(reports, assessment) {
  if (!reports) return "";
  assessment ||= {
    answers: reports.map((r) => r.assessment).filter(Boolean),
    overall_score: reports.length
      ? Math.round(
          (reports.reduce(
            (sum, r) => sum + Number(r.assessment?.final_score || 0),
            0,
          ) /
            reports.length) *
            10,
        ) / 10
      : "—",
  };
  const strict = new Map((assessment?.answers || []).map((a) => [a.answer, a]));
  return `<h2>Strict speaking-language assessment${assessment ? `: ${esc(assessment.overall_score)}/5` : ""}</h2><p>Scores use the automatically captured hidden transcript. Compare it with the audio; pronunciation requires teacher assessment.</p>${reports
    .map((r) =>
      r.status === "checked"
        ? (() => {
            const a = strict.get(r.answer);
            return `<h3>Answer ${r.answer}${a ? `: ${esc(a.final_score)}/5` : `: grammar ${r.scores.grammar}/5`}</h3>${a ? `<table><tr><th>Grammar</th><th>Vocabulary</th><th>Sentences</th><th>Development</th><th>Relevance</th><th>Recording quality</th></tr><tr><td>${a.grammar_score}/5</td><td>${a.vocabulary_score}/5</td><td>${a.sentence_score}/5</td><td>${a.development_score}/5</td><td>${a.relevance_score}/5</td><td>${a.recording_quality_score}/5</td></tr></table><p>${esc(a.feedback.join(" "))}</p>` : ""}<p>${r.metrics.word_count} words; ${r.metrics.sentence_structure_issues} sentence-structure issues.</p><table><tr><th>Category</th><th>Original</th><th>Correction</th><th>Why</th></tr>${r.issues.map((i) => `<tr><td>${esc(i.category)}</td><td>${esc(i.original)}</td><td>${esc(i.correction)}</td><td>${esc(i.explanation)}</td></tr>`).join("") || '<tr><td colspan="4">No rule-based issues found.</td></tr>'}</table>`;
          })()
        : `<h3>Answer ${r.answer}</h3><p>${esc(r.notice)}</p>`,
    )
    .join(
      "",
    )}${assessment ? `<p><b>Formula:</b> ${esc(assessment.formula)}</p>` : ""}`;
}
export function reportHtml(
  user,
  writing,
  transcripts,
  report,
  speaking,
  audio,
) {
  const scores = report.scores;
  const grades = new Map(
    (report.speaking_assessment?.answers || []).map((a) => [a.answer, a]),
  );
  const mergedSpeaking = [0, 1, 2]
    .map((index) => {
      const language = report.speaking_language?.[index] || {};
      const number = index + 1,
        grade = grades.get(number) || language.assessment || {},
        recording = speaking.answers[index] || {},
        issues = (language.issues || []).filter(
          (issue) => issue.rule_id !== "sentence-capital",
        );
      return `<h3>Answer ${number}: ${esc(grade.final_score ?? "—")}/5</h3><table><tr><th>Grammar</th><th>Vocabulary</th><th>Sentences</th><th>Development</th><th>Relevance</th><th>Recording quality</th></tr><tr><td>${esc(grade.grammar_score ?? "—")}/5</td><td>${esc(grade.vocabulary_score ?? "—")}/5</td><td>${esc(grade.sentence_score ?? "—")}/5</td><td>${esc(grade.development_score ?? "—")}/5</td><td>${esc(grade.relevance_score ?? "—")}/5</td><td>${esc(grade.recording_quality_score ?? recording.automated_recording_score ?? "—")}/5</td></tr></table><p>${esc((grade.feedback || []).join(" ") || (recording.feedback || []).join(" "))}</p><p><a href="${esc(audio[index]?.webViewLink || "")}">Listen to answer ${number}</a> — ${esc(recording.duration_seconds ?? "—")} seconds</p><p><b>Automatically captured transcript:</b> ${esc(transcripts[index] || "Unavailable; listen to the recording.")}</p><h4>Mistakes and corrections</h4><table><tr><th>Category</th><th>Original</th><th>Correction</th><th>Why</th></tr>${issues.map((issue) => `<tr><td>${esc(issue.category)}</td><td>${esc(issue.original)}</td><td>${esc(issue.correction || "—")}</td><td>${esc(issue.explanation)}</td></tr>`).join("") || '<tr><td colspan="4">No rule-based grammar, vocabulary or sentence mistakes found.</td></tr>'}</table>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#272124;line-height:1.55}h1,h2,h3{color:#731f35}table{border-collapse:collapse;width:100%;margin:10px 0 20px}td,th{border:1px solid #ddd;padding:8px;text-align:left}.box{background:#f7f2f3;padding:14px;white-space:pre-wrap}del{color:#a32636}ins{color:#207044;text-decoration:none}</style></head><body><h1>Kaplan English Placement Report</h1><p><b>Student:</b> ${esc(user.name)}<br><b>Email:</b> ${esc(user.email)}</p><p><b>Automated first-pass check—teacher to confirm.</b> Speaking transcript sentence-start capitalisation is not graded because automatic transcription does not preserve casing reliably.</p><h2>Writing score summary</h2><table><tr><th>Grammar</th><th>Spelling & punctuation</th><th>Vocabulary</th><th>Task & length</th><th>Total</th><th>Suggested level</th></tr><tr>${[scores.grammar, scores.spelling_punctuation, scores.vocabulary, scores.task_length].map((n) => `<td>${n}/5</td>`).join("")}<td>${report.total}/20</td><td>${esc(report.level)}</td></tr></table><h2>Original writing answer</h2><div class="box">${esc(writing)}</div><h2>Corrected writing view</h2><div class="box">${correctedHtml(writing, report.issues)}</div><h2>Writing mistakes and corrections</h2><table><tr><th>Category</th><th>Original</th><th>Correction</th><th>Why</th></tr>${report.issues.map((i) => `<tr><td>${esc(i.category)}</td><td>${esc(i.original)}</td><td>${esc(i.correction || "—")}</td><td>${esc(i.explanation)}</td></tr>`).join("") || '<tr><td colspan="4">No rule-based writing issues found.</td></tr>'}</table><h2>Speaking grammar, sentences and recordings: ${esc(report.speaking_assessment?.overall_score ?? "—")}/5</h2><p>${esc(report.speaking_assessment?.formula || "")}</p>${mergedSpeaking}<h2>Teacher decision</h2><p>Final placement: ____________________</p><p>Teacher notes:</p><br><br></body></html>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#272124;line-height:1.55}h1,h2,h3{color:#731f35}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}.box{background:#f7f2f3;padding:14px;white-space:pre-wrap}del{color:#a32636}ins{color:#207044;text-decoration:none}</style></head><body><h1>Kaplan English Placement Report</h1><p><b>Student:</b> ${esc(user.name)}<br><b>Email:</b> ${esc(user.email)}</p><p><b>Automated first-pass check—teacher to confirm.</b> Grammar scoring uses fixed rules. Speaking grammar uses the reviewed transcript. Relevance, natural style and pronunciation require a teacher.</p><h2>Score summary</h2><table><tr><th>Grammar</th><th>Spelling & punctuation</th><th>Vocabulary</th><th>Task & length</th><th>Total</th><th>Suggested level</th></tr><tr>${[scores.grammar, scores.spelling_punctuation, scores.vocabulary, scores.task_length].map((n) => `<td>${n}/5</td>`).join("")}<td>${report.total}/20</td><td>${esc(report.level)}</td></tr></table><p><b>Formula:</b> ${esc(report.formula)}</p><h2>Task-completion feedback</h2><ul>${report.task_feedback.map((f) => `<li>${esc(f)}</li>`).join("")}</ul><h2>Original writing answer</h2><div class="box">${esc(writing)}</div><h2>Corrected view</h2><div class="box">${correctedHtml(writing, report.issues)}</div><h2>Mistakes and corrections</h2><table><tr><th>Category</th><th>Original</th><th>Correction</th><th>Why</th></tr>${report.issues.map((i) => `<tr><td>${esc(i.category)}</td><td>${esc(i.original)}</td><td>${esc(i.correction || "—")}</td><td>${esc(i.explanation)}</td></tr>`).join("") || '<tr><td colspan="4">No rule-based issues found.</td></tr>'}</table><h2>Personal learning guidelines</h2>${report.lessons.map((l) => `<h3>${esc(l.title)}</h3><p>${esc(l.rule)}</p><p><b>Examples:</b> ${esc(l.examples)}<br><b>Common mistake:</b> ${esc(l.mistake)}</p><p><b>Your example:</b> ${esc(l.student_example.original)} → ${esc(l.student_example.correction || "review")}</p>`).join("") || "<p>No specific mini-lessons were selected.</p>"}<h2>Speaking evidence</h2>${transcripts.map((t, i) => `<h3>Answer ${i + 1}</h3><p><a href="${esc(audio[i].webViewLink)}">Listen to answer ${i + 1}</a> — ${speaking.answers[i].duration_seconds} seconds — recording evidence ${speaking.answers[i].automated_recording_score}/5</p><p>${esc(speaking.answers[i].feedback.join(" "))}</p><p><b>Reviewed transcript:</b> ${esc(t || "Not supplied; teacher must listen to assess language content.")}</p>`).join("")}${speakingLanguageHtml(report.speaking_language)}<h2>Teacher speaking checklist</h2><table><tr><th>Area</th><th>Score /5</th><th>Notes</th></tr>${["Fluency", "Pronunciation and word accuracy", "Length and development", "Relevance"].map((t) => `<tr><td>${t}</td><td></td><td></td></tr>`).join("")}</table><h2>Final placement</h2><p>Teacher level: ____________________</p><p>Teacher notes:</p><br><br></body></html>`;
}
export class GoogleWorkspaceArtifacts {
  constructor(settings, store) {
    this.settings = settings;
    this.store = store;
    this.drive = store.drive;
  }
  async folder(parent, name, key, value) {
    const q = `'${parent}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='${key}' and value='${value.replaceAll("'", "\\'")}' }`;
    const { data } = await this.drive.files.list({
      q,
      fields: "files(id)",
      pageSize: 1,
    });
    if (data.files?.length) return data.files[0].id;
    return (
      await this.drive.files.create({
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parent],
          appProperties: { [key]: value },
        },
        fields: "id",
      })
    ).data.id;
  }
  async attemptFolder(user, id) {
    this.attemptFolders ??= new Map();
    const key = `${user.user_id}:${id}`;
    const cached = this.attemptFolders.get(key);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = this.createAttemptFolder(user, id);
    this.attemptFolders.set(key, { promise, expires: Date.now() + 300000 });
    if (this.attemptFolders.size > 100)
      this.attemptFolders.delete(this.attemptFolders.keys().next().value);
    try {
      return await promise;
    } catch (error) {
      this.attemptFolders.delete(key);
      throw error;
    }
  }
  async createAttemptFolder(user, id) {
    const parent = await this.folder(
      this.settings.google_drive_folder_id,
      `${user.name} — ${user.email}`,
      "student_user_id",
      user.user_id,
    );
    return this.folder(parent, `Submission — ${id}`, "submission_id", id);
  }
  async upload(
    parent,
    name,
    content,
    mimeType = "audio/mpeg",
    properties = {},
    existing,
  ) {
    if (existing === undefined) {
      const q = `'${parent}' in parents and trashed=false and name='${name.replaceAll("'", "\\'")}'`;
      const { data } = await this.drive.files.list({
        q,
        fields: "files(id,webViewLink)",
        pageSize: 1,
      });
      existing = data.files?.[0] || null;
    }
    const media = { mimeType, body: Readable.from(content) };
    if (existing)
      return (
        await this.drive.files.update({
          fileId: existing.id,
          media,
          fields: "id,webViewLink",
        })
      ).data;
    return (
      await this.drive.files.create({
        requestBody: { name, parents: [parent], appProperties: properties },
        media,
        fields: "id,webViewLink",
      })
    ).data;
  }
  async putChunk(user, id, number, index, total, content) {
    const folder = await this.attemptFolder(user, id);
    if (index === 0) {
      const { data } = await this.drive.files.list({
        q: `'${folder}' in parents and trashed=false and appProperties has { key='kind' and value='upload-chunk' } and appProperties has { key='answer' and value='${number}' }`,
        fields: "files(id)",
        pageSize: 100,
      });
      await Promise.all(
        (data.files || []).map((f) =>
          this.drive.files.delete({ fileId: f.id }),
        ),
      );
    }
    return this.upload(
      folder,
      `upload-${number}-${index}.part`,
      content,
      "application/octet-stream",
      {
        kind: "upload-chunk",
        answer: String(number),
        index: String(index),
        total: String(total),
        user_id: user.user_id,
      },
    );
  }
  async readChunks(user, id) {
    const folder = await this.attemptFolder(user, id);
    const { data } = await this.drive.files.list({
      q: `'${folder}' in parents and trashed=false and appProperties has { key='kind' and value='upload-chunk' }`,
      fields: "files(id,appProperties)",
      pageSize: 100,
    });
    return Promise.all(
      [1, 2, 3].map(async (number) => {
        const files = (data.files || [])
          .filter(
            (f) =>
              f.appProperties.answer === String(number) &&
              f.appProperties.user_id === user.user_id,
          )
          .sort(
            (a, b) =>
              Number(a.appProperties.index) - Number(b.appProperties.index),
          );
        const total = Number(files[0]?.appProperties.total);
        if (
          !total ||
          total > 6 ||
          files.length !== total ||
          files.some(
            (f, i) =>
              Number(f.appProperties.index) !== i ||
              Number(f.appProperties.total) !== total,
          )
        )
          throw new HttpError(
            422,
            `Speaking answer ${number} has incomplete uploads.`,
          );
        return Buffer.concat(
          await Promise.all(
            files.map(async (f) =>
              Buffer.from(
                (
                  await this.drive.files.get(
                    { fileId: f.id, alt: "media" },
                    { responseType: "arraybuffer" },
                  )
                ).data,
              ),
            ),
          ),
        );
      }),
    );
  }
  async createSubmission({
    submission_id,
    user,
    writing,
    transcripts,
    recordings,
    report,
    speaking,
  }) {
    const folder = await this.attemptFolder(user, submission_id);
    // One listing for all recordings and the report, rather than four serial lookups.
    const { data } = await this.drive.files.list({
      q: `'${folder}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,webViewLink)",
      pageSize: 100,
    });
    const existing = data.files || [];
    const audio = await Promise.all(
      recordings.map((b, i) =>
        this.upload(
          folder,
          `Speaking answer ${i + 1}.mp3`,
          b,
          "audio/mpeg",
          {
            kind: "speaking-audio",
          },
          existing.find(
            (file) => file.name === `Speaking answer ${i + 1}.mp3`,
          ) || null,
        ),
      ),
    );
    let doc = existing.find(
      (file) => file.mimeType === "application/vnd.google-apps.document",
    );
    if (!doc)
      doc = (
        await this.drive.files.create({
          requestBody: {
            name: `Kaplan Placement Report — ${user.name}`,
            mimeType: "application/vnd.google-apps.document",
            parents: [folder],
            appProperties: { submission_id },
          },
          media: {
            mimeType: "text/html",
            body: Readable.from(
              Buffer.from(
                reportHtml(user, writing, transcripts, report, speaking, audio),
              ),
            ),
          },
          fields: "id,webViewLink",
        })
      ).data;
    await this.shareWithAdmins(folder);
    return {
      audio_folder_url: `https://drive.google.com/drive/folders/${folder}`,
      doc_url: doc.webViewLink,
      audio_urls: audio.map(
        (f) => f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      ),
    };
  }
  async refreshReport(row, report, speaking) {
    const folder = row.audio_folder_url?.match(/\/folders\/([\w-]+)/)?.[1];
    if (!folder)
      throw new HttpError(409, "This submission has no Google Drive folder.");
    const transcripts = [1, 2, 3].map(
      (number) => row[`speaking_transcript_${number}`] || "",
    );
    const audio = [1, 2, 3].map((number) => ({
      webViewLink: row[`audio_${number}_url`] || "",
    }));
    const { data } = await this.drive.files.list({
      q: `'${folder}' in parents and trashed=false and appProperties has { key='report_version' and value='strict-1.1' }`,
      fields: "files(id,webViewLink)",
      pageSize: 1,
    });
    if (data.files?.[0]) return data.files[0].webViewLink;
    const doc = await this.drive.files.create({
      requestBody: {
        name: `Kaplan Placement Report — ${row.name} — Strict`,
        mimeType: "application/vnd.google-apps.document",
        parents: [folder],
        appProperties: {
          submission_id: row.submission_id,
          report_version: "strict-1.1",
        },
      },
      media: {
        mimeType: "text/html",
        body: Readable.from(
          Buffer.from(
            reportHtml(
              { name: row.name, email: row.email },
              row.writing_answer,
              transcripts,
              report,
              speaking,
              audio,
            ),
          ),
        ),
      },
      fields: "id,webViewLink",
    });
    return doc.data.webViewLink;
  }
  async shareWithAdmins(folder) {
    await Promise.all(
      (await this.store.all("Users"))
        .filter((u) => u.role === "admin" && u.status === "active")
        .map((u) => this.share(folder, u.email)),
    );
  }
  async share(folder, email) {
    try {
      await this.drive.permissions.create({
        fileId: folder,
        requestBody: { type: "user", role: "reader", emailAddress: email },
        sendNotificationEmail: false,
        fields: "id",
      });
    } catch {
      /* Owner permissions or domain policies may reject a redundant share. */
    }
  }
  async shareExistingWithAdmin(email) {
    for (const row of await this.store.all("Results")) {
      const id = row.audio_folder_url?.match(/\/folders\/([\w-]+)/)?.[1];
      if (id) await this.share(id, email);
    }
  }
  async exportReportPdf(url) {
    const id = url?.match(/\/document\/d\/([\w-]+)/)?.[1];
    if (!id)
      throw new HttpError(
        409,
        "This submission does not have an exportable Google Doc.",
      );
    return Buffer.from(
      (
        await this.drive.files.export(
          { fileId: id, mimeType: "application/pdf" },
          { responseType: "arraybuffer" },
        )
      ).data,
    );
  }
  async downloadRecording(url) {
    const id = url?.match(/\/file\/d\/([\w-]+)/)?.[1];
    if (!id)
      throw new HttpError(
        404,
        "This recording does not have a valid Google Drive link.",
      );
    return Buffer.from(
      (
        await this.drive.files.get(
          { fileId: id, alt: "media" },
          { responseType: "arraybuffer" },
        )
      ).data,
    );
  }
}
