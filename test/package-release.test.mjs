import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  releaseName,
  shouldExcludeReleasePath,
  timestampForRelease,
} from '../scripts/package-release.mjs';

test('timestampForRelease tạo stamp local dễ đọc', () => {
  assert.equal(timestampForRelease(new Date(2026, 4, 22, 9, 44, 10)), '20260522-094410');
});

test('releaseName ghép version và stamp', () => {
  assert.equal(releaseName('0.1.0', '20260522-094410'), 'remotebot-0.1.0-20260522-094410');
});

test('shouldExcludeReleasePath bỏ secret/runtime/build', () => {
  assert.equal(shouldExcludeReleasePath('.env'), true);
  assert.equal(shouldExcludeReleasePath('scripts/tmp/x.json'), true);
  assert.equal(shouldExcludeReleasePath('dist/x.zip'), true);
  assert.equal(shouldExcludeReleasePath('.git/config'), true);
  assert.equal(shouldExcludeReleasePath('README.md'), false);
});

test('parseArgs nhận version stamp no-zip', () => {
  const args = parseArgs(['--version', '1.2.3', '--stamp', 's', '--out-dir', 'out', '--no-zip']);
  assert.equal(args.version, '1.2.3');
  assert.equal(args.stamp, 's');
  assert.equal(args.outDir, 'out');
  assert.equal(args.noZip, true);
});
