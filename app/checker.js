import data from "./checker-data.json" with { type: "json" };
import { LESSON_BY_CATEGORY } from "./lessons.js";
import { FINITE_VERBS, sentenceIssues } from "./grammar.js";
const { IRREGULAR, BRITISH, TYPOS, OVERUSED, CONNECTORS } = data;
const WRONG = Object.fromEntries(
  Object.entries(IRREGULAR)
    .filter(([b, p]) => p !== b + "ed" && p !== b && !p.includes("/"))
    .map(([b, p]) => [b + "ed", p]),
);
Object.assign(WRONG, {
  buyed: "bought",
  eated: "ate",
  taked: "took",
  seed: "saw",
  goed: "went",
  writed: "wrote",
  runned: "ran",
  thinked: "thought",
  catched: "caught",
  teached: "taught",
  bringed: "brought",
});
const PAST = Object.fromEntries(
  Object.entries(IRREGULAR)
    .filter(([, p]) => !p.includes("/"))
    .map(([b, p]) => [p, b]),
);
const VERBS = new Set([
  ...Object.keys(IRREGULAR),
  ...Object.values(IRREGULAR),
  ...FINITE_VERBS,
  ..."am is are was were been being did does play played visit visited enjoy enjoyed feel felt seem seemed like liked love loved want wanted walk walked talk talked arrive arrived decide decided celebrate celebrated remember remembered help helped stay stayed".split(
    " ",
  ),
]);
const wordPattern = "[A-Za-z]+(?:['’][A-Za-z]+)?";
const matches = (text, p, flags = "gi") => [
  ...text.matchAll(new RegExp(p, flags.includes("g") ? flags : flags + "g")),
];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Use ties-to-even rounding to preserve placement scores at boundaries.
export function round(n, d = 0) {
  const f = 10 ** d,
    x = n * f,
    b = Math.floor(x),
    fraction = x - b;
  return (
    (Math.abs(fraction - 0.5) < 1e-10
      ? b % 2 === 0
        ? b
        : b + 1
      : Math.round(x)) / f
  );
}
export function analyse(
  raw,
  section = "writing",
  targetMin = 120,
  targetMax = 180,
) {
  const text = (raw || "").replace(/\r\n?/g, "\n"),
    words = matches(text, wordPattern, "g"),
    lower = words.map((m) => m[0].toLowerCase().replaceAll("’", "'"));
  let issues = [];
  const add = (category, original, start, correction, explanation, rule_id) => {
    const end = start + original.length;
    if (
      !issues.some(
        (i) => start < i.end && i.start < end && i.rule_id === rule_id,
      )
    )
      issues.push({
        category,
        original,
        start,
        end,
        correction,
        explanation,
        rule_id,
        section,
      });
  };
  const part = (m, n) => m.indices[n][0];
  for (const m of words) {
    const w = m[0].toLowerCase();
    if (WRONG[w])
      add(
        "Irregular verbs",
        m[0],
        m.index,
        WRONG[w],
        `“${m[0]}” is not the standard past form. Use “${WRONG[w]}”.`,
        "irregular-past",
      );
    else if (BRITISH[w])
      add(
        "British spelling",
        m[0],
        m.index,
        BRITISH[w],
        "Use the British English spelling.",
        "british-spelling",
      );
    else if (TYPOS[w])
      add(
        "Spelling",
        m[0],
        m.index,
        TYPOS[w],
        `The standard spelling is “${TYPOS[w]}”.`,
        "common-typo",
      );
  }
  for (const m of matches(
    text,
    "\\b(did|didn't|did not)\\s+([A-Za-z]+)\\b",
    "gid",
  )) {
    const form = m[2].toLowerCase(),
      base = PAST[form];
    if (base || form.endsWith("ed"))
      add(
        "Verb form after did",
        m[2],
        part(m, 2),
        base || form.replace(/ed$/, ""),
        "After did or didn't, use the base form of the verb.",
        "did-base",
      );
  }
  if (
    /\b(yesterday|last\s+(?:week|weekend|night|month|year|summer)|ago|in\s+20\d{2})\b/i.test(
      text,
    )
  )
    for (const m of matches(
      text,
      `\\b(I|we|he|she|they)\\s+(${Object.keys(IRREGULAR)
        .sort((a, b) => b.length - a.length)
        .join("|")})\\b`,
      "gid",
    )) {
      const c = IRREGULAR[m[2].toLowerCase()];
      if (c && !c.includes("/"))
        add(
          "Tense",
          m[2],
          part(m, 2),
          c,
          "The time expression places this event in the past, so use the past form.",
          "past-context",
        );
    }
  const agreement = [
    [
      "\\b(I)\\s+(is|are|has|does|goes)\\b",
      { is: "am", are: "am", has: "have", does: "do", goes: "go" },
    ],
    [
      "\\b(he|she|it)\\s+(are|were|have|go|do|don't)\\b",
      {
        are: "is",
        were: "was",
        have: "has",
        go: "goes",
        do: "does",
        "don't": "doesn't",
      },
    ],
    [
      "\\b(we|they|you)\\s+(is|was|has|goes|doesn't)\\b",
      { is: "are", was: "were", has: "have", goes: "go", "doesn't": "don't" },
    ],
  ];
  for (const [p, forms] of agreement)
    for (const m of matches(text, p, "gid")) {
      const c = forms[m[2].toLowerCase()];
      add(
        "Subject-verb agreement",
        m[2],
        part(m, 2),
        c,
        `Use “${c}” with the subject “${m[1]}”.`,
        "subject-verb",
      );
    }
  for (const m of matches(text, "\\b(a)\\s+([aeiou][A-Za-z]*)", "gid"))
    if (!/^(?:uni|use|euro|one)/i.test(m[2]))
      add(
        "Articles",
        m[1],
        part(m, 1),
        "an",
        "Use “an” before a vowel sound.",
        "a-an",
      );
  for (const m of matches(
    text,
    "\\b(an)\\s+([bcdfgjklmnpqrstvwxyz][A-Za-z]*)",
    "gid",
  ))
    if (!/^(?:hour|honest|honour|heir)/i.test(m[2]))
      add(
        "Articles",
        m[1],
        part(m, 1),
        "a",
        "Use “a” before a consonant sound.",
        "an-a",
      );
  for (const m of matches(
    text,
    "\\b(to|at)\\s+(park|market|cinema|beach|zoo|library|restaurant|museum|airport|station)\\b",
    "gid",
  ))
    add(
      "Articles",
      m[2],
      part(m, 2),
      "the " + m[2],
      "Use “the” when referring to this specific place.",
      "place-article",
    );
  for (const m of matches(text, "\\bi\\b", "g"))
    add(
      "Capitalisation",
      "i",
      m.index,
      "I",
      "The pronoun “I” is always capitalised.",
      "capital-i",
    );
  for (const m of matches(text, "(^|[.!?]\\s+)([a-z])", "gd"))
    add(
      "Capitalisation",
      m[2],
      part(m, 2),
      m[2].toUpperCase(),
      "Start every sentence with a capital letter.",
      "sentence-capital",
    );
  for (const m of matches(text, " {2,}", "g"))
    add(
      "Spacing",
      m[0],
      m.index,
      " ",
      "Use one space between words.",
      "double-space",
    );
  for (const m of matches(text, "\\b([A-Za-z']+)\\s+\\1\\b"))
    add(
      "Repeated word",
      m[0],
      m.index,
      m[1],
      "This word appears twice accidentally.",
      "repeated-word",
    );
  for (const m of matches(
    text,
    "([A-Za-z])([,;:!?])(?=[A-Za-z])|([a-z])(\\.)(?=[A-Z])",
    "g",
  ))
    add(
      "Punctuation",
      m[0],
      m.index,
      m[0] + " ",
      "Put a space after punctuation.",
      "punctuation-space",
    );
  for (const m of matches(
    text,
    "(^|[.!?]\\s+)(Finally|However|First|Next|After that|In the morning|In the evening)\\s+",
    "gid",
  ))
    add(
      "Punctuation",
      m[2],
      part(m, 2),
      m[2] + ",",
      "Add a comma after an opening linking phrase.",
      "opening-comma",
    );
  for (const m of matches(
    text,
    "\\b[^.!?\\n]{2,},\\s+(I|he|she|we|they|it)\\s+(?:was|were|went|had|did|came|saw|[a-z]+ed)\\b",
  )) {
    const comma = text.indexOf(",", m.index),
      left = text.slice(m.index, comma).trim();
    // Opening time phrases and dependent clauses are not independent sentences.
    if (
      /^(when|while|because|although|after|before|if|unless|since)\b/i.test(
        left,
      )
    )
      continue;
    if (
      !/\b(?:I|he|she|we|they|it|you|[A-Za-z]+)\s+(?:was|were|am|is|are|had|went|felt|[a-z]+ed)\b/i.test(
        left,
      )
    )
      continue;
    add(
      "Comma splice",
      ",",
      comma,
      ". ",
      "A comma alone cannot join two complete sentences. Use a full stop or a connector.",
      "comma-splice",
    );
  }
  const sentences = matches(text, "[^.!?\\n]+(?:[.!?]+|$)", "g");
  for (const m of sentences) {
    const ws = matches(m[0], wordPattern, "g").map((w) => w[0].toLowerCase());
    if (ws.length > 28)
      add(
        "Run-on sentence",
        m[0].trim().slice(0, 45) + "…",
        m.index,
        "",
        `This sentence has ${ws.length} words. Split it into shorter sentences.`,
        "run-on",
      );
    if (ws.length >= 3 && !ws.some((w) => VERBS.has(w) || /ed$/.test(w)))
      add(
        "Missing verb",
        m[0].trim(),
        m.index,
        "",
        "This may be an incomplete sentence because no clear verb was found.",
        "missing-verb",
      );
  }
  if (text.trim() && !/[.!?]["'’”)]*$/.test(text.trim()))
    add(
      "Punctuation",
      "end of answer",
      text.trimEnd().length,
      ".",
      "Finish the final sentence with punctuation.",
      "end-punctuation",
    );
  for (const [p, e] of Object.entries(OVERUSED))
    for (const m of matches(text, "\\b" + escape(p) + "\\b"))
      add("Vocabulary", m[0], m.index, "", e, "overused-word");
  const structureIssues = sentenceIssues(text, section);
  issues = issues.filter(
    (old) =>
      old.rule_id !== "missing-verb" ||
      !structureIssues.some(
        (issue) => issue.start < old.end && old.start < issue.end,
      ),
  );
  for (const issue of structureIssues) {
    if (
      !issues.some(
        (old) =>
          old.start === issue.start &&
          old.end === issue.end &&
          old.category === issue.category,
      )
    )
      issues.push(issue);
  }
  issues.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      (a.rule_id < b.rule_id ? -1 : a.rule_id > b.rule_id ? 1 : 0),
  );
  const seen = new Set();
  issues = issues.filter((i) => {
    const k = JSON.stringify([i.start, i.end, i.category, i.correction]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const count = words.length,
    sentenceCount = Math.max(
      1,
      sentences.filter((m) => new RegExp(wordPattern).test(m[0])).length,
    ),
    unique = count ? new Set(lower).size / count : 0,
    connectorCount = CONNECTORS.reduce(
      (n, c) => n + matches(text, "\\b" + escape(c) + "\\b").length,
      0,
    ),
    categories = {};
  for (const i of issues)
    categories[i.category] = (categories[i.category] || 0) + 1;
  const rate = (cats) =>
      count
        ? (cats.reduce((n, c) => n + (categories[c] || 0), 0) * 100) / count
        : 100,
    score = (n) => (n <= 1 ? 5 : n <= 3 ? 4 : n <= 5 ? 3 : n <= 9 ? 2 : 1);
  let vocabulary =
    unique >= 0.72
      ? 5
      : unique >= 0.65
        ? 4
        : unique >= 0.55
          ? 3
          : unique >= 0.45
            ? 2
            : 1;
  if (connectorCount >= 4) vocabulary = Math.min(5, vocabulary + 1);
  if (((categories.Vocabulary || 0) * 100) / Math.max(1, count) > 3)
    vocabulary = Math.max(1, vocabulary - 1);
  const isSpeaking = section.startsWith("speaking_");
  const details = isSpeaking
      ? {
          who: /\b(I|we|my|our)\b/i.test(text),
          development: count >= 20,
          reason:
            /\b(because|so|enjoy|enjoyed|like|love|prefer|important|interesting|happy)\b/i.test(
              text,
            ),
          sentences: sentenceCount >= 2,
          content: count >= 10,
        }
      : {
          who: /\b(I|we|my)\b/i.test(text),
          where: /\b(at|in|to)\s+(?:the|a|my)\b/i.test(text),
          when: /\b(yesterday|last|morning|evening|day|year|ago|20\d{2})\b/i.test(
            text,
          ),
          why: /\b(because|so|important|proud|happy)\b/i.test(text),
          past: /\b(was|were|went|had|did|felt|[A-Za-z]+ed)\b/i.test(text),
        },
    detailCount = Object.values(details).filter(Boolean).length,
    lengthBand =
      count >= targetMin && count <= targetMax
        ? 2
        : count >= targetMin - 20 && count <= targetMax + 40
          ? 1
          : 0;
  const task =
    lengthBand === 2 && detailCount >= 4
      ? 5
      : lengthBand >= 1 && detailCount >= 3
        ? 4
        : count >= 70 && detailCount >= 3
          ? 3
          : count >= 40 && detailCount >= 1
            ? 2
            : 1;
  const scores = {
      grammar: score(
        rate([
          "Irregular verbs",
          "Tense",
          "Verb form after did",
          "Subject-verb agreement",
          "Articles",
          "Missing verb",
          "Comma splice",
          "Run-on sentence",
          "Sentence structure",
          "Sentence fragment",
          "Missing subject",
          "Auxiliary verb",
          "Verb pattern",
        ]),
      ),
      spelling_punctuation: score(
        rate([
          "Spelling",
          "British spelling",
          "Punctuation",
          "Capitalisation",
          "Spacing",
          "Repeated word",
        ]),
      ),
      vocabulary,
      task_length: task,
    },
    total = Object.values(scores).reduce((a, b) => a + b, 0),
    topic =
      detailCount >= 4 && count >= 60
        ? "Likely on topic"
        : "Teacher review required",
    calculated =
      total >= 18 ? "B2" : total >= 14 ? "B1" : total >= 10 ? "A2" : "Below A2";
  const feedback = [];
  if (count < targetMin)
    feedback.push(
      `Write at least ${targetMin} words; this answer has ${count}.`,
    );
  if (count > targetMax)
    feedback.push(
      `The target is ${targetMin}–${targetMax} words; this answer has ${count}.`,
    );
  for (const [key, message] of Object.entries(
    isSpeaking
      ? {
          who: "make the speaker or subject clear",
          development: "develop your answer with at least 20 words",
          reason: "explain a reason or give a personal example",
          sentences: "use at least two developed sentences",
          content: "give a fuller spoken answer",
        }
      : {
          who: "say who was involved",
          where: "describe where it happened",
          when: "make the time clear",
          why: "explain why it mattered",
          past: "use past-tense narration",
        },
  ))
    if (!details[key]) feedback.push(`Add details to ${message}.`);
  if (!feedback.length)
    feedback.push(
      "The answer includes the main task details; a teacher should still confirm relevance and coherence.",
    );
  const lessons = [];
  for (const [category, n] of Object.entries(categories).sort(
    (a, b) => b[1] - a[1],
  )) {
    if (LESSON_BY_CATEGORY[category]) {
      const e = issues.find((i) => i.category === category);
      lessons.push({
        ...LESSON_BY_CATEGORY[category],
        count: n,
        student_example: { original: e.original, correction: e.correction },
      });
    }
    if (lessons.length === 3) break;
  }
  return {
    checker_version: "rules-1.1",
    formula_version: "kaplan-1.1",
    metrics: {
      word_count: count,
      sentence_count: sentenceCount,
      average_sentence_length: round(count / sentenceCount, 1),
      unique_word_ratio: round(unique, 3),
      connector_count: connectorCount,
      sentence_structure_issues: issues.filter((i) =>
        [
          "Sentence structure",
          "Sentence fragment",
          "Missing subject",
          "Missing verb",
          "Run-on sentence",
          "Comma splice",
          "Auxiliary verb",
        ].includes(i.category),
      ).length,
    },
    issues,
    category_counts: categories,
    scores,
    total,
    level: topic === "Likely on topic" ? calculated : "Teacher review required",
    errors_per_100_words: round((issues.length * 100) / Math.max(1, count), 1),
    topic_flag: topic,
    task_details: details,
    task_feedback: feedback,
    calculated_level: calculated,
    lessons,
    formula: `Grammar and mechanics use errors per 100 words: ≤1=5, ≤3=4, ≤5=3, ≤9=2, >9=1. Grammar includes sentence fragments, missing subjects, finite verbs and verb patterns. Vocabulary uses unique-word ratio, connectors and overused words. ${isSpeaking ? "Speaking development uses the transcript and a 20–250 word target." : "Writing uses the 120–180 word target."} Total: A2=10, B1=14, B2=18.`,
    notice:
      "Automated first-pass check—teacher to confirm. Grammar and sentence structure are checked with fixed rules, which can miss errors or flag correct text. Speaking language checks use the reviewed transcript; pronunciation and transcript accuracy require listening to the recording.",
  };
}
export const analyseSubmission = (writing, transcripts) => ({
  writing: analyse(writing),
  speaking: transcripts.map((t, i) =>
    t.trim() ? analyse(t, `speaking_${i + 1}`, 20, 250) : null,
  ),
});
