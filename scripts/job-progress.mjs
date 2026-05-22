#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile, parseAdminChatIds, scrubToken } from './send-telegram.mjs';
import { getJob, readJobState, upsertJob, writeJobState } from '../src/jobs/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
export const DEFAULT_JOB_STATE_FILE = path.join(__dirname, 'tmp', 'remotebot-jobs.json');
const TELEGRAM_API = 'https://api.telegram.org/bot';

export function parseArgs(argv) {
  const result = {
    jobId: null,
    progress: null,
    status: 'running',
    text: '',
    stateFile: DEFAULT_JOB_STATE_FILE,
    project: path.basename(process.cwd()),
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--job-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('--job-id cần một giá trị');
      result.jobId = next;
      i++;
      continue;
    }
    if (arg === '--progress') {
      const next = argv[i + 1];
      if (!next) throw new Error('--progress cần số 0-100');
      const n = Number(next);
      if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('--progress phải là số nguyên từ 0 đến 100');
      result.progress = n;
      i++;
      continue;
    }
    if (arg === '--status') {
      const next = argv[i + 1];
      if (!next) throw new Error('--status cần một giá trị');
      result.status = next;
      i++;
      continue;
    }
    if (arg === '--state-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--state-file cần đường dẫn');
      result.stateFile = next;
      i++;
      continue;
    }
    if (arg === '--project') {
      const next = argv[i + 1];
      if (!next) throw new Error('--project cần một giá trị');
      result.project = next;
      i++;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Flag không hỗ trợ: ${arg}`);
    positional.push(arg);
  }
  result.text = positional.join(' ').trim();
  if (!result.jobId) throw new Error('Cần --job-id');
  if (result.progress == null) throw new Error('Cần --progress');
  return result;
}

export function progressBar(percent, width = 10) {
  const filled = Math.round((percent / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function formatJobMessage({ project, jobId, progress, status, text }) {
  const suffix = text ? `\n${text}` : '';
  return `[${project}] ${progressBar(progress)} ${progress}% ${status}\njob: ${jobId}${suffix}`;
}

export function progressBucket(progress, step = 20) {
  return Math.floor(progress / step);
}

export function shouldUpdateJobMessage(existing, next) {
  if (!existing) return true;
  if (next.status !== existing.status) return true;
  if ((next.text || '') !== (existing.text || '')) return true;
  if (next.progress === 100 && existing.progress !== 100) return true;
  return progressBucket(next.progress) !== progressBucket(existing.progress ?? -1);
}

async function postSendMessage(token, chatId, text) {
  const payload = { chat_id: chatId, text, disable_notification: true };
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok && body?.ok !== false,
    status: res.status,
    description: body?.description,
    messageId: body?.result?.message_id,
  };
}

async function postEditMessage(token, chatId, messageId, text) {
  const payload = { chat_id: chatId, message_id: messageId, text };
  const res = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok && body?.ok !== false,
    status: res.status,
    description: body?.description,
    messageId: body?.result?.message_id ?? messageId,
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[job-progress] ${error.message}`);
    process.exit(1);
  }

  const envFromFile = loadEnvFromFile(ENV_FILE);
  const token = process.env.REPORT_BOT_TOKEN || envFromFile.REPORT_BOT_TOKEN;
  const adminIds = parseAdminChatIds(process.env.TELEGRAM_ADMIN_CHAT_ID || envFromFile.TELEGRAM_ADMIN_CHAT_ID);
  if (!token) {
    console.error('[job-progress] Chưa có REPORT_BOT_TOKEN.');
    process.exit(1);
  }
  if (adminIds.length === 0) {
    console.error('[job-progress] Chưa có TELEGRAM_ADMIN_CHAT_ID.');
    process.exit(1);
  }

  let state = readJobState(args.stateFile);
  const existing = getJob(state, args.jobId);
  if (!shouldUpdateJobMessage(existing, args)) {
    state = upsertJob(state, {
      jobId: args.jobId,
      project: args.project,
      status: args.status,
      progress: args.progress,
      text: args.text,
      messages: existing.messages ?? {},
    });
    writeJobState(args.stateFile, state);
    console.log(`[job-progress] skipped ${args.jobId}: same progress bucket and no meaningful change`);
    return;
  }
  const text = formatJobMessage(args);
  let failures = 0;
  const sent = [];

  for (const chatId of adminIds) {
    const existingMessageId = existing?.messages?.[chatId];
    try {
      let res;
      let mode = 'sent';
      if (existingMessageId) {
        res = await postEditMessage(token, chatId, existingMessageId, text);
        mode = 'edited';
        if (!res.ok) {
          res = await postSendMessage(token, chatId, text);
          mode = 'sent fallback';
        }
      } else {
        res = await postSendMessage(token, chatId, text);
      }
      if (!res.ok || !res.messageId) throw new Error(res.description ?? `HTTP ${res.status}`);
      sent.push({ chatId, messageId: res.messageId });
      console.log(`[job-progress] ${mode} ${chatId} (messageId: ${res.messageId})`);
    } catch (error) {
      failures++;
      const raw = error instanceof Error ? error.message : String(error);
      console.error(`[job-progress] failed for ${chatId}: ${scrubToken(raw, token)}`);
    }
  }

  const messages = { ...(existing?.messages ?? {}) };
  for (const item of sent) messages[item.chatId] = item.messageId;
  state = upsertJob(state, {
    jobId: args.jobId,
    project: args.project,
    status: args.status,
    progress: args.progress,
    text: args.text,
    messages,
  });
  writeJobState(args.stateFile, state);

  if (failures === adminIds.length) process.exit(1);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[job-progress] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
