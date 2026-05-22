import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombinedPromptData,
  buildCallbackPromptMessage,
  callbackProcessKey,
  collectMessagesToProcess,
  filterAdminMessages,
  filterAdminCallbacks,
  findOrphanMessages,
  isStrictSuperset,
  markCallbacksProcessed,
  parseArgs,
  parseCallbackData,
  partitionOrphans,
  readProcessedCallbackKeys,
  resolveStartOffset,
} from '../scripts/tele-listen.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function update({ updateId, chatId = 123, messageId = 10, text = 'hello', replyTo = null, username = 'tinvu_hcm', chatType = 'private' } = {}) {
  const msg = {
    message_id: messageId,
    date: 1,
    text,
    chat: { id: chatId, type: chatType },
    from: { id: chatId, username },
  };
  if (replyTo != null) msg.reply_to_message = { message_id: replyTo };
  return { update_id: updateId, message: msg };
}

function callbackUpdate({ updateId = 1, chatId = 123, messageId = 10, fromId = 123, data = 'rb:v1:continue' } = {}) {
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: fromId, username: 'tinvu_hcm' },
      data,
      message: {
        message_id: messageId,
        date: 1,
        chat: { id: chatId, type: 'private' },
      },
    },
  };
}

test('parseArgs nhận filter nhiều messageId và offset file', () => {
  assert.deepEqual(parseArgs(['--filter-reply-to', '1,2,3', '--offset-file', 'offset.txt']), {
    filterReplyTo: [1, 2, 3],
    offsetFile: 'offset.txt',
  });
});

test('filterAdminMessages chỉ nhận reply đúng messageId và admin', () => {
  const updates = [
    update({ updateId: 1, messageId: 11, replyTo: 100 }),
    update({ updateId: 2, messageId: 12, replyTo: 200 }),
    update({ updateId: 3, chatId: 999, messageId: 13, replyTo: 100 }),
  ];
  const result = filterAdminMessages(updates, ['123'], [100]);
  assert.equal(result.length, 1);
  assert.equal(result[0].msg.message_id, 11);
});

test('parseCallbackData đọc callback data của Remotebot', () => {
  assert.deepEqual(parseCallbackData('rb:v1:run_tests'), {
    action: 'run_tests',
    raw: 'rb:v1:run_tests',
    valid: true,
    nonce: null,
    exp: null,
    jobId: null,
    expired: false,
  });
  const parsed = parseCallbackData('rb:v1:run_tests:n1:9999999999:job1');
  assert.equal(parsed.nonce, 'n1');
  assert.equal(parsed.exp, 9999999999);
  assert.equal(parsed.jobId, 'job1');
});

test('filterAdminCallbacks chỉ nhận callback đúng messageId và admin', () => {
  const result = filterAdminCallbacks([
    callbackUpdate({ updateId: 1, messageId: 100, data: 'rb:v1:continue' }),
    callbackUpdate({ updateId: 2, messageId: 200, data: 'rb:v1:stop' }),
    callbackUpdate({ updateId: 3, chatId: 999, fromId: 999, messageId: 100 }),
  ], ['123'], [100]);
  assert.equal(result.length, 1);
  assert.equal(result[0].msg.text, 'continue');
  assert.equal(result[0].msg._callbackQueryId, 'cb-1');
});

test('buildCallbackPromptMessage biến callback thành message-like prompt', () => {
  const msg = buildCallbackPromptMessage(callbackUpdate({ data: 'rb:v1:send_last_log', messageId: 55 }).callback_query);
  assert.equal(msg.text, 'send_last_log');
  assert.equal(msg.message_id, 55);
  assert.equal(msg.reply_to_message.message_id, 55);
});

test('callbackProcessKey khóa theo chat message và action', () => {
  assert.equal(callbackProcessKey(callbackUpdate({ chatId: 1, messageId: 2, data: 'rb:v1:continue:n1:9999999999' }).callback_query), '1:2:continue:n1');
});

