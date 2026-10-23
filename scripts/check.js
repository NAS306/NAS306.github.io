import { spawnSync } from 'node:child_process';
import { JS_MODULES } from '../build.js';
for (const file of ['build.js', ...JS_MODULES]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const tests = spawnSync(process.execPath, ['--test'], { stdio: 'inherit' });
process.exit(tests.status ?? 1);
