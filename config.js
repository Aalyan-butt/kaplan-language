// Netlify serves the frontend and API from the same origin.
window.KAPLAN_API_URL = "";
window.KAPLAN_CONFIG = Object.freeze({
  passwordMinLength: 6,
  locale: "en-GB",
  writing: Object.freeze({
    question: "Describe a memorable day in your life.",
    targetMin: 120,
    targetMax: 180,
  }),
  speaking: Object.freeze({
    maxSeconds: 90,
    questions: Object.freeze([
      "What did you do last weekend?",
      "Do you have any hobbies?",
      "Describe a place you visited and what you did there.",
    ]),
  }),
});
