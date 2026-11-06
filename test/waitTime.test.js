const { estimateWait } = require("../waitTime");

describe("estimateWait", () => {
  test("first person has no one ahead", () => {
    expect(estimateWait(1, 10)).toBe(0);
  });

  test("wait time uses the number of people ahead", () => {
    expect(estimateWait(4, 15)).toBe(45);
    expect(estimateWait(2, 8)).toBe(8);
  });

  test("rejects invalid positions and durations", () => {
    expect(() => estimateWait(0, 10)).toThrow();
    expect(() => estimateWait(2.5, 10)).toThrow();
    expect(() => estimateWait(2, -1)).toThrow();
    expect(() => estimateWait(2, "10")).toThrow();
  });
});