test('collectMessagesToProcess bỏ callback đã xử lý và dedupe cùng nút', () => {
  const updates = [
    callbackUpdate({ updateId: 1, messageId: 100, data: 'rb:v1:continue' }),
    callbackUpdate({ updateId: 2, messageId: 100, data: 'rb:v1:continue' }),
    callbackUpdate({ updateId: 3, messageId: 100, data: 'rb:v1:run_tests' }),
  ];
  const result = collectMessagesToProcess(updates, ['123'], [100], new Set(['123:100:run_tests:no_nonce']));
  assert.equal(result.length, 1);
  assert.equal(result[0].msg.text, 'continue');
});

test('collectMessagesToProcess bỏ callback hết hạn', () => {
  const result = collectMessagesToProcess([
    callbackUpdate({ updateId: 1, messageId: 100, data: 'rb:v1:continue:n1:1' }),
  ], ['123'], [100]);
  assert.equal(result.length, 0);
});

test('markCallbacksProcessed ghi ledger callback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-callbacks-'));
  const file = path.join(dir, 'processed.jsonl');
  try {
    const entry = filterAdminCallbacks([callbackUpdate({ updateId: 1, messageId: 100, data: 'rb:v1:continue' })], ['123'], [100])[0];
    markCallbacksProcessed([entry], file);
    assert.deepEqual(readProcessedCallbackKeys(file), new Set(['123:100:continue:no_nonce']));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('findOrphanMessages nhận tin nhắn riêng không reply làm orphan', () => {
  const result = findOrphanMessages([
    update({ updateId: 1, messageId: 11, replyTo: null }),
    update({ updateId: 2, messageId: 12, replyTo: 100 }),
    update({ updateId: 3, messageId: 13, text: '/start' }),
  ], ['123']);
  assert.equal(result.length, 1);
  assert.equal(result[0].msg.message_id, 11);
});

test('partitionOrphans tách orphan khỏi update hợp lệ', () => {
  const result = partitionOrphans([
    update({ updateId: 1, messageId: 11, replyTo: null }),
    update({ updateId: 2, messageId: 12, replyTo: 100 }),
  ], ['123']);
  assert.equal(result.orphans.length, 1);
  assert.equal(result.nonOrphan.length, 1);
});

test('buildCombinedPromptData ghép nhiều reply theo thứ tự', () => {
  const messages = [
    { update: update({ updateId: 1, messageId: 11, text: 'first' }), msg: update({ updateId: 1, messageId: 11, text: 'first' }).message },
    { update: update({ updateId: 2, messageId: 12, text: 'second' }), msg: update({ updateId: 2, messageId: 12, text: 'second' }).message },
  ];
  const data = buildCombinedPromptData(messages);
  assert.equal(data.text, 'first\n\nAdmin follow-up: second');
  assert.equal(data.messageId, 12);
});

test('isStrictSuperset chỉ đúng khi filter kia lớn hơn thật sự', () => {
  assert.equal(isStrictSuperset([1, 2, 3], [1, 2]), true);
  assert.equal(isStrictSuperset([1, 2], [1, 2]), false);
  assert.equal(isStrictSuperset(null, [1]), false);
});

test('resolveStartOffset dùng min cache/global cho loop mới', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-offset-'));
  const offsetFile = path.join(dir, 'loop.txt');
  const globalFile = path.join(dir, 'global.txt');
  const cacheFile = path.join(dir, 'cache.jsonl');
  try {
    fs.writeFileSync(globalFile, '50', 'utf8');
    fs.writeFileSync(cacheFile, `${JSON.stringify(update({ updateId: 40 }))}\n${JSON.stringify(update({ updateId: 60 }))}\n`, 'utf8');
    assert.equal(resolveStartOffset(offsetFile, globalFile, cacheFile), 40);
    assert.equal(fs.readFileSync(offsetFile, 'utf8'), '40');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
