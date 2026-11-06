module.exports = {
  testEnvironment: "node",
  testMatch: ["**/test/queue.test.js", "**/test/waitTime.test.js"],
  collectCoverage: true,
  collectCoverageFrom: ["queue.js", "waitTime.js"],
  coverageThreshold: { global: { statements: 80, branches: 80, functions: 80, lines: 80 } }
};
