import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectHealth,
  collectLastAgentStatus,
  formatBytes,
  formatDiskText,
  formatHealthText,
  formatLastAgentStatusText,
  formatMemoryText,
  formatProcessesText,
  parseArgs,
  readLastJsonl,
} from '../scripts/system-health.mjs';

test('formatBytes định dạng byte dễ đọc', () => {
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
});

test('parseArgs nhận json và path', () => {
  const args = parseArgs(['--json', '--path', '.', '--section', 'disk', '--limit', '3']);
  assert.equal(args.json, true);
  assert.equal(args.path, '.');
  assert.equal(args.section, 'disk');
  assert.equal(args.limit, 3);
});

test('collectHealth trả thông tin chỉ đọc cơ bản', () => {
  const health = collectHealth({ targetPath: process.cwd(), now: new Date('2026-01-01T00:00:00.000Z') });
  assert.equal(health.ts, '2026-01-01T00:00:00.000Z');
  assert.ok(health.hostname);
  assert.ok(health.cpuCount > 0);
  assert.ok(health.memory.total > 0);
});

test('formatHealthText có các dòng chính', () => {
  const text = formatHealthText({
    hostname: 'host',
    platform: 'win32',
    release: '1',
    arch: 'x64',
    uptimeSeconds: 120,
    cpuCount: 8,
    memory: { usedPercent: 50, free: 1024, total: 2048 },
    disk: null,
  });
  assert.match(text, /Health host/);
  assert.match(text, /Memory: 50%/);
});

test('formatDiskText và formatMemoryText trả text ngắn', () => {
  assert.match(formatDiskText({ path: 'F:\\', usedPercent: 14, free: 1024, total: 2048 }), /Disk F/);
  assert.match(formatMemoryText({ usedPercent: 50, free: 1024, total: 2048, used: 1024 }), /Memory/);
});

test('formatProcessesText hiển thị process theo memory', () => {
  const text = formatProcessesText([{ name: 'node', pid: 1, cpu: 2.5, memoryBytes: 2048 }]);
  assert.match(text, /node/);
  assert.match(text, /pid=1/);
});

test('readLastJsonl đọc các dòng cuối hợp lệ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-jsonl-'));
  const file = path.join(dir, 'a.jsonl');
  try {
    fs.writeFileSync(file, '{"a":1}\nnot json\n{"a":2}\n{"a":3}\n', 'utf8');
    assert.deepEqual(readLastJsonl(file, 2), [{ a: 2 }, { a: 3 }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('collectLastAgentStatus đọc job và audit gần nhất', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-status-'));
  const stateFile = path.join(dir, 'jobs.json');
  const auditFile = path.join(dir, 'audit.jsonl');
  try {
    fs.writeFileSync(stateFile, JSON.stringify({
      jobs: {
        a: { jobId: 'a', progress: 10, updatedAt: '2026-01-01T00:00:00.000Z' },
        b: { jobId: 'b', progress: 90, updatedAt: '2026-01-02T00:00:00.000Z' },
      },
    }), 'utf8');
    fs.writeFileSync(auditFile, '{"action":"health","decision":"allow","ts":"t"}\n', 'utf8');
    const status = collectLastAgentStatus({ stateFile, auditFile, limit: 1 });
    assert.equal(status.jobs[0].jobId, 'b');
    assert.equal(status.audit[0].action, 'health');
    assert.match(formatLastAgentStatusText(status), /Last agent status/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
