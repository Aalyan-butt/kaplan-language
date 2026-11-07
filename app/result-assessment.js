import { analyseSubmission } from "./checker.js";
import { assessSpeaking, assessPlacement } from "./assessment.js";

// Reuse CPU-heavy grammar analysis across list, report and export requests.
// The full row key invalidates automatically when answers or teacher data change.
const assessments = new Map();
const MAX_ASSESSMENTS = 200;

// Derive every displayed/exported score from the same current rules. Stored
// summaries from earlier checker versions must not override the current report.
export function assessResult(row) {
  const cacheKey = JSON.stringify(row);
  if (assessments.has(cacheKey))
    return structuredClone(assessments.get(cacheKey));
  const transcripts = [1, 2, 3].map(
    (n) => row[`speaking_transcript_${n}`] || "",
  );
  let saved = {};
  try {
    saved = JSON.parse(row.report_json || "{}");
  } catch {}
  const fresh = analyseSubmission(row.writing_answer || "", transcripts);
  let recording = saved.speaking_recording;
  if (!recording) {
    try {
      recording = JSON.parse(row.speaking_metrics_json || "{}");
    } catch {}
  }
  recording ||= { answers: [] };
  const assessment = assessSpeaking(fresh.speaking, recording, transcripts);
  const placement = assessPlacement(
    fresh.writing.total,
    assessment.overall_score,
  );
  const report = {
    ...saved,
    ...fresh.writing,
    level: placement.level,
    placement_assessment: placement,
    speaking_recording: recording,
    speaking_assessment: assessment,
    speaking_language: fresh.speaking.map((language, index) => ({
      ...language,
      answer: index + 1,
      assessment: assessment.answers[index],
    })),
  };
  const w = fresh.writing;
  const result = {
    report,
    row: {
      ...row,
      word_count: w.metrics.word_count,
      sentence_count: w.metrics.sentence_count,
      average_sentence_length: w.metrics.average_sentence_length,
      unique_word_ratio: w.metrics.unique_word_ratio,
      grammar_score: w.scores.grammar,
      spelling_punctuation_score: w.scores.spelling_punctuation,
      vocabulary_score: w.scores.vocabulary,
      task_length_score: w.scores.task_length,
      total_score: w.total,
      suggested_level: placement.level,
      placement_score: placement.total,
      formula_version: w.formula_version,
      error_count: w.issues.length,
      errors_per_100_words: w.errors_per_100_words,
      topic_flag: w.topic_flag,
      speaking_auto_score: assessment.overall_score,
    },
  };
  if (assessments.size >= MAX_ASSESSMENTS)
    assessments.delete(assessments.keys().next().value);
  assessments.set(cacheKey, result);
  return structuredClone(result);
}
