// Runs the app's auth layer against the real API and PostgreSQL (see __contract__/global-setup.js).
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/__contract__/**/*.test.ts"],
  globalSetup: "<rootDir>/__contract__/global-setup.js",
  globalTeardown: "<rootDir>/__contract__/global-teardown.js",
  testTimeout: 60000,
};
