/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: [
    "<rootDir>/test/unit"
  ],
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
  moduleNameMapper: {
    "^@src/(.*)$": "<rootDir>/src/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@test/(.*)$": "<rootDir>/test/$1"
  },
  clearMocks: true,
  resetMocks: true,
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/build/"
  ]
};