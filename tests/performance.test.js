import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { assessResult } from "../app/result-assessment.js";

test("assessment reuse cannot leak mutations and changed answers are regraded", () => {
  const row = {
    submission_id: "cache-test",
    writing_answer: "Yesterday I visited the museum.",
    speaking_transcript_1: "I visited the museum.",
    speaking_transcript_2: "I like reading.",
    speaking_transcript_3: "I went to the park.",
  };
  const first = assessResult(row);
  first.report.issues.push({ category: "Injected" });
  first.row.teacher_level = "B2";
  const next = assessResult(row);
  assert.ok(!next.report.issues.some((issue) => issue.category === "Injected"));
  assert.equal(next.row.teacher_level, undefined);
  const changed = assessResult({
    ...row,
    speaking_transcript_1: "I will visit the museum.",
  });
  assert.equal(changed.report.speaking_assessment.answers[0].final_score, 1);
  assert.equal(
    changed.report.speaking_assessment.answers[0].status,
    "past_tense_required",
  );
});

test("dashboard deduplicates refreshes and displays accounts before slower results", async () => {
  const html = await readFile("index.html", "utf8");
  const start = html.indexOf("      function updateAdminStats()");
  const end = html.indexOf("      function drawAdminPaneV3", start);
  const pending = new Map();
  const rendered = [];
  const context = {
    state: {
      user: { role: "admin" },
      adminUsers: [],
      adminResults: [],
      adminTab: "accounts",
    },
    document: { querySelector: () => ({ textContent: "" }) },
    api: (path) => new Promise((resolve) => pending.set(path, resolve)),
    drawAdminPaneV3: (tab) => rendered.push(tab),
    toast: (message) => assert.fail(message),
  };
  new Script(html.slice(start, end)).runInNewContext(context);
  const first = context.refreshAdminData();
  const duplicate = context.refreshAdminData();
  assert.equal(pending.size, 2);
  pending.get("/api/v1/admin/users")({ users: [{ role: "student" }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rendered, ["accounts"]);
  assert.equal(context.state.adminUsers.length, 1);
  assert.equal(context.state.adminResults.length, 0);
  pending.get("/api/v1/admin/results")({ results: [{ submission_id: "one" }] });
  await Promise.all([first, duplicate]);
  assert.equal(context.state.adminResults.length, 1);
  assert.deepEqual(rendered, ["accounts"]);
  assert.equal(context.state.adminRefresh, null);
});
