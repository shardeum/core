/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@src/(.*)': '<rootDir>/src/$1',
    '^@utils/(.*)': '<rootDir>/src/utils/$1',
    '^@test/(.*)': '<rootDir>/test/$1',
    '^@achingbrain/nat-port-mapper$': '<rootDir>/test/mocks/nat-port-mapper.js',
    '^default-gateway$': '<rootDir>/test/mocks/default-gateway.js',
    '^socket.io$': '<rootDir>/test/mocks/socket.io.js',
    '^cors$': '<rootDir>/test/mocks/cors.js',
  },
  clearMocks: true,
  resetMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
