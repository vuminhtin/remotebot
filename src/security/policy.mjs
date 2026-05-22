import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_POLICY = {
  allowedCommands: [
    'continue',
    'fix_failed_tests',
    'stop',
    'send_last_log',
    'run_tests',
    'summarize_status',
  ],
  requirePinFor: [],
  pinSha256: null,
  pinEnvVar: 'REMOTEBOT_PIN',
  dangerousTextPatterns: [
    '\\brm\\s+-rf\\b',
    '\\bRemove-Item\\b.*\\b-Recurse\\b',
    '\\brmdir\\b.*\\b/s\\b',
    '\\bdel\\b.*\\b/s\\b',
    '\\bgit\\s+reset\\s+--hard\\b',
    '\\bgit\\s+clean\\b.*\\b-f\\b',
    '\\bshutdown\\b',
    '\\breboot\\b',
    '\\bformat\\b',
  ],
  auditFile: 'scripts/tmp/remotebot-audit.jsonl',
};

export function loadPolicy(filePath = 'remotebot.config.json') {
  if (!fs.existsSync(filePath)) return { ...DEFAULT_POLICY };
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...DEFAULT_POLICY,
    ...parsed,
    allowedCommands: parsed.allowedCommands ?? DEFAULT_POLICY.allowedCommands,
    requirePinFor: parsed.requirePinFor ?? DEFAULT_POLICY.requirePinFor,
    dangerousTextPatterns: parsed.dangerousTextPatterns ?? DEFAULT_POLICY.dangerousTextPatterns,
    pinSha256: parsed.pinSha256 ?? DEFAULT_POLICY.pinSha256,
    pinEnvVar: parsed.pinEnvVar ?? DEFAULT_POLICY.pinEnvVar,
  };
}

export function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin ?? ''), 'utf8').digest('hex');
}

export function verifyPin(pin, policy = DEFAULT_POLICY, env = process.env) {
  if (pin == null || pin === '') return false;
  if (policy.pinSha256) return hashPin(pin) === String(policy.pinSha256).toLowerCase();
  const envName = policy.pinEnvVar || DEFAULT_POLICY.pinEnvVar;
  const envPin = env?.[envName];
  return Boolean(envPin) && String(pin) === String(envPin);
}

export function findDangerousPattern(text, policy = DEFAULT_POLICY) {
  const value = String(text ?? '');
  for (const rawPattern of policy.dangerousTextPatterns ?? []) {
    const pattern = new RegExp(rawPattern, 'i');
    if (pattern.test(value)) return rawPattern;
  }
  return null;
}

export function evaluateCommand(intent, policy = DEFAULT_POLICY, options = {}) {
  const dangerousPattern = findDangerousPattern(intent.rawText, policy);
  if (dangerousPattern) {
    return {
      ...intent,
      allowedToExecute: false,
      decision: 'deny',
      reason: `Nội dung giống lệnh nguy hiểm: ${dangerousPattern}`,
    };
  }

  if (intent.action === 'unknown') {
    return {
      ...intent,
      allowedToExecute: false,
      decision: 'deny',
      reason: intent.reason || 'Không rõ ý định lệnh.',
    };
  }

  if (!policy.allowedCommands?.includes(intent.action)) {
    return {
      ...intent,
      allowedToExecute: false,
      decision: 'deny',
      reason: `Command '${intent.action}' không nằm trong whitelist.`,
    };
  }

  if (policy.requirePinFor?.includes(intent.action)) {
    if (verifyPin(options.pin, policy, options.env)) {
      return {
        ...intent,
        allowedToExecute: true,
        decision: 'allow',
        pinVerified: true,
        reason: `Command '${intent.action}' được policy cho phép sau khi xác minh PIN.`,
      };
    }
    return {
      ...intent,
      allowedToExecute: false,
      decision: 'needs_pin',
      reason: `Command '${intent.action}' cần PIN trước khi thực hiện.`,
    };
  }

  return {
    ...intent,
    allowedToExecute: true,
    decision: 'allow',
    reason: `Command '${intent.action}' được policy cho phép.`,
  };
}

export function resolveAuditFile(policy, cwd = process.cwd()) {
  const auditFile = policy.auditFile || DEFAULT_POLICY.auditFile;
  return path.isAbsolute(auditFile) ? auditFile : path.resolve(cwd, auditFile);
}
