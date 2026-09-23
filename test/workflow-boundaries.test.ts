import test from "node:test";
import assert from "node:assert/strict";
import { getWorkflowBoundaryIssues } from "../src/workflow-validation.js";

test("rejects a Timed Wait as the first action and explains the task-level alternative", () => {
  const issues = getWorkflowBoundaryIssues([{ type: "wait" }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /task-level wait field/);
});

test("rejects Navigate To as the first action and explains the task-level alternative", () => {
  const issues = getWorkflowBoundaryIssues([{ type: "navigate" }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /task-level url/);
});

test("rejects Get Content as the final action and explains how to return final output", () => {
  const issues = getWorkflowBoundaryIssues([{ type: "get_content" }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /extractionScript/);
});

test("allows a first Wait for Selector and an intermediate Get Content action", () => {
  const issues = getWorkflowBoundaryIssues([
    { type: "wait_selector" },
    { type: "get_content" },
    { type: "set" },
  ]);
  assert.deepEqual(issues, []);
});

test("checks replacement action sequences independently of other task fields", () => {
  const issues = getWorkflowBoundaryIssues([{ type: "click" }, { type: "get_content" }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].index, 1);
});
