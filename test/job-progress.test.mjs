import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatJobMessage, parseArgs, progressBar, progressBucket, shouldUpdateJobMessage } from '../scripts/job-progress.mjs';
import { getJob, readJobState, upsertJob, writeJobState } from '../src/jobs/store.mjs';

test('progressBar tạo thanh tiến độ cố định', () => {
  assert.equal(progressBar(40), '[####------]');
  assert.equal(progressBar(100), '[##########]');
});

test('formatJobMessage tạo message gọn', () => {
  assert.equal(
    formatJobMessage({ project: 'remotebot', jobId: 'phase4', progress: 20, status: 'running', text: 'đang test' }),
    '[remotebot] [##--------] 20% running\njob: phase4\nđang test',
  );
});

test('parseArgs đọc job progress', () => {
  const args = parseArgs(['--job-id', 'x', '--progress', '80', '--status', 'testing', 'đang chạy']);
  assert.equal(args.jobId, 'x');
  assert.equal(args.progress, 80);
  assert.equal(args.status, 'testing');
  assert.equal(args.text, 'đang chạy');
  assert.equal(args.project, path.basename(process.cwd()));
  assert.match(args.stateFile.replaceAll('/', '\\'), /scripts\\tmp\\remotebot-jobs\.json$/);
});

test('job store upsert và đọc ghi state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-jobs-'));
  const file = path.join(dir, 'jobs.json');
  try {
    let state = readJobState(file);
    state = upsertJob(state, { jobId: 'x', progress: 10, messages: { '1': 2 } }, '2026-01-01T00:00:00.000Z');
    writeJobState(file, state);
    const loaded = readJobState(file);
    assert.equal(getJob(loaded, 'x').progress, 10);
    assert.equal(getJob(loaded, 'x').messages['1'], 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shouldUpdateJobMessage chỉ cập nhật khi đổi bucket hoặc trạng thái/text', () => {
  const existing = { progress: 21, status: 'running', text: 'same' };
  assert.equal(progressBucket(39), 1);
  assert.equal(shouldUpdateJobMessage(existing, { progress: 39, status: 'running', text: 'same' }), false);
  assert.equal(shouldUpdateJobMessage(existing, { progress: 40, status: 'running', text: 'same' }), true);
  assert.equal(shouldUpdateJobMessage(existing, { progress: 39, status: 'testing', text: 'same' }), true);
  assert.equal(shouldUpdateJobMessage(existing, { progress: 39, status: 'running', text: 'changed' }), true);
});
