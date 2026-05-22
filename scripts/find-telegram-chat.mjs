#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile, scrubToken } from './send-telegram.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const TELEGRAM_API = 'https://api.telegram.org/bot';

export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

export function parseArgs(argv) {
  const result = { username: null, writeEnv: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--username') {
      const next = argv[i + 1];
      if (!next) throw new Error('--username cần một giá trị, ví dụ --username tinvu_hcm');
      result.username = next;
      i++;
      continue;
    }
    if (arg === '--write-env') {
      result.writeEnv = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Flag không hỗ trợ: ${arg}`);
    if (!result.username) {
      result.username = arg;
      continue;
    }
    throw new Error(`Tham số không mong đợi: ${arg}`);
  }
  return result;
}

export function extractChatCandidates(updates) {
  const byKey = new Map();
  for (const update of updates) {
    const msg = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
    if (!msg?.chat?.id) continue;
    const from = msg.from || {};
    const chat = msg.chat || {};
    const username = normalizeUsername(from.username || chat.username);
    const key = String(chat.id);
    byKey.set(key, {
      chatId: key,
      username,
      firstName: from.first_name || chat.first_name || '',
      lastName: from.last_name || chat.last_name || '',
      chatType: chat.type || '',
      messageId: msg.message_id ?? null,
      updateId: update.update_id ?? null,
      text: typeof msg.text === 'string' ? msg.text.slice(0, 80) : '',
    });
  }
  return Array.from(byKey.values());
}

export function findCandidateByUsername(candidates, username) {
  const target = normalizeUsername(username);
  return candidates.find((candidate) => candidate.username === target) || null;
}

export function upsertEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const prefix = content && !content.endsWith('\n') ? `${content}\n` : content;
  return `${prefix}${line}\n`;
}

export async function fetchUpdates(token) {
  const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?timeout=0&limit=100`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.description ?? `HTTP ${res.status}`);
  }
  return body.result || [];
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[find-telegram-chat] ${error.message}`);
    process.exit(1);
  }

  const env = loadEnvFromFile(ENV_FILE);
  const token = process.env.REPORT_BOT_TOKEN || env.REPORT_BOT_TOKEN;
  const username = args.username || process.env.TELEGRAM_ADMIN_USERNAME || env.TELEGRAM_ADMIN_USERNAME || 'tinvu_hcm';

  if (!token) {
    console.error('[find-telegram-chat] Chưa có REPORT_BOT_TOKEN trong .env.');
    console.error('[find-telegram-chat] Hãy copy .env.example thành .env, điền token từ BotFather, rồi chạy lại.');
    process.exit(1);
  }

  try {
    const updates = await fetchUpdates(token);
    const candidates = extractChatCandidates(updates);
    const match = findCandidateByUsername(candidates, username);

    if (!match) {
      console.error(`[find-telegram-chat] Chưa thấy chat của @${normalizeUsername(username)} trong bot updates.`);
      console.error('[find-telegram-chat] Hãy mở Telegram, nhắn /start cho bot, rồi chạy lại lệnh này.');
      if (candidates.length > 0) {
        console.error('[find-telegram-chat] Các username bot đang thấy:');
        for (const candidate of candidates) {
          const label = candidate.username ? `@${candidate.username}` : '(không có username)';
          console.error(`- ${label} | chat_id=${candidate.chatId} | type=${candidate.chatType}`);
        }
      }
      process.exit(1);
    }

    console.log(`[find-telegram-chat] Tìm thấy @${normalizeUsername(username)}: TELEGRAM_ADMIN_CHAT_ID=${match.chatId}`);

    if (args.writeEnv) {
      const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
      const next = upsertEnvValue(
        upsertEnvValue(current, 'TELEGRAM_ADMIN_USERNAME', normalizeUsername(username)),
        'TELEGRAM_ADMIN_CHAT_ID',
        match.chatId,
      );
      fs.writeFileSync(ENV_FILE, next, 'utf8');
      console.log('[find-telegram-chat] Đã cập nhật .env.');
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error(`[find-telegram-chat] ${scrubToken(raw, token)}`);
    process.exit(1);
  }
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
