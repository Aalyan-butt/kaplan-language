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
  assert.ok(
    !report.issues.some((issue) => issue.category === "Capitalisation"),
  );
});

test("reported learner errors reduce grammar marks", () => {
  const report = analyse(
    "My last day at my college is memorable day in my life because I will started new states in my life. My teachers also advice to pay attention. She also advice us to achieve aim in life.",
  );
  assert.ok(report.scores.grammar <= 2, JSON.stringify(report.scores));
  for (const rule of [
    "modal-regular-base",
    "memorable-article",
    "advice-verb",
    "achieve-aim",
  ])
    assert.ok(
      report.issues.some((i) => i.rule_id === rule),
      rule,
    );
  assert.ok(
    analyse("I will do to get skills in MS Word", "speaking_1").scores.grammar <
      5,
  );
  assert.ok(
    analyse("yes my favourite hobbies Garden because it helps", "speaking_2")
      .scores.grammar < 5,
  );
});

test("past-experience tasks reject present, future and mixed narration", () => {
  for (const text of [
    "I visit the museum with my family and enjoy the paintings.",
    "I will visit the museum and I will enjoy the paintings.",
    "I visited the museum. We are happy and we will return tomorrow.",
    "My family is happy. The museum is beautiful.",
    "I'm visiting the park and I'll play football.",
  ]) {
    const reports = analyseSubmission(text, [
      text,
      "My hobbies are reading and swimming.",
      text,
    ]);
    for (const report of [
      reports.writing,
      reports.speaking[0],
      reports.speaking[2],
    ]) {
      assert.equal(report.tense_requirement.accepted, false, text);
      assert.equal(report.scores.grammar, 1);
      assert.equal(report.scores.task_length, 1);
      assert.match(report.task_feedback.join(" "), /Past tense required/);
      for (const issue of report.issues)
        assert.equal(text.slice(issue.start, issue.end), issue.original);
    }
    assert.equal(reports.speaking[1].scores.grammar, 5);
    const scored = assessSpeaking(
      reports.speaking,
      { answers: [1, 2, 3].map(() => ({ automated_recording_score: 5 })) },
      [text, "My hobbies are reading and swimming.", text],
    );
    assert.equal(scored.answers[0].final_score, 1);
    assert.equal(scored.answers[2].final_score, 1);
  }
});

test("past tasks accept simple, continuous, perfect and past auxiliary constructions", () => {
  for (const text of [
    "I visited the museum and enjoyed the paintings. We were happy because we learned about history.",
    "I was walking in the park. We had planned to visit the museum but we did not go.",
    "I went home because I felt tired. I could see the stars and wanted to remember the evening.",
  ]) {
    const reports = analyseSubmission(text, [text, "", text]);
    for (const report of [
      reports.writing,
      reports.speaking[0],
      reports.speaking[2],
    ]) {
      assert.equal(
        report.tense_requirement.accepted,
        true,
        JSON.stringify(report.issues),
      );
    }
  }
});

test("speaking punctuation is absent from mistakes, counts and grammar grading", () => {
  const text =
    "I visited the museum with my family and we enjoyed the paintings because we wanted to learn about history and we talked about the pictures and we went home together";
  const spoken = analyseSubmission("Yesterday I visited the park.", [
    text,
    "",
    "",
  ]).speaking[0];
  const excluded = [
    "Punctuation",
    "Capitalisation",
    "Spacing",
    "Comma splice",
    "Run-on sentence",
    "Sentence boundaries",
  ];
  assert.ok(spoken.issues.every((issue) => !excluded.includes(issue.category)));
  assert.ok(excluded.every((category) => !spoken.category_counts[category]));
  assert.equal(spoken.scores.grammar, 5);
  assert.ok(
    analyse(text).issues.some((issue) => issue.category === "Punctuation"),
  );
});
