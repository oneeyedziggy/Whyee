const fs = require('fs');
const path = require('path');
const {
  getAndroidPreset,
  getIOSPreset,
  getWebPreset,
} = require('jest-expo/config');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listTestFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTestFiles(fullPath);
    return /\.test\.ts$/.test(entry.name) ? [fullPath] : [];
  });

// React Native Testing Library only understands React Native host components
// (Text, TextInput, ...). On web, react-native-web renders DOM hosts (div,
// input) and portals Modals into document.body, so RNTL `render` cannot work.
// Shared suites that render components with RNTL therefore run on iOS/Android
// only; web-only UI behavior belongs in `*.test.web.ts`. Hook suites
// (`renderHook`) and logic suites still run on web.
const rntlComponentSuites = listTestFiles(path.join(__dirname, '__tests__'))
  .filter((file) =>
    /import\s*\{[^}]*\brender\b[^}]*\}\s*from\s*'@testing-library\/react-native'/.test(
      fs.readFileSync(file, 'utf8'),
    ),
  )
  .map((file) => `${escapeRegExp(path.relative(__dirname, file).split(path.sep).join('/'))}$`);

// watchPlugins is only valid in the root config, so it is hoisted out of each project.
const withProjectDefaults = (
  { watchPlugins: _watchPlugins, ...preset },
  platformExtensions,
  ignoredTests = [],
) => ({
  ...preset,
  testMatch: ['', ...platformExtensions].map(
    (extension) => `<rootDir>/__tests__/**/*.test${extension ? `.${extension}` : ''}.ts`,
  ),
  testPathIgnorePatterns: [...(preset.testPathIgnorePatterns ?? []), ...ignoredTests],
  setupFilesAfterEnv: [...(preset.setupFilesAfterEnv ?? []), '<rootDir>/jest.setup.ts'],
});

module.exports = {
  projects: [
    withProjectDefaults(getIOSPreset(), ['ios', 'native']),
    withProjectDefaults(getAndroidPreset(), ['android', 'native']),
    withProjectDefaults(getWebPreset(), ['web'], rntlComponentSuites),
  ],
  watchPlugins: getIOSPreset().watchPlugins,
  // Three platform projects run in parallel; first renders of large component
  // trees (App, modals) can exceed Jest's 5s default while modules load.
  testTimeout: 15000,
  collectCoverageFrom: [
    'App.tsx',
    'src/**/*.{ts,tsx}',
    '!src/types/**',
    '!src/**/*.d.ts',
    '!src/theme/tokens.ts',
    '!src/appStyles.ts',
    '!src/components/*Styles.ts',
    '!src/lib/documentation.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
