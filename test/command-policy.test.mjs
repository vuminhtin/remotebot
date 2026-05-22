import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandIntent } from '../src/commands/parse.mjs';
import { evaluateCommand, findDangerousPattern, hashPin, verifyPin } from '../src/security/policy.mjs';
import { buildAuditEntry } from '../src/audit/log.mjs';
import { parseArgs } from '../scripts/inspect-command.mjs';

test('parseCommandIntent nhận lệnh tiếng Việt', () => {
  const intent = parseCommandIntent('Sửa lỗi test đi');
  assert.equal(intent.action, 'fix_failed_tests');
  assert.equal(intent.risk, 'medium');
});

test('parseCommandIntent nhận lệnh tiếp tục', () => {
  assert.equal(parseCommandIntent('tiếp tục chạy').action, 'continue');
});

test('parseCommandIntent nhận action id từ inline button', () => {
  assert.equal(parseCommandIntent('send_last_log').action, 'send_last_log');
});

test('parseCommandIntent nhận lệnh health', () => {
  assert.equal(parseCommandIntent('kiểm tra máy').action, 'health');
});

test('parseCommandIntent nhận các lệnh steward chỉ đọc', () => {
  assert.equal(parseCommandIntent('dung lượng ổ đĩa').action, 'disk');
  assert.equal(parseCommandIntent('ram còn bao nhiêu').action, 'memory');
  assert.equal(parseCommandIntent('top processes').action, 'processes');
  assert.equal(parseCommandIntent('trạng thái agent').action, 'last_agent_status');
});

test('parseCommandIntent nhận lệnh steward mở rộng', () => {
  assert.equal(parseCommandIntent('chụp màn hình').action, 'capture_screenshot');
  assert.equal(parseCommandIntent('xem log service').action, 'service_log');
  assert.equal(parseCommandIntent('restart service worker').action, 'restart_service');
  assert.equal(parseCommandIntent('tắt máy').action, 'shutdown');
});

test('evaluateCommand cho phép command trong whitelist', () => {
  const decision = evaluateCommand(parseCommandIntent('chạy test'), {
    allowedCommands: ['run_tests'],
    requirePinFor: [],
    dangerousTextPatterns: [],
  });
  assert.equal(decision.decision, 'allow');
  assert.equal(decision.allowedToExecute, true);
});

test('evaluateCommand chặn command ngoài whitelist', () => {
  const decision = evaluateCommand(parseCommandIntent('sửa lỗi test'), {
    allowedCommands: ['run_tests'],
    requirePinFor: [],
    dangerousTextPatterns: [],
  });
  assert.equal(decision.decision, 'deny');
});

test('evaluateCommand chặn nội dung giống lệnh nguy hiểm', () => {
  const decision = evaluateCommand(parseCommandIntent('rm -rf /'), {
    allowedCommands: ['continue'],
    requirePinFor: [],
    dangerousTextPatterns: ['\\brm\\s+-rf\\b'],
  });
  assert.equal(decision.decision, 'deny');
  assert.match(decision.reason, /nguy hiểm/);
});

test('evaluateCommand trả needs_pin khi policy yêu cầu PIN', () => {
  const decision = evaluateCommand(parseCommandIntent('sửa lỗi test'), {
    allowedCommands: ['fix_failed_tests'],
    requirePinFor: ['fix_failed_tests'],
    dangerousTextPatterns: [],
  });
  assert.equal(decision.decision, 'needs_pin');
});

test('evaluateCommand cho phép khi PIN đúng', () => {
  const decision = evaluateCommand(parseCommandIntent('sửa lỗi test'), {
    allowedCommands: ['fix_failed_tests'],
    requirePinFor: ['fix_failed_tests'],
    pinSha256: hashPin('123456'),
    dangerousTextPatterns: [],
  }, { pin: '123456' });
  assert.equal(decision.decision, 'allow');
  assert.equal(decision.pinVerified, true);
});

test('verifyPin hỗ trợ env PIN khi không có hash trong config', () => {
  assert.equal(verifyPin('111222', { pinEnvVar: 'PIN_NAME' }, { PIN_NAME: '111222' }), true);
  assert.equal(verifyPin('000000', { pinEnvVar: 'PIN_NAME' }, { PIN_NAME: '111222' }), false);
});

test('findDangerousPattern tìm pattern nguy hiểm', () => {
  assert.equal(findDangerousPattern('git reset --hard HEAD', { dangerousTextPatterns: ['\\bgit\\s+reset\\s+--hard\\b'] }), '\\bgit\\s+reset\\s+--hard\\b');
});

test('buildAuditEntry ghi metadata chính', () => {
  const command = evaluateCommand(parseCommandIntent('status'), {
    allowedCommands: ['summarize_status'],
    requirePinFor: [],
    dangerousTextPatterns: [],
  });
  const entry = buildAuditEntry({ command, project: 'remotebot', prompt: { messageId: 1, chatId: '2', fromUserId: '3' } });
  assert.equal(entry.project, 'remotebot');
  assert.equal(entry.promptMessageId, 1);
  assert.equal(entry.decision, 'allow');
});

test('inspect-command parseArgs nhận prompt file và no audit', () => {
  assert.deepEqual(parseArgs(['--prompt-file', 'prompt.json', '--policy', 'p.json', '--no-audit']), {
    text: '',
    promptFile: 'prompt.json',
    policyFile: 'p.json',
    noAudit: true,
    pin: null,
  });
});

test('inspect-command parseArgs nhận pin', () => {
  const args = parseArgs(['--pin', '123456', 'sửa lỗi test']);
  assert.equal(args.text, 'sửa lỗi test');
  assert.equal(args.promptFile, null);
  assert.equal(args.noAudit, false);
  assert.equal(args.pin, '123456');
  assert.match(args.policyFile.replaceAll('/', '\\'), /remotebot\.config\.json$/);
});
