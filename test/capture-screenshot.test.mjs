import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildWindowsScreenshotScript,
  captureScreenshot,
  defaultScreenshotPath,
  parseArgs,
  timestampForFile,
} from '../scripts/capture-screenshot.mjs';

test('timestampForFile tạo tên file ổn định', () => {
  assert.equal(timestampForFile(new Date('2026-05-22T01:02:03.000Z')), '20260522T010203Z');
});

test('defaultScreenshotPath nằm trong scripts/tmp/screenshots', () => {
  const file = defaultScreenshotPath(new Date('2026-05-22T01:02:03.000Z'));
  assert.match(file.replaceAll('/', '\\'), /scripts\\tmp\\screenshots\\screenshot-20260522T010203Z\.png$/);
});

test('parseArgs nhận out send caption', () => {
  const args = parseArgs(['--out', 'x.png', '--send', '--caption', 'lỗi UI']);
  assert.equal(args.out, 'x.png');
  assert.equal(args.send, true);
  assert.equal(args.caption, 'lỗi UI');
});

test('parseArgs từ chối file không phải png', () => {
  assert.throws(() => parseArgs(['--out', 'x.jpg']), /png/);
});

test('buildWindowsScreenshotScript escape path', () => {
  const script = buildWindowsScreenshotScript("C:\\tmp\\a'b.png");
  assert.match(script, /CopyFromScreen/);
  assert.match(script, /a''b\.png/);
});

test('captureScreenshot báo rõ khi không phải Windows', () => {
  const result = captureScreenshot(path.join('tmp', 'x.png'), 'linux');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Windows/);
});
