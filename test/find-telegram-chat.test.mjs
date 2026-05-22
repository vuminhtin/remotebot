import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractChatCandidates,
  findCandidateByUsername,
  normalizeUsername,
  parseArgs,
  upsertEnvValue,
} from '../scripts/find-telegram-chat.mjs';

test('normalizeUsername bỏ @ và không phân biệt hoa thường', () => {
  assert.equal(normalizeUsername('@TinVu_HCM'), 'tinvu_hcm');
});

test('parseArgs nhận username và --write-env', () => {
  assert.deepEqual(parseArgs(['--username', 'tinvu_hcm', '--write-env']), {
    username: 'tinvu_hcm',
    writeEnv: true,
  });
});

test('extractChatCandidates lấy chat từ updates', () => {
  const candidates = extractChatCandidates([
    {
      update_id: 1,
      message: {
        message_id: 7,
        text: '/start',
        chat: { id: 123, type: 'private' },
        from: { id: 123, username: 'tinvu_hcm', first_name: 'Tin' },
      },
    },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].chatId, '123');
  assert.equal(candidates[0].username, 'tinvu_hcm');
});

test('findCandidateByUsername tìm đúng username', () => {
  const candidate = findCandidateByUsername([
    { chatId: '1', username: 'other' },
    { chatId: '2', username: 'tinvu_hcm' },
  ], '@TinVu_HCM');
  assert.equal(candidate.chatId, '2');
});

test('upsertEnvValue cập nhật hoặc thêm key', () => {
  assert.equal(upsertEnvValue('A=1\nTELEGRAM_ADMIN_CHAT_ID=old\n', 'TELEGRAM_ADMIN_CHAT_ID', '123'), 'A=1\nTELEGRAM_ADMIN_CHAT_ID=123\n');
  assert.equal(upsertEnvValue('A=1\n', 'TELEGRAM_ADMIN_CHAT_ID', '123'), 'A=1\nTELEGRAM_ADMIN_CHAT_ID=123\n');
});
