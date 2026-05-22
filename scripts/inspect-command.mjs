#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommandIntent } from '../src/commands/parse.mjs';
import { evaluateCommand, loadPolicy, resolveAuditFile } from '../src/security/policy.mjs';
import { appendAuditEntry, buildAuditEntry } from '../src/audit/log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export function parseArgs(argv) {
  const result = { text: '', promptFile: null, policyFile: path.join(ROOT_DIR, 'remotebot.config.json'), noAudit: false, pin: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prompt-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--prompt-file cần đường dẫn file JSON');
      result.promptFile = next;
      i++;
      continue;
    }
    if (arg === '--policy') {
      const next = argv[i + 1];
      if (!next) throw new Error('--policy cần đường dẫn file JSON');
      result.policyFile = next;
      i++;
      continue;
    }
    if (arg === '--no-audit') {
      result.noAudit = true;
      continue;
    }
    if (arg === '--pin') {
      const next = argv[i + 1];
      if (!next) throw new Error('--pin cần một giá trị');
      result.pin = next;
      i++;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Flag không hỗ trợ: ${arg}`);
    positional.push(arg);
  }
  result.text = positional.join(' ').trim();
  return result;
}

function readPromptFile(promptFile) {
  const raw = fs.readFileSync(promptFile, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[inspect-command] ${error.message}`);
    process.exit(1);
  }

  let prompt = null;
  let text = args.text;
  if (args.promptFile) {
    prompt = readPromptFile(args.promptFile);
    text = prompt.text ?? '';
  }

  if (!text) {
    console.error('[inspect-command] Cần text hoặc --prompt-file.');
    process.exit(1);
  }

  const policy = loadPolicy(args.policyFile);
  const intent = parseCommandIntent(text);
  const command = evaluateCommand(intent, policy, { pin: args.pin ?? prompt?.pin });
  const auditEntry = buildAuditEntry({ command, prompt });

  if (!args.noAudit) {
    appendAuditEntry(auditEntry, resolveAuditFile(policy, ROOT_DIR));
  }

  console.log(JSON.stringify({ command, auditEntry }, null, 2));
  if (command.decision === 'deny') process.exit(2);
  if (command.decision === 'needs_pin') process.exit(3);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[inspect-command] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
