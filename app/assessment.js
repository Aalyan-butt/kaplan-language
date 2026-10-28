import { round } from "./checker.js";

const prompts = [
  [
    "weekend",
    "saturday",
    "sunday",
    "went",
    "visited",
    "stayed",
    "played",
    "worked",
    "watched",
    "did",
  ],
  [
    "proud",
    "achieved",
    "achievement",
    "passed",
    "won",
    "completed",
    "helped",
    "success",
    "successful",
    "award",
    "accomplished",
  ],
  [
    "place",
    "visited",
    "went",
    "city",
    "country",
    "park",
    "museum",
    "beach",
    "restaurant",
    "school",
    "home",
    "there",
  ],
];
const stopWords = new Set(
  "a an and are as at be because been but by can did do for from had has have he her him his how i in is it its me my of on or our she so that the their them they this to was we were what when where which who why will with you your".split(
    " ",
  ),
);
const vagueWords = new Set([
  "good",
  "fine",
  "okay",
  "ok",
  "just",
  "very",
  "perfectly",
  "thing",
  "things",
  "stuff",
  "like",
]);
const wordsOf = (text) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];

function vocabularyScore(text, language) {
  const words = wordsOf(text),
    content = words.filter((word) => !stopWords.has(word));
  if (words.length < 8) return 1;
  const diversity = new Set(content).size / Math.max(1, content.length),
    vagueRate =
      content.filter((word) => vagueWords.has(word)).length /
      Math.max(1, content.length);
  let score =
    diversity >= 0.75
      ? 5
      : diversity >= 0.62
        ? 4
        : diversity >= 0.5
          ? 3
          : diversity >= 0.38
            ? 2
            : 1;
  if (words.length < 15) score = Math.min(score, 2);
  else if (words.length < 25) score = Math.min(score, 3);
  if (vagueRate >= 0.2) score -= 2;
  else if (vagueRate >= 0.1) score--;
  if (language.issues.some((issue) => issue.category === "Vocabulary")) score--;
  return Math.max(1, score);
}

function relevanceScore(text, answer, wordCount) {
  const words = new Set(wordsOf(text)),
    matches = prompts[answer - 1].filter((word) => words.has(word)).length;
  if (!matches) return 1;
  if (matches === 1) return wordCount >= 20 ? 2 : 1;
  if (matches === 2) return wordCount >= 30 ? 4 : 3;
  return wordCount >= 40 ? 5 : 4;
}

function developmentScore(wordCount, language) {
  let score =
    wordCount >= 45
      ? 5
      : wordCount >= 30
        ? 4
        : wordCount >= 20
          ? 3
          : wordCount >= 12
            ? 2
            : 1;
  if (
    language.issues.some((issue) =>
      ["Run-on sentence", "Sentence boundaries"].includes(issue.category),
    )
  )
    score--;
  return Math.max(1, score);
}

export function assessSpeaking(
  languageReports,
  recordingAssessment,
  transcripts,
) {
  const answers = languageReports.map((language, index) => {
    const answer = index + 1,
      recording = recordingAssessment?.answers?.[index] || {
        automated_recording_score: 1,
      };
    if (!language)
      return {
        answer,
        status: "transcript_unavailable",
        grammar_score: 1,
        vocabulary_score: 1,
        sentence_score: 1,
        development_score: 1,
        relevance_score: 1,
        recording_quality_score: recording.automated_recording_score,
        language_score: 1,
        final_score: 1,
        feedback: [
          "No automatic transcript was captured, so grammar and vocabulary could not be verified. A teacher must assess the recording.",
        ],
      };
    const grammar = language.scores.grammar,
      vocabulary = vocabularyScore(transcripts[index] || "", language),
      sentenceIssues = language.issues.filter((issue) =>
        [
          "Sentence structure",
          "Sentence fragment",
          "Sentence boundaries",
          "Missing subject",
          "Missing verb",
          "Run-on sentence",
          "Comma splice",
          "Auxiliary verb",
          "Question structure",
        ].includes(issue.category),
      ).length,
      sentence =
        sentenceIssues === 0
          ? 5
          : sentenceIssues === 1
            ? 4
            : sentenceIssues === 2
              ? 3
              : sentenceIssues === 3
                ? 2
                : 1,
      development = developmentScore(language.metrics.word_count, language),
      relevance = relevanceScore(
        transcripts[index] || "",
        answer,
        language.metrics.word_count,
      ),
      languageScore = round(
        grammar * 0.35 +
          vocabulary * 0.2 +
          sentence * 0.2 +
          development * 0.15 +
          relevance * 0.1,
        1,
      );
    let final = round(
      languageScore * 0.85 + recording.automated_recording_score * 0.15,
      1,
    );
    if (grammar <= 2) final = Math.min(final, 3);
    if (relevance === 1) final = Math.min(final, 2.5);
    if (language.metrics.word_count < 10) final = Math.min(final, 2);
    const feedback = [];
    if (grammar < 4) feedback.push("Grammar errors reduce the score.");
    if (vocabulary < 4)
      feedback.push("Vocabulary is repetitive, vague or too limited.");
    if (sentence < 4)
      feedback.push("Sentence structure needs clearer, complete clauses.");
    if (development < 4) feedback.push("The answer needs more development.");
    if (relevance < 3)
      feedback.push(
        "The transcript does not answer the prompt clearly enough.",
      );
    return {
      answer,
      status: "checked",
      grammar_score: grammar,
      vocabulary_score: vocabulary,
      sentence_score: sentence,
      development_score: development,
      relevance_score: relevance,
      recording_quality_score: recording.automated_recording_score,
      language_score: languageScore,
      final_score: final,
      feedback,
    };
  });
  return {
    version: "speaking-strict-1.0",
    overall_score: round(
      answers.reduce((total, answer) => total + answer.final_score, 0) /
        answers.length,
      1,
    ),
    answers,
    formula:
      "Final speaking score: 85% language and 15% recording quality. Language score: grammar 35%, vocabulary 20%, sentence structure 20%, development 15%, relevance 10%. Strict caps apply to serious grammar errors, off-topic answers and very short answers.",
    notice:
      "Automatic language scores use the hidden speech transcript. A teacher must confirm transcript accuracy, pronunciation, fluency and final placement by listening to the recording.",
  };
}
