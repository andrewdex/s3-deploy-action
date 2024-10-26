// jest.config.js
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': 'ts-jest', // Transform TypeScript files using ts-jest
    },
    moduleFileExtensions: ['ts', 'js'], // Recognize .ts and .js files
};