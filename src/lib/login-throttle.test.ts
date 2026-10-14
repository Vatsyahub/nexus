import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_FAILURES_BEFORE_WAIT,
  LOGIN_WAIT_BASE_MS,
  clearLoginFailures,
  loginFailureCount,
  loginWaitRemaining,
  noteLoginFailure,
  runLoginAttempt,
  waitMsForFailureCount,
} from "@/lib/login-throttle";

test("the first several wrong passwords do not start a wait", () => {
  const email = "throttle-unit@example.com";
  clearLoginFailures(email);
  const now = 1_000_000;
  for (let i = 1; i < LOGIN_FAILURES_BEFORE_WAIT; i += 1) {
    assert.equal(noteLoginFailure(email, now), 0);
    assert.equal(loginWaitRemaining(email, now), 0);
  }
  assert.equal(loginFailureCount(email), LOGIN_FAILURES_BEFORE_WAIT - 1);
  clearLoginFailures(email);
});

test("after several misses the next try must wait, and a later success clears it", () => {
  const email = "Throttle-Unit@example.com";
  clearLoginFailures(email);
  const now = 2_000_000;
  for (let i = 0; i < LOGIN_FAILURES_BEFORE_WAIT - 1; i += 1) {
    noteLoginFailure(email, now);
  }
  const wait = noteLoginFailure(email, now);
  assert.equal(wait, LOGIN_WAIT_BASE_MS);
  assert.equal(waitMsForFailureCount(LOGIN_FAILURES_BEFORE_WAIT), LOGIN_WAIT_BASE_MS);
  assert.equal(loginWaitRemaining(email, now + 1000), LOGIN_WAIT_BASE_MS - 1000);
  assert.equal(loginWaitRemaining("throttle-unit@example.com", now + LOGIN_WAIT_BASE_MS), 0);
  clearLoginFailures(email);
  assert.equal(loginFailureCount(email), 0);
  assert.equal(loginWaitRemaining(email, now), 0);
});

test("queued tries for one email run one at a time", async () => {
  const email = "queue-unit@example.com";
  clearLoginFailures(email);
  const order: string[] = [];
  await Promise.all([
    runLoginAttempt(email, async () => {
      order.push("a-start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push("a-end");
    }),
    runLoginAttempt(email, async () => {
      order.push("b-start");
      order.push("b-end");
    }),
  ]);
  assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
});
