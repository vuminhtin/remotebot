import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLogTail,
  applySeverityMention,
  buildCallbackData,
  buildInlineKeyboard,
  createButtonMeta,
  chunkMessage,
  escapeMarkdownV2,
  getTelegramAdminChatRaw,
  getTelegramBotToken,
  loadEnvFromFile,
  parseAdminChatIds,
  parseArgs,
  parseButtonList,
  parseButtonSpec,
  readStdinIfPiped,
  shouldDisableNotification,
  scrubToken,
} from '../scripts/send-telegram.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('loadEnvFromFile đọc key/value và bỏ qua comment', () => {
  const file = path.join(os.tmpdir(), `remotebot-env-${Date.now()}-${process.pid}.env`);
  fs.writeFileSync(file, 'REPORT_BOT_TOKEN="abc"\n# comment\nTELEGRAM_ADMIN_CHAT_ID=123,456\n', 'utf8');
  try {
    assert.deepEqual(loadEnvFromFile(file), {
      REPORT_BOT_TOKEN: 'abc',
      TELEGRAM_ADMIN_CHAT_ID: '123,456',
    });
  } finally {
    fs.unlinkSync(file);
  }
});

test('parseAdminChatIds tách nhiều chat ID', () => {
  assert.deepEqual(parseAdminChatIds(' 123, -456 ,,789 '), ['123', '-456', '789']);
});

test('getTelegramBotToken nhận alias phổ biến', () => {
  assert.equal(getTelegramBotToken({ TELEGRAM_BOT_TOKEN: 'a' }, {}), 'a');
  assert.equal(getTelegramBotToken({}, { BOT_TOKEN: 'b' }), 'b');
});

test('getTelegramAdminChatRaw nhận alias phổ biến', () => {
  assert.equal(getTelegramAdminChatRaw({ TELEGRAM_CHAT_ID: '1' }, {}), '1');
  assert.equal(getTelegramAdminChatRaw({}, { CHAT_ID: '2' }), '2');
});

test('parseArgs nhận file, reply, raw, plain và text', () => {
  assert.deepEqual(parseArgs(['--raw', '--plain', '--reply-to', '42', '--file', 'a.md', 'caption']), {
    filePath: 'a.md',
    positional: ['caption'],
    raw: true,
    plain: true,
    replyTo: 42,
    react: null,
    severity: 'warning',
    silent: false,
    logTailPath: null,
    lines: 20,
    buttons: [],
    jobId: '',
    buttonTtl: 86400,
  });
});

test('parseArgs từ chối flag lạ', () => {
  assert.throws(() => parseArgs(['--bad']), /Unknown flag/);
});

test('escapeMarkdownV2 giữ bold cơ bản và escape ký tự đặc biệt', () => {
  assert.equal(escapeMarkdownV2('*Done:* fix issue #1!'), '*Done:* fix issue \\#1\\!');
});

test('readStdinIfPiped chỉ đọc khi stdin không phải TTY', () => {
  assert.equal(readStdinIfPiped({ stdinIsTTY: true, stdinReader: () => 'x' }), '');
  assert.equal(readStdinIfPiped({ stdinIsTTY: false, stdinReader: () => 'x' }), 'x');
});

test('chunkMessage chia nội dung dài theo giới hạn', () => {
  assert.deepEqual(chunkMessage('aa bb cc', 5), ['aa bb', 'cc']);
});

test('scrubToken che token trong lỗi', () => {
  assert.equal(scrubToken('token abc token abc', 'abc'), 'token *** token ***');
});

test('parseArgs nhận severity, silent, log-tail và artifact', () => {
  assert.deepEqual(parseArgs(['--severity', 'fatal', '--silent', '--log-tail', 'err.log', '--lines', '5', '--artifact', 'report.md']), {
    filePath: 'report.md',
    positional: [],
    raw: false,
    plain: false,
    replyTo: null,
    react: null,
    severity: 'fatal',
    silent: true,
    logTailPath: 'err.log',
    lines: 5,
    buttons: [],
    jobId: '',
    buttonTtl: 86400,
  });
});

test('parseArgs nhận quick actions và custom button', () => {
  const args = parseArgs(['--quick-actions', '--button', 'Kiểm tra=run_tests', 'need decision']);
  assert.equal(args.buttons.length, 5);
  assert.deepEqual(args.buttons[4], { text: 'Kiểm tra', action: 'run_tests' });
  assert.deepEqual(args.positional, ['need decision']);
});

test('parseButtonSpec và parseButtonList đọc nút inline', () => {
  assert.deepEqual(parseButtonSpec('Tiếp tục=continue'), { text: 'Tiếp tục', action: 'continue' });
  assert.deepEqual(parseButtonList('A=continue,B=stop'), [
    { text: 'A', action: 'continue' },
    { text: 'B', action: 'stop' },
  ]);
});

test('buildInlineKeyboard chia nút thành hàng 2 cột và gắn metadata', () => {
  assert.deepEqual(buildInlineKeyboard([
    { text: 'A', action: 'continue' },
    { text: 'B', action: 'stop' },
    { text: 'C', action: 'run_tests' },
  ], { nonce: 'abc123', now: 1000, ttlSeconds: 60, jobId: 'job1' }), {
    inline_keyboard: [
      [
        { text: 'A', callback_data: 'rb:v1:continue:abc123:1060:job1' },
        { text: 'B', callback_data: 'rb:v1:stop:abc123:1060:job1' },
      ],
      [
        { text: 'C', callback_data: 'rb:v1:run_tests:abc123:1060:job1' },
      ],
    ],
  });
});

test('buildCallbackData tạo callback data có nonce và hạn dùng', () => {
  assert.equal(buildCallbackData('send_last_log', { nonce: 'n1', now: 100, ttlSeconds: 10 }), 'rb:v1:send_last_log:n1:110');
});

test('createButtonMeta tạo metadata mặc định', () => {
  assert.deepEqual(createButtonMeta({ nonce: 'n1', now: 100, ttlSeconds: 10, jobId: 'x' }), {
    nonce: 'n1',
    exp: 110,
    jobId: 'x',
  });
});

test('shouldDisableNotification im lặng cho info/success hoặc --silent', () => {
  assert.equal(shouldDisableNotification({ severity: 'info' }), true);
  assert.equal(shouldDisableNotification({ severity: 'success' }), true);
  assert.equal(shouldDisableNotification({ severity: 'fatal' }), false);
  assert.equal(shouldDisableNotification({ severity: 'fatal', silent: true }), true);
});

test('applySeverityMention chỉ thêm mention cho fatal', () => {
  assert.equal(applySeverityMention('failed', { severity: 'fatal', fatalMention: '@tinvu_hcm' }), '@tinvu_hcm\nfailed');
  assert.equal(applySeverityMention('ok', { severity: 'success', fatalMention: '@tinvu_hcm' }), 'ok');
});

test('appendLogTail thêm tail log vào message', () => {
  const file = path.join(os.tmpdir(), `remotebot-log-${Date.now()}-${process.pid}.log`);
  fs.writeFileSync(file, 'a\nb\nc\n', 'utf8');
  try {
    assert.match(appendLogTail('failed', file, 2), /b\nc/);
  } finally {
    fs.unlinkSync(file);
  }
});
