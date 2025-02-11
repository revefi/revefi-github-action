/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  testTimeout: 60000,
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
};
