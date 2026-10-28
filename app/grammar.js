// Conservative placement rules: flag identifiable patterns, not guessed rewrites.
export const REGULAR_VERBS =
  "accept answer ask call change clean close cook dance describe develop discuss explain finish follow help hope learn listen live look love move need open paint plan practise prepare rain read remember return show smile start stay stop study talk travel try use visit wait walk want watch work enjoy play speak like prefer collect swim run exercise write sing draw ride make build share relax spend eat drink know think take feel".split(
    " ",
  );
const thirdPerson = (base) =>
  /[^aeiou]y$/.test(base)
    ? base.slice(0, -1) + "ies"
    : /(?:s|sh|ch|x|z|o)$/.test(base)
      ? base + "es"
      : base + "s";
export const FINITE_VERBS = new Set(
  REGULAR_VERBS.flatMap((base) => [base, thirdPerson(base)]),
);
const participles = {
  went: "gone",
  saw: "seen",
  ate: "eaten",
  wrote: "written",
  took: "taken",
  gave: "given",
  spoke: "spoken",
  broke: "broken",
  knew: "known",
  ran: "run",
  did: "done",
  came: "come",
  drove: "driven",
  chose: "chosen",
  fell: "fallen",
  forgot: "forgotten",
  began: "begun",
  sang: "sung",
  swam: "swum",
  rode: "ridden",
  grew: "grown",
  flew: "flown",
};
export function sentenceIssues(text, section = "writing") {
  const issues = [];
  const add = (category, original, start, correction, explanation, rule_id) =>
    issues.push({
      category,
      original,
      start,
      end: start + original.length,
      correction,
      explanation,
      rule_id,
      section,
    });
  const scan = (pattern, callback) => {
    for (const match of text.matchAll(new RegExp(pattern, "gid")))
      callback(match);
  };
  const past =
    /\b(yesterday|last\s+(?:week|weekend|night|month|year)|ago)\b/i.test(text);
  const be = (subject) =>
    past
      ? /^(we|they|you)$/i.test(subject)
        ? "were"
        : "was"
      : /^I$/i.test(subject)
        ? "am"
        : /^(we|they|you)$/i.test(subject)
          ? "are"
          : "is";
  const adjectives =
    "happy|sad|tired|proud|excited|nervous|afraid|ready|busy|hungry|young|old|interested|important|beautiful|difficult|easy|late";
  scan(
    `\\b(I|he|she|it|we|they|you)\\s+((?:(?:very|really|so|quite)\\s+)?(?:${adjectives})\\b)`,
    (m) =>
      add(
        "Sentence structure",
        m[0],
        m.index,
        `${m[1]} ${be(m[1])} ${m[2]}`,
        "This statement needs a finite form of be between the subject and its description.",
        "missing-copula",
      ),
  );
  scan("\\b(I|he|she|it|we|they|you)\\s+((?:a|an)\\s+[A-Za-z]+)\\b", (m) =>
    add(
      "Sentence structure",
      m[0],
      m.index,
      `${m[1]} ${be(m[1])} ${m[2]}`,
      "A subject and a noun phrase alone do not form a complete statement. Add a finite verb.",
      "noun-predicate",
    ),
  );
  scan("\\b(I|he|she|it|we|they|you)\\s+([A-Za-z]+ing)\\b", (m) => {
    if (/^(sing|bring|spring|ring|cling|sting|swing|fling|wring)$/i.test(m[2]))
      return;
    add(
      "Auxiliary verb",
      m[0],
      m.index,
      `${m[1]} ${be(m[1])} ${m[2]}`,
      "A continuous verb needs am, is, are, was or were before the -ing form.",
      "continuous-auxiliary",
    );
  });
  const present = REGULAR_VERBS.join("|");
  scan(`\\b(he|she|it)\\s+(${present})\\b`, (m) =>
    add(
      "Subject-verb agreement",
      m[2],
      m.indices[2][0],
      thirdPerson(m[2].toLowerCase()),
      "In the present simple, use the third-person singular form with he, she or it.",
      "third-person-present",
    ),
  );
  const reverse = Object.fromEntries(
    REGULAR_VERBS.map((b) => [thirdPerson(b), b]),
  );
  scan(`\\b(I|we|they|you)\\s+(${Object.keys(reverse).join("|")})\\b`, (m) =>
    add(
      "Subject-verb agreement",
      m[2],
      m.indices[2][0],
      reverse[m[2].toLowerCase()],
      "Use the base present-tense form with this subject.",
      "plural-present",
    ),
  );
  scan("\\bI\\s+were\\b", (m) =>
    add(
      "Subject-verb agreement",
      m[0],
      m.index,
      "I was",
      "Use was, not were, with I in a past-tense statement.",
      "i-were-agreement",
    ),
  );
  scan("\\bI\\s+were\\b", (m) =>
    add(
      "Subject-verb agreement",
      m[0],
      m.index,
      "I was",
      "Use was, not were, with I in a past-tense statement.",
      "i-were-agreement",
    ),
  );
  scan("\\bI\\s+were\\b", (m) =>
    add(
      "Subject-verb agreement",
      m[0],
      m.index,
      "I was",
      "Use was, not were, with I in a past-tense statement.",
      "i-were-agreement",
    ),
  );
  scan("\\bI\\s+were\\b", (m) =>
    add(
      "Subject-verb agreement",
      m[0],
      m.index,
      "I was",
      "Use was, not were, with I in a past-tense statement.",
      "i-were-agreement",
    ),
  );
  scan("\\bI\\s+were\\b", (m) =>
    add(
      "Subject-verb agreement",
      m[0],
      m.index,
      "I was",
      "Use was, not were, with I in a past-tense statement.",
      "i-were-agreement",
    ),
  );
  const baseForms = {
    went: "go",
    came: "come",
    saw: "see",
    ate: "eat",
    wrote: "write",
    took: "take",
    did: "do",
    was: "be",
    were: "be",
    had: "have",
    ran: "run",
    spoke: "speak",
    played: "play",
    playing: "play",
    working: "work",
    worked: "work",
    going: "go",
    eating: "eat",
    writing: "write",
    swimming: "swim",
    likes: "like",
    plays: "play",
    goes: "go",
    does: "do",
    has: "have",
  };
  scan(
    `\\b(can|could|should|would|will|must|may|might)\\s+(${Object.keys(baseForms).join("|")})\\b`,
    (m) =>
      add(
        "Verb pattern",
        m[2],
        m.indices[2][0],
        baseForms[m[2].toLowerCase()],
        "After a modal verb, use the base form without -s, -ed or -ing.",
        "modal-base",
      ),
  );
  scan(`\\b(have|has|had)\\s+(${Object.keys(participles).join("|")})\\b`, (m) =>
    add(
      "Verb pattern",
      m[2],
      m.indices[2][0],
      participles[m[2].toLowerCase()],
      "A perfect tense needs the past participle after have, has or had.",
      "perfect-participle",
    ),
  );
  scan(
    "\\b(am|is|are|was|were)\\s+(went|came|ate|saw|wrote|ran|did|knew)\\b",
    (m) =>
      add(
        "Auxiliary verb",
        m[0],
        m.index,
        m[2],
        "Do not combine a form of be with this simple past verb. Use the past verb alone or rewrite the tense.",
        "double-finite",
      ),
  );
  scan(
    "\\b(enjoy|enjoys|enjoyed|avoid|avoids|avoided)\\s+to\\s+(play|read|swim|cook|write|dance|sing|work)\\b",
    (m) => {
      const base = m[2].toLowerCase(),
        ing =
          base === "swim"
            ? "swimming"
            : /e$/.test(base)
              ? base.slice(0, -1) + "ing"
              : base + "ing";
      add(
        "Verb pattern",
        m[0],
        m.index,
        `${m[1]} ${ing}`,
        "After enjoy or avoid, use the -ing form rather than to plus a verb.",
        "gerund-pattern",
      );
    },
  );
  scan(
    "\\b(what|where|why|how|when)\\s+(I|he|she|it|we|they|you)\\s+([A-Za-z]+ing)\\b",
    (m) => {
      const subject = m[2],
        auxiliary = /^I$/i.test(subject)
          ? "am"
          : /^(we|they|you)$/i.test(subject)
            ? "are"
            : "is";
      add(
        "Question structure",
        m[0],
        m.index,
        `${m[1]} ${auxiliary} ${subject} ${m[3]}`,
        "An -ing question needs an auxiliary verb before the subject.",
        "question-auxiliary",
      );
    },
  );
  scan(
    "\\b(I|he|she|it|we|they|you)\\s+([A-Za-z]+(?:ed|ing)?)\\s+\\1\\s+\\2\\b",
    (m) =>
      add(
        "Repetition",
        m[0],
        m.index,
        `${m[1]} ${m[2]}`,
        "This subject and verb are repeated without adding meaning.",
        "repeated-clause",
      ),
  );
  for (const m of text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g)) {
    const trimmed = m[0].trim(),
      start = m.index + m[0].indexOf(trimmed);
    if (
      /^(?:was|were|am|is|are|went|felt|arrived|visited|enjoyed)\b/i.test(
        trimmed,
      )
    )
      add(
        "Missing subject",
        trimmed,
        start,
        "",
        "This statement appears to be missing its subject. Say who did or experienced this.",
        "missing-subject",
      );
    if (
      /^(?:because|although|unless|even though|while|when)\b/i.test(trimmed)
    ) {
      const subjects = [
        ...trimmed.matchAll(
          /\b(?:I|he|she|we|they|it|you|my\s+\w+)\s+(?:was|were|am|is|are|had|have|has|went|felt|[a-z]+ed)\b/gi,
        ),
      ].length;
      if (subjects === 1 && !/[,;:]\s*\S/.test(trimmed))
        add(
          "Sentence fragment",
          trimmed,
          start,
          "",
          "This dependent clause needs a main clause to complete the thought.",
          "dependent-fragment",
        );
    }
  }
  if (section.startsWith("speaking_")) {
    const clauseCount = [
      ...text.matchAll(
        /\b(?:I|he|she|it|we|they|you)\s+(?:am|is|are|was|were|have|has|had|do|does|did|can|could|will|would|[a-z]+ed|[a-z]+ing)\b/gi,
      ),
    ].length;
    if (clauseCount >= 3 && !/[.!?]/.test(text))
      add(
        "Sentence boundaries",
        text.slice(0, 80),
        0,
        "",
        "Several clauses run together. Separate complete thoughts into clear sentences.",
        "spoken-run-on",
      );
    for (const word of [
      "good",
      "fine",
      "okay",
      "ok",
      "just",
      "very",
      "perfectly",
      "thing",
      "things",
    ]) {
      const found = [...text.matchAll(new RegExp(`\\b${word}\\b`, "gi"))];
      if (found.length >= 2)
        add(
          "Vocabulary",
          found[0][0],
          found[0].index,
          "",
          "This vague or filler word is repeated. Use more precise vocabulary and develop the idea.",
          "repeated-basic-vocabulary",
        );
    }
  }
  return issues;
}
