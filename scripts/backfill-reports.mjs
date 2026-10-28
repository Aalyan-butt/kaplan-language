import { getSettings } from "../app/config.js";
import { GoogleSheetStore } from "../app/store.js";
import { GoogleWorkspaceArtifacts } from "../app/workspace.js";
import { analyseSubmission } from "../app/checker.js";
import { assessSpeaking } from "../app/assessment.js";

const apply = process.argv.includes("--apply");
const settings = getSettings();
if (!settings.google_ready)
  throw new Error("Google configuration is incomplete.");
const store = new GoogleSheetStore(settings);
const workspace = new GoogleWorkspaceArtifacts(settings, store);
const rows = await store.all("Results");

for (const row of rows) {
  const transcripts = [1, 2, 3].map(
    (number) => row[`speaking_transcript_${number}`] || "",
  );
  let oldReport = {},
    speaking;
  try {
    oldReport = JSON.parse(row.report_json || "{}");
  } catch {}
  try {
    speaking = JSON.parse(row.speaking_metrics_json || "{}");
  } catch {}
  speaking = speaking?.answers ? speaking : oldReport.speaking_recording;
  if (!speaking?.answers?.length) {
    console.log(`SKIP ${row.submission_id}: recording metrics unavailable`);
    continue;
  }
  const analysed = analyseSubmission(row.writing_answer, transcripts);
  const report = analysed.writing;
  report.speaking_language = analysed.speaking.map((language, index) =>
    language
      ? {
          ...language,
          answer: index + 1,
          status: "checked",
          source: "automatic_hidden_transcript",
        }
      : {
          answer: index + 1,
          status: "transcript_required",
          source: "none",
          notice:
            "No automatic transcript was captured. A teacher must assess the recording.",
        },
  );
  report.speaking_assessment = assessSpeaking(
    analysed.speaking,
    speaking,
    transcripts,
  );
  report.speaking_language = report.speaking_language.map(
    (language, index) => ({
      ...language,
      assessment: report.speaking_assessment.answers[index],
    }),
  );
  console.log(
    `${apply ? "UPDATE" : "WOULD UPDATE"} ${row.submission_id}: speaking ${row.speaking_auto_score || "—"} -> ${report.speaking_assessment.overall_score}/5`,
  );
  if (!apply) continue;
  const docUrl = await workspace.refreshReport(row, report, speaking);
  await store.update("Results", "submission_id", row.submission_id, {
    speaking_auto_score: report.speaking_assessment.overall_score,
    speaking_audio_feedback: report.speaking_assessment.answers
      .map((a) => `Answer ${a.answer}: ${a.feedback.join(" ")}`)
      .join(" | "),
    formula_version: `${report.formula_version}+speaking-strict-1.1`,
    report_json: JSON.stringify({ ...report, speaking_recording: speaking }),
    doc_url: docUrl,
  });
}
console.log(
  `${apply ? "Updated" : "Dry run checked"} ${rows.length} existing report(s).`,
);
