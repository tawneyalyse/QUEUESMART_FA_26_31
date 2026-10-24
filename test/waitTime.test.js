const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateWait } = require("../waitTime");

test("first person has no one ahead", () => {
  assert.equal(estimateWait(1, 10), 0);
});

test("wait time uses the number of people ahead", () => {
  assert.equal(estimateWait(4, 15), 45);
  assert.equal(estimateWait(2, 8), 8);
});

test("rejects invalid positions and durations", () => {
  assert.throws(() => estimateWait(0, 10));
  assert.throws(() => estimateWait(2.5, 10));
  assert.throws(() => estimateWait(2, -1));
  assert.throws(() => estimateWait(2, "10"));
});
