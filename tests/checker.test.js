import test from "node:test";
import assert from "node:assert/strict";
import fixtures from "./checker-fixtures.json" with { type: "json" };
import { analyse } from "../app/checker.js";
import { LESSONS } from "../app/lessons.js";
import { speakingRecordingAssessment } from "../app/submissions.js";
test("Stricter checker preserves reference metrics and established corrections", () => {
  for (const [i, f] of fixtures.entries()) {
    const report = analyse(f.text);
    for (const [key, value] of Object.entries(f.report.metrics))
      assert.equal(report.metrics[key], value, `Fixture ${i}, metric ${key}`);
    for (const issue of f.report.issues.filter(
      (issue) => !["missing-verb", "comma-splice"].includes(issue.rule_id),
    ))
      assert.ok(
        report.issues.some(
          (item) =>
            item.rule_id === issue.rule_id &&
            item.start === issue.start &&
            item.correction === issue.correction,
        ),
        `Fixture ${i} lost ${issue.rule_id}`,
      );
    assert.equal(report.checker_version, "rules-1.1");
  }
});
test("lesson bank and speaking evidence", () => {
  assert.ok(LESSONS.length >= 25);
  const report = speakingRecordingAssessment(
    JSON.stringify(
      Array.from({ length: 3 }, () => ({
        duration: 5,
        rms: 0.005,
        silence_ratio: 0.8,
        clipping_ratio: 0.1,
      })),
    ),
  );
  assert.equal(report.overall_recording_score, 1);
  assert.equal(report.answers[0].feedback.length, 4);
  assert.throws(() => speakingRecordingAssessment("[{}, {}, {}]"), {
    status: 422,
  });
  assert.throws(() => speakingRecordingAssessment("not-json"), { status: 422 });
});
