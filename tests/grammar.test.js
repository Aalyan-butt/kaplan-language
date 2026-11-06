import test from "node:test";
import assert from "node:assert/strict";
import { analyse, analyseSubmission } from "../app/checker.js";
import { speakingLanguageHtml } from "../app/workspace.js";
import { assessSpeaking } from "../app/assessment.js";
test("strict grammar flags identifiable sentence and verb defects with correct spans", () => {
  const examples = [
    ["I very happy.", "missing-copula", "I am very happy"],
    ["She playing football.", "continuous-auxiliary", "She is playing"],
    ["Went to the park.", "missing-subject", ""],
    ["Because I was tired.", "dependent-fragment", ""],
    ["He like football.", "third-person-present", "likes"],
    ["They enjoys music.", "plural-present", "enjoy"],
    ["I can went home.", "modal-base", "go"],
    ["I have went home.", "perfect-participle", "gone"],
    ["I am went home.", "double-finite", "went"],
    ["I enjoy to play.", "gerund-pattern", "enjoy playing"],
  ];
  for (const [text, rule, correction] of examples) {
    const r = analyse(text),
      issue = r.issues.find((i) => i.rule_id === rule);
    assert.ok(issue, text);
    assert.equal(issue.correction, correction);
    assert.equal(text.slice(issue.start, issue.end), issue.original);
    assert.ok(r.scores.grammar < 5, text);
  }
});
test("valid sentence patterns and introductory phrases avoid structural false positives", () => {
  const examples = [
    "Last weekend, I visited the museum with my family because we wanted to learn about history.",
    "Because I was tired, I went home.",
    "I sing and I enjoy cooking.",
    "She likes painting.",
    "They have gone home.",
    "My hobbies are reading and swimming. I like to read books because they are interesting.",
  ];
  for (const text of examples) {
    const r = analyse(text);
    assert.equal(
      r.scores.grammar,
      5,
      JSON.stringify({ text, issues: r.issues }),
    );
  }
  const splice = analyse("I was happy, I went home.");
  assert.ok(splice.issues.some((i) => i.rule_id === "comma-splice"));
});
test("hobby transcript receives grammar checks without a past-tense task requirement", () => {
  const reports = analyseSubmission("Yesterday I went to the park.", [
    "I very happy. She playing football.",
    "My hobbies are reading books and swimming in the pool. I like to read at home because stories are interesting and help me relax.",
    "",
  ]);
  assert.ok(
    reports.speaking[0].issues.some(
      (i) => i.section === "speaking_1" && i.rule_id === "missing-copula",
    ),
  );
  assert.equal(reports.speaking[1].scores.grammar, 5);
  assert.ok(
    !reports.speaking[1].task_feedback.some((f) => /past|where|when/i.test(f)),
  );
  assert.equal(reports.speaking[2], null);
  const html = speakingLanguageHtml([
    { ...reports.speaking[0], answer: 1, status: "checked" },
    {
      answer: 2,
      status: "transcript_required",
      notice: "No transcript supplied.",
    },
  ]);
  assert.match(html, /grammar 1\/5/);
  assert.match(html, /No transcript supplied/);
});
test("strict speaking assessment penalizes screenshot-like grammar, vocabulary and relevance defects", () => {
  const transcripts = [
    "I did I did the lost weekend I am going I am fine what I doing this dad perfectly good very good I am perfectly fine is the same ok fine bye",
    "hello how are you answer just perform the test find okay everything is good okay just do it do it",
    "just wait I don't know stop asking ok good I were doing this I am fine like how are you I am fine exactly good easy to say perfectly fine",
  ];
  const analysed = analyseSubmission(
    "Yesterday I went to the park.",
    transcripts,
  );
  const recording = {
    answers: transcripts.map(() => ({ automated_recording_score: 5 })),
  };
  const strict = assessSpeaking(analysed.speaking, recording, transcripts);
  assert.ok(strict.overall_score <= 3, JSON.stringify(strict));
  assert.ok(strict.answers.every((answer) => answer.vocabulary_score <= 3));
  assert.ok(
    analysed.speaking[0].issues.some(
      (issue) => issue.rule_id === "question-auxiliary",
    ),
  );
  assert.ok(
    analysed.speaking[2].issues.some(
      (issue) => issue.rule_id === "i-were-agreement",
    ),
  );
});
test("speaking transcripts do not receive sentence-start capitalisation errors", () => {
  const report = analyseSubmission("Yesterday I visited the park.", [
    "hello i felt proud because I passed my test.",
    "",
    "",
  ]).speaking[0];
  assert.ok(
    !report.issues.some((issue) => issue.rule_id === "sentence-capital"),
  );
  assert.ok(report.issues.some((issue) => issue.rule_id === "capital-i"));
});
