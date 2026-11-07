import test from "node:test";
import assert from "node:assert/strict";
import { assessPlacement } from "../app/assessment.js";
import { assessResult } from "../app/result-assessment.js";

test("weak speaking lowers placement despite strong writing", () => {
  assert.equal(assessPlacement(18, 2.7).total, 14.4);
  assert.equal(assessPlacement(18, 2.7).level, "B1");
  assert.equal(assessPlacement(18, 1).level, "A2");
  assert.equal(assessPlacement(18, 4.5).level, "B2");
  assert.equal(assessPlacement(9, 1).level, "Below A2");
});

test("existing reports recompute placement from current writing and speaking", () => {
  const result = assessResult({
    writing_answer:
      "Yesterday I visited the museum. We enjoyed the paintings because we were happy to learn about history.",
    speaking_transcript_1: "I will visit the park tomorrow.",
    speaking_transcript_2: "I like reading books.",
    speaking_transcript_3: "I am visiting the city tomorrow.",
    teacher_level: "B2",
    report_json: JSON.stringify({
      level: "B2",
      speaking_recording: {
        answers: [1, 2, 3].map(() => ({ automated_recording_score: 5 })),
      },
    }),
  });
  const expected = assessPlacement(
    result.row.total_score,
    result.row.speaking_auto_score,
  );
  assert.equal(result.row.suggested_level, expected.level);
  assert.equal(result.report.level, expected.level);
  assert.equal(result.report.placement_assessment.total, expected.total);
  assert.equal(result.row.teacher_level, "B2");
});
