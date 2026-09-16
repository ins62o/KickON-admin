// Validate the actual companion React Native app without copying or editing it.
// Usage: node scripts/verify-app-update.mjs /absolute/path/to/KickON
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const app = path.resolve(process.argv[2] ?? '../KickON');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = {
  watchman: false,
  rootDir: app,
  roots: [path.join(root, 'tests/app-update'), path.join(app, '__tests__')],
  preset: '@react-native/jest-preset',
  moduleDirectories: ['node_modules', path.join(app, 'node_modules')],
  moduleNameMapper: {
    '^kickon-app/(.*)$': path.join(app, 'src/$1'),
  },
  transform: {
    '^.+\\.[jt]sx?$': [path.join(app, 'node_modules/babel-jest'), { configFile: path.join(app, 'babel.config.js') }],
  },
};
const result = spawnSync(process.execPath, [path.join(app, 'node_modules/jest/bin/jest.js'),
  '--config', JSON.stringify(config), '--runInBand', '--runTestsByPath',
  path.join(root, 'tests/app-update/useAppUpdate.test.js'),
  path.join(app, '__tests__/appUpdate.test.ts'),
  path.join(app, '__tests__/queryPersistence.test.ts'),
], { stdio: 'inherit', cwd: app });
process.exit(result.status ?? 1);
