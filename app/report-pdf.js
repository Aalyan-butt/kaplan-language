import PDFDocument from "pdfkit";
import { analyseSubmission } from "./checker.js";
import { assessSpeaking, assessPlacement } from "./assessment.js";

// Use flowing text rather than browser grids or wide tables. PDFKit continues
// paragraphs onto the next page inside the same margins, including long words.
export async function createReportPdf(row) {
  const transcripts = [1, 2, 3].map(
    (n) => row[`speaking_transcript_${n}`] || "",
  );
  const fresh = analyseSubmission(row.writing_answer || "", transcripts);
  let saved = {};
  try {
    saved = JSON.parse(row.report_json || "{}");
  } catch {}
  const recordings = saved.speaking_recording || { answers: [] };
  const speaking = assessSpeaking(fresh.speaking, recordings, transcripts);
  const placement = assessPlacement(
    fresh.writing.total,
    speaking.overall_score,
  );
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 60, left: 54, right: 54 },
    bufferPages: true,
    info: {
      Title: `Kaplan Placement Report - ${row.name}`,
      Author: "Kaplan English Placement",
    },
  });
  const buffers = [];
  const finished = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
  const width = doc.page.width - 108;
  const clean = (value) =>
    String(value ?? "")
      .replaceAll("\r", "")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2192/g, " -> ");
  const room = (height) => {
    if (doc.y + height > doc.page.height - 60) doc.addPage();
  };
  const paragraph = (value, options = {}) => {
    doc
      .font(options.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor("#272124");
    doc.text(clean(value), 54, doc.y, {
      width,
      lineGap: 4,
      paragraphGap: 5,
      ...options,
    });
    doc.moveDown(0.45);
  };
  const heading = (title, size = 15) => {
    room(65);
    doc
      .moveDown(0.6)
      .font("Helvetica-Bold")
      .fontSize(size)
      .fillColor("#731f35");
    doc.text(clean(title), 54, doc.y, { width, lineGap: 2 });
    doc.moveDown(0.45);
  };
  const marks = (entries) => {
    for (const [label, value] of entries) {
      room(28);
      paragraph(`${label}: ${value}`, { bold: true });
    }
  };
  const issues = (list) => {
    if (!list?.length) {
      paragraph(
        "No rule-based issues identified. Teacher review is still required.",
      );
      return;
    }
    for (const [index, issue] of list.entries()) {
      room(100);
      paragraph(`${index + 1}. ${issue.category}`, { bold: true });
      paragraph(`Original: ${issue.original}`);
      paragraph(`Correction: ${issue.correction || "Teacher review required"}`);
      paragraph(`Explanation: ${issue.explanation}`);
    }
  };
  heading("KAPLAN", 24);
  paragraph("ENGLISH PLACEMENT REPORT", { bold: true });
  heading(row.name || "Student", 18);
  paragraph(
    `Email: ${row.email || "-"}\nSubmitted: ${row.submitted_at || "-"}\nReport ID: ${row.submission_id || "-"}`,
  );
  paragraph(
    "Automated first-pass assessment. A teacher must confirm the final placement, transcript accuracy, pronunciation and fluency.",
  );
  heading("Writing assessment");
  marks([
    ["Total", `${fresh.writing.total}/20`],
    ["Speaking", `${speaking.overall_score}/5`],
    ["Combined score", `${placement.total}/20`],
    ["Placement", row.teacher_level || placement.level],
    ...Object.entries(fresh.writing.scores).map(([key, value]) => [
      {
        grammar: "Grammar",
        spelling_punctuation: "Spelling and punctuation",
        vocabulary: "Vocabulary",
        task_length: "Task and length",
      }[key],
      `${value}/5`,
    ]),
  ]);
  paragraph(placement.formula);
  heading("Task-completion feedback", 12);
  for (const feedback of fresh.writing.task_feedback) paragraph(feedback);
  heading("Original writing answer", 12);
  paragraph(row.writing_answer || "No writing answer available.");
  heading("Writing mistakes and corrections", 12);
  issues(fresh.writing.issues);
  heading("Personal learning guidelines", 12);
  for (const lesson of fresh.writing.lessons) {
    heading(lesson.title, 11);
    paragraph(lesson.rule);
    paragraph(
      `Examples: ${lesson.examples}\nCommon mistake: ${lesson.mistake}`,
    );
  }
  // Each answer begins on its own page. Metrics, audio details, transcripts and
  // corrections use separate lines; long answers can span multiple pages.
  for (let index = 0; index < 3; index++) {
    doc.addPage();
    const grade = speaking.answers[index];
    const audio = recordings.answers?.[index] || {};
    heading(`Speaking - Answer ${index + 1}`, 18);
    marks([
      ["Final speaking mark", `${grade.final_score}/5`],
      ["Grammar", `${grade.grammar_score}/5`],
      ["Vocabulary", `${grade.vocabulary_score}/5`],
      ["Sentence quality", `${grade.sentence_score}/5`],
      ["Development", `${grade.development_score}/5`],
      ["Relevance", `${grade.relevance_score}/5`],
      ["Recording quality", `${grade.recording_quality_score}/5`],
      [
        "Duration",
        audio.duration_seconds == null
          ? "Unavailable"
          : `${audio.duration_seconds} seconds`,
      ],
    ]);
    heading("Speaking feedback", 12);
    paragraph(grade.feedback.join(" "));
    paragraph(
      "Listen to the recording using Load audio in the in-app report. Audio is not embedded in this PDF.",
    );
    heading("Automatically captured transcript", 12);
    paragraph(
      transcripts[index] ||
        "Transcript unavailable. A teacher must listen to the recording.",
    );
    heading("Mistakes and corrections", 12);
    issues(fresh.speaking[index]?.issues);
  }
  heading("Teacher decision");
  paragraph(`Placement: ${row.teacher_level || placement.level}`, {
    bold: true,
  });
  paragraph(
    `Teacher notes: ${row.teacher_notes || "Awaiting teacher review."}`,
  );
  const { count } = doc.bufferedPageRange();
  for (let page = 0; page < count; page++) {
    doc.switchToPage(page);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .save()
      .strokeColor("#ded6d8")
      .moveTo(54, doc.page.height - 42)
      .lineTo(doc.page.width - 54, doc.page.height - 42)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#70646a")
      .text(
        `Kaplan English Placement | Page ${page + 1} of ${count}`,
        54,
        doc.page.height - 33,
        { width, lineBreak: false },
      );
    doc.restore();
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return finished;
}
