import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexGlobalBlock, parseArgs, upsertMarkedBlock } from '../scripts/install-codex-global.mjs';

test('buildCodexGlobalBlock dùng đường dẫn tuyệt đối Remotebot', () => {
  const block = buildCodexGlobalBlock('F:\\projects\\remotebot');
  assert.match(block, /REMOTEBOT GLOBAL CONFIG START/);
  assert.match(block, /F:\\projects\\remotebot/);
  assert.match(block, /Không yêu cầu người dùng nhập lại BOT_TOKEN hoặc CHAT_ID/);
  assert.match(block, /tele mode on/);
  assert.match(block, /📨/);
});

test('upsertMarkedBlock thêm block khi file trống', () => {
  const block = buildCodexGlobalBlock('F:\\projects\\remotebot');
  const next = upsertMarkedBlock('', block);
  assert.match(next, /Remotebot Telegram Reporting/);
});

test('upsertMarkedBlock thay block cũ không nhân đôi', () => {
  const oldBlock = buildCodexGlobalBlock('F:\\old');
  const newBlock = buildCodexGlobalBlock('F:\\projects\\remotebot');
  const next = upsertMarkedBlock(`before\n\n${oldBlock}\n\nafter`, newBlock);
  assert.match(next, /before/);
  assert.match(next, /after/);
  assert.doesNotMatch(next, /F:\\old/);
  assert.equal((next.match(/REMOTEBOT GLOBAL CONFIG START/g) || []).length, 1);
});

test('parseArgs nhận apply và agents file', () => {
  assert.deepEqual(parseArgs(['--apply', '--agents-file', 'A.md', '--root', 'F:\\projects\\remotebot']), {
    apply: true,
    agentsFile: 'A.md',
    rootDir: 'F:\\projects\\remotebot',
  });
});
