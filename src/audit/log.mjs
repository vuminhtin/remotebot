import fs from 'node:fs';
import path from 'node:path';

export function buildAuditEntry({ command, source = 'telegram', project = path.basename(process.cwd()), prompt = null }) {
  return {
    ts: new Date().toISOString(),
    source,
    project,
    action: command.action,
    risk: command.risk,
    decision: command.decision,
    allowedToExecute: command.allowedToExecute,
    reason: command.reason,
    rawText: command.rawText,
    promptMessageId: prompt?.messageId ?? null,
    promptChatId: prompt?.chatId ?? null,
    promptFromUserId: prompt?.fromUserId ?? null,
  };
}

export function appendAuditEntry(entry, auditFile) {
  fs.mkdirSync(path.dirname(auditFile), { recursive: true });
  fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, 'utf8');
}
