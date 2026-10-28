import { randomUUID } from "node:crypto";
import { HttpError, iso } from "./security.js";
import { analyseSubmission, round } from "./checker.js";
import { submissionSchema } from "./models.js";
import { assessSpeaking } from "./assessment.js";
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
export function validMp3(content, type, label) {
  if (!["audio/mpeg", "audio/mp3", "application/octet-stream"].includes(type))
    throw new HttpError(415, `${label} must be an MP3 file.`);
  if (!content?.length || content.length > MAX_AUDIO_BYTES)
    throw new HttpError(413, `${label} must be between 1 byte and 6 MB.`);
  if (!(
    content.subarray(0, 3).toString() === "ID3" ||
    (content.length > 1 && content[0] === 255 && (content[1] & 224) === 224)
  ))
    throw new HttpError(422, `${label} is not a valid MP3 recording.`);
  return content;
}
export function speakingRecordingAssessment(raw) {
  let metrics;
  try {
    metrics = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new HttpError(422, "Invalid speaking recording metrics.");
  }
  if (!Array.isArray(metrics) || metrics.length !== 3)
    throw new HttpError(422, "Three speaking metric records are required.");
  const answers = metrics.map((item, i) => {
    const values = ["duration", "rms", "silence_ratio", "clipping_ratio"].map(
      (k) => item?.[k],
    );
    if (
      values.some(
        (v) =>
          v == null ||
          typeof v === "boolean" ||
          v === "" ||
          !Number.isFinite(Number(v)),
      )
    )
      throw new HttpError(
        422,
        `Speaking answer ${i + 1} has invalid recording metrics.`,
      );
    const [duration, rms, silence, clipping] = values.map((v, j) =>
        Math.max(0, Math.min(j === 0 ? 90 : 1, Number(v))),
      ),
      length_score = duration >= 20 ? 5 : duration >= 10 ? 3 : 1,
      audibility_score =
        rms >= 0.025 && rms <= 0.35 ? 5 : rms >= 0.012 && rms <= 0.5 ? 3 : 1,
      continuity_score = silence <= 0.35 ? 5 : silence <= 0.55 ? 3 : 1,
      recording_quality_score = clipping < 0.01 ? 5 : clipping < 0.05 ? 3 : 1,
      feedback = [];
    if (duration < 20)
      feedback.push("The answer is short; give a fuller spoken response.");
    if (rms < 0.025)
      feedback.push("The recording is quiet; speak closer to the microphone.");
    if (silence > 0.35)
      feedback.push(
        "There are frequent or long pauses for the recording length.",
      );
    if (clipping >= 0.01)
      feedback.push(
        "The audio peaks or distorts; move slightly away from the microphone.",
      );
    if (!feedback.length)
      feedback.push(
        "Recording length, continuity and signal quality are suitable for teacher review.",
      );
    return {
      answer: i + 1,
      duration_seconds: round(duration, 1),
      rms: round(rms, 4),
      silence_ratio: round(silence, 3),
      clipping_ratio: round(clipping, 4),
      length_score,
      audibility_score,
      continuity_score,
      recording_quality_score,
      automated_recording_score: round(
        (length_score +
          audibility_score +
          continuity_score +
          recording_quality_score) /
          4,
        1,
      ),
      feedback,
    };
  });
  return {
    overall_recording_score: round(
      answers.reduce((n, a) => n + a.automated_recording_score, 0) / 3,
      1,
    ),
    answers,
    manual_required: [
      "fluency",
      "pronunciation",
      "word accuracy",
      "relevance",
      "natural speech",
    ],
    notice:
      "This automated score measures recording evidence only (length, audibility, pauses and clipping). It does not measure pronunciation or understand spoken words. A teacher must score the language.",
  };
}
export async function createSubmission(req, store, workspace, service) {
  const p = submissionSchema.parse(req.body),
    user = req.user,
    id = p.submission_id,
    existing = await store.find("Results", "submission_id", id);
  if (existing) {
    if (existing.user_id !== user.user_id)
      throw new HttpError(409, "Submission identifier is already in use.");
    return { ok: true, submission_id: id, duplicate: true };
  }
  const used = Number(user.attempts_used || 0);
  if (used >= Number(user.attempts_allowed || 1))
    throw new HttpError(409, "No test attempts remain for this account.");
  let recordings;
  if (p.uploaded_audio) {
    if (store.google) recordings = await workspace.readChunks(user, id);
    else
      recordings = [1, 2, 3].map((n) => {
        const chunks = store.chunks.get(`${user.user_id}:${id}:${n}`);
        if (!chunks || chunks.parts.size !== chunks.total)
          throw new HttpError(
            422,
            `Speaking answer ${n} has incomplete uploads.`,
          );
        return Buffer.concat(
          Array.from({ length: chunks.total }, (_, i) => chunks.parts.get(i)),
        );
      });
    recordings.forEach((b, i) =>
      validMp3(b, "audio/mpeg", `Speaking answer ${i + 1}`),
    );
  } else
    recordings = [1, 2, 3].map((n) => {
      const f = req.files?.[`audio_${n}`]?.[0];
      if (!f) throw new HttpError(422, `Speaking answer ${n} is required.`);
      return validMp3(f.buffer, f.mimetype, `Speaking answer ${n}`);
    });
  const transcripts = [
      p.speaking_transcript_1,
      p.speaking_transcript_2,
      p.speaking_transcript_3,
    ],
    report = analyseSubmission(p.writing_answer, transcripts),
    w = report.writing,
    speaking = speakingRecordingAssessment(p.speaking_metrics),
    metrics = w.metrics,
    scores = w.scores,
    submitted_at = iso();
  w.speaking_language = report.speaking.map((language, index) =>
    language
      ? {
          ...language,
          answer: index + 1,
          status: "checked",
          source: "reviewed_transcript",
        }
      : {
          answer: index + 1,
          status: "transcript_required",
          source: "none",
          notice:
            "No transcript was supplied. Listen to the recording; grammar has not been checked.",
        },
  );
  w.speaking_assessment = assessSpeaking(
    report.speaking,
    speaking,
    transcripts,
  );
  w.speaking_language = w.speaking_language.map((language, index) => ({
    ...language,
    assessment: w.speaking_assessment.answers[index],
  }));
  let artifacts = {
    audio_folder_url: "",
    doc_url: "",
    audio_urls: ["", "", ""],
  };
  if (store.google) {
    try {
      artifacts = await workspace.createSubmission({
        submission_id: id,
        user,
        writing: p.writing_answer,
        transcripts,
        recordings,
        report: w,
        speaking,
      });
    } catch (error) {
      await store.append("Jobs", {
        job_id: randomUUID(),
        submission_id: id,
        job_type: "submission_upload_retry_required",
        status: "failed",
        attempt_count: 1,
        next_attempt_at: "",
        last_error: String(error.message).slice(0, 500),
        created_at: submitted_at,
        updated_at: submitted_at,
      });
      throw new HttpError(
        503,
        "Google storage is temporarily unavailable. Your attempt was not used; please submit again.",
      );
    }
  }
  await store.append("Results", {
    submission_id: id,
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    started_at: p.started_at,
    submitted_at,
    time_seconds: p.time_seconds,
    paste_flag: p.paste_flag,
    paste_events: p.paste_events,
    writing_answer: p.writing_answer,
    speaking_transcript_1: transcripts[0],
    speaking_transcript_2: transcripts[1],
    speaking_transcript_3: transcripts[2],
    word_count: metrics.word_count,
    sentence_count: metrics.sentence_count,
    average_sentence_length: metrics.average_sentence_length,
    unique_word_ratio: metrics.unique_word_ratio,
    grammar_score: scores.grammar,
    spelling_punctuation_score: scores.spelling_punctuation,
    vocabulary_score: scores.vocabulary,
    task_length_score: scores.task_length,
    total_score: w.total,
    suggested_level: w.level,
    formula_version: w.formula_version,
    error_count: w.issues.length,
    errors_per_100_words: w.errors_per_100_words,
    topic_flag: w.topic_flag,
    check_status: "complete",
    report_status: "pending_document",
    speaking_auto_score: w.speaking_assessment.overall_score,
    speaking_audio_feedback: speaking.answers
      .map((a) => `Answer ${a.answer}: ${a.feedback.join(" ")}`)
      .join(" | "),
    speaking_metrics_json: JSON.stringify(speaking),
    report_json: JSON.stringify({ ...w, speaking_recording: speaking }),
    doc_url: artifacts.doc_url,
    audio_folder_url: artifacts.audio_folder_url,
    ...Object.fromEntries(
      artifacts.audio_urls.map((u, i) => [`audio_${i + 1}_url`, u]),
    ),
  });
  const errorRows = [w, ...report.speaking.filter(Boolean)].flatMap((checked) =>
    checked.issues.map((i) => ({
      error_id: randomUUID(),
      submission_id: id,
      user_id: user.user_id,
      student_email: user.email,
      answer_section: i.section,
      category: i.category,
      original_text: i.original,
      start_position: i.start,
      end_position: i.end,
      suggested_correction: i.correction,
      explanation: i.explanation,
      rule_id: i.rule_id,
      checker_version: checked.checker_version,
    })),
  );
  await store.appendMany("Errors", errorRows);
  if (store.google) await store.setResultHyperlinks(id, artifacts.audio_urls);
  else {
    store.recordings ??= new Map();
    store.recordings.set(id, recordings);
  }
  await store.update("Users", "user_id", user.user_id, {
    attempts_used: used + 1,
    updated_at: submitted_at,
  });
  await service.audit("TEST_SUBMITTED", user, user, true, {
    submission_id: id,
    word_count: p.writing_answer.trim().split(/\s+/).length,
  });
  return { ok: true, submission_id: id, duplicate: false };
}
