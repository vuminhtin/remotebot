import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildProgressStep,
  defaultJobId,
  parseArgs,
  safeFilePart,
  summarizeCommand,
} from '../scripts/run-with-progress.mjs';

test('defaultJobId tạo id ổn định theo thời gian', () => {
  assert.equal(defaultJobId(new Date('2026-05-22T01:02:03.000Z')), 'job-20260522T010203Z');
});

test('parseArgs nhận command sau dấu --', () => {
  const args = parseArgs([
    '--job-id', 'scan-all',
    '--project', 'remotebot',
    '--running-progress', '40',
    '--no-telegram',
    '--',
    'npm.cmd', 'test',
  ]);
  assert.equal(args.jobId, 'scan-all');
  assert.equal(args.project, 'remotebot');
  assert.equal(args.runningProgress, 40);
  assert.equal(args.noTelegram, true);
  assert.deepEqual(args.command, ['npm.cmd', 'test']);
  assert.match(args.logFile.replaceAll('/', '\\'), /scripts\\tmp\\scan-all\.log$/);
});

test('safeFilePart thay ký tự không an toàn', () => {
  assert.equal(safeFilePart('a/b:c'), 'a_b_c');
});

test('summarizeCommand quote tham số có khoảng trắng', () => {
  assert.equal(summarizeCommand(['npm.cmd', 'run', 'hello world']), 'npm.cmd run "hello world"');
});

test('buildProgressStep tạo lời gọi job-progress', () => {
  const step = buildProgressStep({
    jobId: 'x',
    project: 'p',
  }, 20, 'running', 'đang chạy');
  assert.equal(path.basename(step[0]), 'job-progress.mjs');
  assert.deepEqual(step.slice(1), [
    '--job-id', 'x',
    '--project', 'p',
    '--progress', '20',
    '--status', 'running',
    'đang chạy',
  ]);
});
