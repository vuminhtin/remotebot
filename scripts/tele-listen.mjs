#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  getTelegramAdminChatRaw,
  getTelegramBotToken,
  loadEnvFromFile,
  parseAdminChatIds,
  postReaction,
  sendTextChunk,
} from './send-telegram.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const TELEGRAM_API = 'https://api.telegram.org/bot';

export const DEFAULT_TMP_DIR = path.join(__dirname, 'tmp', 'tele-reply');
export const DEFAULT_OFFSET_FILE = path.join(DEFAULT_TMP_DIR, 'last-update-id.txt');
export const SYSTEM_MSG_IDS_FILE = path.join(DEFAULT_TMP_DIR, 'system-msg-ids.jsonl');
export const SYSTEM_MSG_IDS_LOCK_FILE = path.join(DEFAULT_TMP_DIR, 'system-msg-ids.lock');
const SYSTEM_MSG_IDS_MAX = 500;
const SYSTEM_MSG_IDS_PRUNE_THRESHOLD = SYSTEM_MSG_IDS_MAX * 2;

// Compose the per-chat key used to look up a system message; Telegram message_id
// is unique only within a chat, so the key must include chat_id to avoid
// cross-chat collisions (chat A's system msg #42 vs chat B's agent msg #42).
function systemMsgKey(chatId, messageId) {
  return `${chatId}:${messageId}`;
}

export async function appendSystemMsgId(chatId, messageId, file = SYSTEM_MSG_IDS_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // `appendFileSync` of a short line (~70 bytes) is atomic on POSIX (< PIPE_BUF),
  // so concurrent appends from multiple listeners don't tear. The prune block
  // below (read + slice + rename), however, is NOT atomic vs. concurrent appends
  // — without a lock, another process's append between our read and rename gets
  // clobbered, losing a [SYSTEM] messageId and turning a future reply-to-system
  // into a silent drop. Serialize prune with a dedicated lock.
  fs.appendFileSync(file, JSON.stringify({ chatId: String(chatId), messageId, ts: Date.now() }) + '\n', 'utf8');
  try {
    const initialLines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    if (initialLines.length <= SYSTEM_MSG_IDS_PRUNE_THRESHOLD) return;
    const lockHeld = await acquireLockWithRetry(SYSTEM_MSG_IDS_LOCK_FILE);
    if (!lockHeld) return; // someone else is pruning; their write will cover us
    try {
      // Re-read inside the lock so we don't clobber appends that landed between
      // our threshold check and the lock acquisition.
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      if (lines.length <= SYSTEM_MSG_IDS_MAX) return; // another process already pruned
      const kept = lines.slice(-SYSTEM_MSG_IDS_MAX);
      const tmp = file + `.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, kept.join('\n') + '\n', 'utf8');
      fs.renameSync(tmp, file);
    } finally {
      releasePollLock(SYSTEM_MSG_IDS_LOCK_FILE);
    }
  } catch (e) {
    console.error(`[tele-listen] system-msg-ids prune failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function readSystemMsgIds(file = SYSTEM_MSG_IDS_FILE) {
  if (!fs.existsSync(file)) return new Set();
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const trimmed = lines.slice(-SYSTEM_MSG_IDS_MAX);
  return new Set(trimmed.map((l) => {
    try {
      const { chatId, messageId } = JSON.parse(l);
      if (chatId == null || messageId == null) return null;
      return systemMsgKey(chatId, messageId);
    } catch { return null; }
  }).filter((k) => k != null));
}
export const GLOBAL_OFFSET_FILE = path.join(DEFAULT_TMP_DIR, 'global-offset.txt');
export const DEFAULT_PROMPT_FILE = path.join(DEFAULT_TMP_DIR, 'prompt.json');
export const DEFAULT_PROMPT_PROCESSING_FILE = path.join(DEFAULT_TMP_DIR, 'prompt.processing.json');
export const UPDATES_CACHE_FILE = path.join(DEFAULT_TMP_DIR, 'updates-cache.jsonl');
export const POLL_LOCK_FILE = path.join(DEFAULT_TMP_DIR, 'poll.lock');
export const REGISTRY_FILE = path.join(DEFAULT_TMP_DIR, 'listener-registry.jsonl');
export const REGISTRY_LOCK_FILE = path.join(DEFAULT_TMP_DIR, 'registry.lock');
export const PROCESSED_CALLBACKS_FILE = path.join(DEFAULT_TMP_DIR, 'processed-callbacks.jsonl');
export const REGISTRY_MAX_ENTRIES = 100;
const LOCK_STALE_MS = 30_000;

export function filterKey(filterReplyTo) {
  if (filterReplyTo == null) return null;
  const raw = Array.isArray(filterReplyTo) ? filterReplyTo.slice().sort((a, b) => a - b).join('-') : String(filterReplyTo);
  if (raw.length > 80) return crypto.createHash('md5').update(raw).digest('hex').slice(0, 16);
  return raw;
}

export function getPromptFile(filterReplyTo) {
  if (filterReplyTo == null) return DEFAULT_PROMPT_FILE;
  return path.join(DEFAULT_TMP_DIR, `prompt-${filterKey(filterReplyTo)}.json`);
}

export function getProcessingFile(filterReplyTo) {
  if (filterReplyTo == null) return DEFAULT_PROMPT_PROCESSING_FILE;
  return path.join(DEFAULT_TMP_DIR, `prompt-${filterKey(filterReplyTo)}.processing.json`);
}

export function readOffset(offsetFile = DEFAULT_OFFSET_FILE) {
  try {
    const raw = fs.readFileSync(offsetFile, 'utf8').trim();
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

// Atomic write to `targetFile`: write to a process-unique temp path, then
// rename. A naked writeFileSync risks a torn/empty file if the process dies
// mid-write; subsequent readers would see 0 and (under the new-loop init path
// in resolveStartOffset) replay every still-cached update. On any failure the
// temp file is cleaned up so we don't leak `*.tmp` artifacts.
let atomicWriteCounter = 0;
function atomicWriteFileSync(targetFile, content) {
  const dir = path.dirname(targetFile);
  fs.mkdirSync(dir, { recursive: true });
  // Suffix uses pid + ms + monotonic counter to avoid collisions if two writes
  // land in the same millisecond inside one process (e.g. tests, batch runs).
  const tmp = `${targetFile}.${process.pid}.${Date.now()}.${atomicWriteCounter++}.tmp`;
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, targetFile);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

export function writeOffset(updateId, offsetFile = DEFAULT_OFFSET_FILE) {
  atomicWriteFileSync(offsetFile, String(updateId + 1));
}

export async function fetchUpdates(token, offset) {
  const url = `${TELEGRAM_API}${token}/getUpdates?offset=${offset}&timeout=0&limit=100`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body?.description ?? `HTTP ${res.status}`);
  }
  return body.result;
}

export async function answerCallbackQuery(token, callbackQueryId, text = 'Đã nhận') {
  const payload = { callback_query_id: callbackQueryId, text, show_alert: false };
  const res = await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.ok !== false, description: body?.description };
}

export function parseArgs(argv) {
  let filterReplyTo = null;
  let offsetFile = DEFAULT_OFFSET_FILE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--filter-reply-to') {
      const next = argv[i + 1];
      if (!next) throw new Error('--filter-reply-to requires a message ID argument');
      const segments = next.trim().split(',');
      const ids = segments.map((p) => {
        const s = p.trim();
        if (!/^[1-9]\d*$/.test(s)) throw new Error(`--filter-reply-to must be a positive integer message ID, got: ${s}`);
        return Number(s);
      });
      filterReplyTo = ids.length === 1 ? ids[0] : ids;
      i++;
    } else if (argv[i] === '--offset-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--offset-file requires a path argument');
      offsetFile = next;
      i++;
    } else if (argv[i].startsWith('--')) {
      throw new Error(`Unknown flag: ${argv[i]}`);
    } else {
      throw new Error(`Unexpected positional argument: ${argv[i]}`);
    }
  }
  return { filterReplyTo, offsetFile };
}

export function filterAdminMessages(updates, adminIds, filterReplyTo = null) {
  const replyToSet = filterReplyTo == null ? null
    : Array.isArray(filterReplyTo) ? new Set(filterReplyTo)
    : new Set([filterReplyTo]);
  return updates
    .filter((u) => {
      const msg = u.message;
      if (!msg || !msg.text) return false;
      if (adminIds.length > 0 && !adminIds.includes(String(msg.chat.id))) return false;
      if (replyToSet != null && !replyToSet.has(msg.reply_to_message?.message_id)) return false;
      return true;
    })
    .map((u) => ({ update: u, msg: u.message }));
}

export function parseCallbackData(data) {
  const raw = String(data ?? '').trim();
  const match = raw.match(/^rb:v1:([a-z][a-z0-9_]{0,40})(?::([A-Za-z0-9_-]{1,16}))?(?::(\d{1,12}))?(?::([A-Za-z0-9_-]{1,24}))?$/);
  if (!match) return { action: raw, raw, valid: false, nonce: null, exp: null, jobId: null, expired: false };
  const exp = match[3] ? Number(match[3]) : null;
  const now = Math.floor(Date.now() / 1000);
  return {
    action: match[1],
    raw,
    valid: true,
    nonce: match[2] ?? null,
    exp,
    jobId: match[4] ?? null,
    expired: exp != null && exp < now,
  };
}

export function filterAdminCallbacks(updates, adminIds, filterReplyTo = null) {
  const replyToSet = filterReplyTo == null ? null
    : Array.isArray(filterReplyTo) ? new Set(filterReplyTo)
    : new Set([filterReplyTo]);
  return updates
    .filter((u) => {
      const cq = u.callback_query;
      if (!cq?.data || !cq.message) return false;
      if (adminIds.length > 0 && !adminIds.includes(String(cq.message.chat.id))) return false;
      if (adminIds.length > 0 && !adminIds.includes(String(cq.from?.id ?? cq.message.chat.id))) return false;
      if (replyToSet != null && !replyToSet.has(cq.message.message_id)) return false;
      return true;
    })
    .map((u) => ({ update: u, callbackQuery: u.callback_query, msg: buildCallbackPromptMessage(u.callback_query) }));
}

export function buildCallbackPromptMessage(callbackQuery) {
  const parsed = parseCallbackData(callbackQuery.data);
  const sourceMessage = callbackQuery.message;
  return {
    text: parsed.action,
    message_id: sourceMessage.message_id,
    date: sourceMessage.date ?? Math.floor(Date.now() / 1000),
    chat: sourceMessage.chat,
    from: callbackQuery.from ?? sourceMessage.chat,
    reply_to_message: { message_id: sourceMessage.message_id },
    _callbackQueryId: callbackQuery.id,
    _callbackData: callbackQuery.data,
    _callbackJobId: parsed.jobId,
    _callbackExp: parsed.exp,
    _callbackNonce: parsed.nonce,
    _callbackValid: parsed.valid,
  };
}

export function callbackProcessKey(callbackQuery) {
  const parsed = parseCallbackData(callbackQuery.data);
  return `${callbackQuery.message.chat.id}:${callbackQuery.message.message_id}:${parsed.action}:${parsed.nonce ?? 'no_nonce'}`;
}

export function readProcessedCallbackKeys(file = PROCESSED_CALLBACKS_FILE) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return new Set(); }
  const keys = new Set();
  for (const line of raw.trim().split('\n')) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.key) keys.add(entry.key);
    } catch {}
  }
  return keys;
}

export function markCallbacksProcessed(entries, file = PROCESSED_CALLBACKS_FILE) {
  const callbackEntries = entries.filter((entry) => entry.callbackQuery);
  if (!callbackEntries.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = callbackEntries.map((entry) => JSON.stringify({
    key: callbackProcessKey(entry.callbackQuery),
    callbackQueryId: entry.callbackQuery.id,
    action: parseCallbackData(entry.callbackQuery.data).action,
    chatId: String(entry.callbackQuery.message.chat.id),
    messageId: entry.callbackQuery.message.message_id,
    ts: Math.floor(Date.now() / 1000),
  })).join('\n') + '\n';
  fs.appendFileSync(file, lines, 'utf8');
}

export function buildPromptData(msg) {
  return {
    text: msg.text,
    messageId: msg.message_id,
    chatId: String(msg.chat.id),
    fromUserId: String(msg.from?.id ?? msg.chat.id),
    replyToMessageId: msg.reply_to_message?.message_id ?? null,
    timestamp: msg.date,
    callbackQueryId: msg._callbackQueryId ?? null,
    callbackData: msg._callbackData ?? null,
    callbackJobId: msg._callbackJobId ?? null,
    callbackExp: msg._callbackExp ?? null,
  };
}

/**
 * Combine multiple admin messages into one prompt entry.
 * First message is primary; subsequent are appended as "Admin follow-up: …".
 * messageId/chatId/etc. are taken from the LAST message (newest) so the AI
 * replies to the right thread.
 */
export function buildCombinedPromptData(messages) {
  if (!messages.length) throw new Error('messages must not be empty');
  const [first, ...rest] = messages;
  const text =
    rest.length === 0
      ? first.msg.text
      : [first.msg.text, ...rest.map((m) => `Admin follow-up: ${m.msg.text}`)].join('\n\n');
  const last = messages[messages.length - 1].msg;
  return {
    text,
    messageId: last.message_id,
    chatId: String(last.chat.id),
    fromUserId: String(last.from?.id ?? last.chat.id),
    replyToMessageId: last.reply_to_message?.message_id ?? null,
    timestamp: last.date,
    callbackQueryId: last._callbackQueryId ?? null,
    callbackData: last._callbackData ?? null,
    callbackJobId: last._callbackJobId ?? null,
    callbackExp: last._callbackExp ?? null,
  };
}

export function findOrphanMessages(updates, adminIds, systemMsgIds = new Set()) {
  return updates.filter((u) => {
    const msg = u.message;
    if (!msg || !msg.text) return false;
    if (msg.chat.type !== 'private') return false;
    if (adminIds.length > 0 && !adminIds.includes(String(msg.chat.id))) return false;
    // Replies to system messages (warnings the bot itself sent) are still orphans
    // from any agent's perspective — no Monitor filter will match. Treat them as
    // orphans so the user gets a fresh 💔 + warning rather than silent drop.
    if (msg.reply_to_message && !systemMsgIds.has(`${msg.chat.id}:${msg.reply_to_message.message_id}`)) return false;
    // Bot API 7.0+: quote-replies may surface reply info in external_reply when the
    // user quoted a fragment, even if reply_to_message is absent. Treat as non-orphan.
    if (msg.external_reply) return false;
    if (msg.text.trim().startsWith('/')) return false;
    return true;
  }).map((u) => ({ update: u, msg: u.message, orphan: true }));
}

export function collectMessagesToProcess(updates, adminIds, filterReplyTo, processedCallbackKeys = new Set()) {
  const seenCallbackKeys = new Set();
  const callbacks = filterAdminCallbacks(updates, adminIds, filterReplyTo).filter((entry) => {
    const parsed = parseCallbackData(entry.callbackQuery.data);
    if (parsed.expired) return false;
    const key = callbackProcessKey(entry.callbackQuery);
    if (processedCallbackKeys.has(key) || seenCallbackKeys.has(key)) return false;
    seenCallbackKeys.add(key);
    return true;
  });
  return [
    ...filterAdminMessages(updates, adminIds, filterReplyTo),
    ...callbacks,
  ].sort((a, b) => a.update.update_id - b.update.update_id);
}

/**
 * Resolve the start offset for a loop.
 *
 * - Existing loop (per-loop file > 0): use its own offset (it has been advancing
 *   itself; never roll back).
 * - New loop (per-loop file missing or 0): initialize from min(cache, global).
 *   We can't simply inherit globalOffset because another loop may have already
 *   advanced it past updates still sitting in our shared cache that the new
 *   loop needs to see (its filter may match them). Starting from the oldest
 *   cached update_id guarantees a new loop reads every update currently
 *   buffered locally, even ones already "consumed" by other loops' offset
 *   advances. Cache pruning keeps this bounded (last 500 updates).
 */
export function resolveStartOffset(
  offsetFile,
  globalOffsetFile = GLOBAL_OFFSET_FILE,
  cacheFile = UPDATES_CACHE_FILE,
) {
  const perLoop = readOffset(offsetFile);
  if (perLoop > 0) return perLoop;

  const globalOffset = readOffset(globalOffsetFile);
  let startOffset = globalOffset;

  // If the cache has entries older than globalOffset, prefer the oldest cached
  // update_id so we don't miss updates that other loops have already pulled in.
  //
  // Known limitation: the cache is shared across all conversations on this bot.
  // If the caller's filter happens to match an old cached reply (e.g. resuming
  // an older conversation whose IDS list still contains messageIds replied to
  // long ago), that reply will be re-surfaced. The script does not maintain a
  // "processed update_id" ledger, so a prompt file may be written for an update
  // that an earlier session already handled — the Monitor will fire, and the
  // owning agent may re-reply unless it is defensive about the notification
  // (see telegram-guide.md §Notes — "Duplicate safety (partial)"). A future
  // fix can persist a per-loop highest-processed update_id set instead of
  // relying on a single offset.
  const cache = readCache(cacheFile);
  if (cache.length > 0) {
    // Use reduce instead of Math.min(...spread) to avoid call-stack limits if
    // the cache cap is ever raised above the JS argument limit.
    const minCached = cache.reduce(
      (m, u) => (u.update_id < m ? u.update_id : m),
      Infinity,
    );
    if (Number.isFinite(minCached) && minCached > 0 && (startOffset === 0 || minCached < startOffset)) {
      startOffset = minCached;
    }
  }

  if (startOffset > 0) atomicWriteFileSync(offsetFile, String(startOffset));
  return startOffset;
}


export function acquirePollLock(lockFile = POLL_LOCK_FILE) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(Date.now()));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try {
      const content = fs.readFileSync(lockFile, 'utf8').trim();
      const lockTime = parseInt(content, 10);
      if (!isNaN(lockTime) && Date.now() - lockTime > LOCK_STALE_MS) {
        fs.unlinkSync(lockFile);
        return acquirePollLock(lockFile);
      }
    } catch {}
    return false;
  }
}

export function releasePollLock(lockFile = POLL_LOCK_FILE) {
  try { fs.unlinkSync(lockFile); } catch {}
}

export function appendToCache(updates, cacheFile = UPDATES_CACHE_FILE) {
  if (!updates.length) return;
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const lines = updates.map((u) => JSON.stringify(u)).join('\n') + '\n';
  fs.appendFileSync(cacheFile, lines, 'utf8');
}

export function readCache(cacheFile = UPDATES_CACHE_FILE) {
  let raw;
  try {
    raw = fs.readFileSync(cacheFile, 'utf8');
  } catch {
    return [];
  }
  const results = [];
  for (const line of raw.trim().split('\n')) {
    if (!line) continue;
    try { results.push(JSON.parse(line)); } catch {}
  }
  return results;
}

export function readCacheSinceOffset(offset, cacheFile = UPDATES_CACHE_FILE) {
  return readCache(cacheFile).filter((u) => u.update_id >= offset);
}

export function pruneCache(maxEntries = 500, cacheFile = UPDATES_CACHE_FILE) {
  const all = readCache(cacheFile);
  if (all.length <= maxEntries) return;
  const kept = all.slice(-maxEntries);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmp = cacheFile + `.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, kept.map((u) => JSON.stringify(u)).join('\n') + '\n', 'utf8');
  fs.renameSync(tmp, cacheFile);
}

export function partitionOrphans(fetched, adminIds, systemMsgIds = new Set()) {
  const orphanEntries = findOrphanMessages(fetched, adminIds, systemMsgIds);
  const orphanIds = new Set(orphanEntries.map((e) => e.update.update_id));
  return {
    orphans: orphanEntries,
    nonOrphan: fetched.filter((u) => !orphanIds.has(u.update_id)),
  };
}

export async function reactToOrphans(token, orphanEntries, systemMsgIds = new Set()) {
  const reacted = [];
  for (const entry of orphanEntries) {
    const chatId = String(entry.msg.chat.id);
    const msgId = entry.msg.message_id;
    try {
      const { ok, description } = await postReaction(token, chatId, msgId, '💔');
      if (ok) reacted.push(entry);
      else console.error(`[tele-listen] orphan react rejected for ${msgId}: ${description}`);
    } catch (e) {
      console.error(`[tele-listen] orphan react failed for ${msgId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Send an explanatory reply so first-time users understand why their message
    // was ignored. Two variants: one for users who sent a plain message (no reply
    // target), one for users who replied to a [SYSTEM] message by mistake. Once
    // per orphan (orphans are partitioned out of the cache by the centralized
    // fetch, so this never duplicates across loops).
    const repliedToSystem = entry.msg.reply_to_message
      && systemMsgIds.has(`${chatId}:${entry.msg.reply_to_message.message_id}`);
    const text = repliedToSystem
      ? '[SYSTEM] Please reply to a regular message, not [SYSTEM] message.'
      : "[SYSTEM] You need to reply to one of AI agent's previous messages.";
    try {
      const res = await sendTextChunk(token, chatId, text, { plain: true, replyTo: msgId });
      // Track the system message's own messageId so a user replying to *it*
      // (instead of an agent message) is also detected as orphan on the next
      // fetch — otherwise it would silently drop (no Monitor filter knows it).
      // Skip recording if sendTextChunk fell back to .md document (long text or
      // markdown parse error) — that .md is not a [SYSTEM] message.
      if (res?.messageId && !res.fallback) await appendSystemMsgId(chatId, res.messageId);
    } catch (e) {
      console.error(`[tele-listen] orphan reply-hint failed for ${msgId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return reacted;
}

export async function reactToMessages(token, messages) {
  for (const entry of messages) {
    const chatId = String(entry.msg.chat.id);
    const msgId = entry.msg.message_id;
    let success = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { ok, description } = await postReaction(token, chatId, msgId);
        if (ok) { success = true; break; }
        console.error(`[tele-listen] react rejected for ${msgId} (attempt ${attempt + 1}): ${description}`);
      } catch (e) {
        console.error(`[tele-listen] react failed for ${msgId} (attempt ${attempt + 1}): ${e instanceof Error ? e.message : String(e)}`);
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 5000));
    }
    if (!success) console.error(`[tele-listen] react gave up for ${msgId} after 2 attempts`);
  }
}

export async function acknowledgeEntries(token, entries) {
  for (const entry of entries) {
    if (entry.callbackQuery?.id || entry.msg?._callbackQueryId) {
      const callbackQueryId = entry.callbackQuery?.id || entry.msg._callbackQueryId;
      try {
        const { ok, description } = await answerCallbackQuery(token, callbackQueryId);
        if (!ok) console.error(`[tele-listen] callback ack rejected for ${callbackQueryId}: ${description}`);
      } catch (e) {
        console.error(`[tele-listen] callback ack failed for ${callbackQueryId}: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }
    await reactToMessages(token, [entry]);
  }
}

// Listener registry: lets a listener detect that another listener with a strictly
// broader filter (= the same conversation's newer Monitor) is alive, and self-exit.
// Cross-conversation safety is by *convention*, not construction: each agent must
// only put its own bot-sent messageIds in `--filter-reply-to`. So two different
// conversations' filter sets are disjoint, and strict-superset can only match
// intra-conversation. See telegram-guide.md §Auto-supersede.

/**
 * Liveness probe. Returns true iff the OS still has a process at `pid`.
 * `process.kill(pid, 0)` performs the existence check without sending a signal.
 * EPERM = exists but we can't signal it (still alive). ESRCH = no such process.
 * Anything else is logged so a future macOS/kernel quirk is visible, not silent.
 */
export function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (!e || typeof e !== 'object') return false;
    if (e.code === 'EPERM') return true;
    if (e.code === 'ESRCH') return false;
    console.error(`[tele-listen] unexpected kill(${pid}, 0) error: ${e.code ?? e.message}`);
    return false;
  }
}

/**
 * Capture a process's start time so we can detect PID reuse later.
 * Returns a string identifier (lstart from `ps`) or null on failure.
 * The exact format doesn't matter — we only compare for equality.
 * Important: pass pid as an arg with `execFileSync` to avoid shell injection.
 */
export function getProcessStartTime(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return null;

  // Linux fast path: /proc/<pid>/stat field 22 is starttime in clock ticks
  // since boot. Stable per process, equality-comparable, no subprocess. Works
  // on every Linux (incl. Alpine/BusyBox where `ps -o lstart=` is missing).
  // The `comm` field (parenthesized) may contain spaces/parens, so we slice
  // after the LAST ')' to avoid mis-splitting.
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2);
    // After ')<sp>', fields begin at index 0 = state (field 3 in 1-indexed).
    // We want field 22 = index 22 - 3 = 19.
    const starttime = afterComm.split(' ')[19];
    if (starttime && /^\d+$/.test(starttime)) return `proc:${starttime}`;
  } catch {
    // /proc not available (macOS, restricted env) — fall through to ps.
  }

  // macOS + most GNU/Linux: `ps -o lstart=` is the portable identifier.
  // LC_ALL=C pins month/day names so writer-vs-reader locale skew can't
  // make a live process look like a different one. Tag the return value so
  // a proc-flavored startTime never accidentally compares equal to a
  // ps-flavored one (different format, same machine — paranoia, since one
  // host normally produces one flavor).
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 500,
      env: { ...process.env, LC_ALL: 'C' },
    }).trim();
    return out ? `ps:${out}` : null;
  } catch {
    return null;
  }
}

/**
 * Liveness with PID-reuse protection. A registry entry is "live" only if the
 * process at entry.pid is still alive AND its current start time matches what
 * we recorded when the entry was written. If the recorded `startTime` is
 * absent (legacy or capture failed), we fall back to plain isProcessAlive —
 * the entry will eventually be refreshed with a startTime by its owner.
 */
export function isLiveEntry(entry) {
  if (!entry || !Number.isFinite(entry.pid) || entry.pid <= 0) return false;
  if (!isProcessAlive(entry.pid)) return false;
  if (!entry.startTime) return true;
  const current = getProcessStartTime(entry.pid);
  if (!current) return false;
  return current === entry.startTime;
}

export function readRegistry(file = REGISTRY_FILE) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  let parseFailures = 0;
  let totalLines = 0;
  for (const line of raw.trim().split('\n')) {
    if (!line) continue;
    totalLines++;
    try { out.push(JSON.parse(line)); }
    catch { parseFailures++; }
  }
  if (parseFailures > 0) {
    console.error(`[tele-listen] registry: dropped ${parseFailures}/${totalLines} malformed line(s)`);
  }
  return out;
}

function writeRegistry(entries, file = REGISTRY_FILE) {
  // Always rewrite via atomic rename — even an empty registry uses an empty
  // file rather than unlink, so we don't race a peer's read against an
  // intermediate "file gone" state and silently lose entries.
  const content = entries.length === 0 ? '' : entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  atomicWriteFileSync(file, content);
}

/**
 * Acquire `lockFile` via O_EXCL with bounded async retries. Returns true on success.
 * Pattern mirrors acquirePollLock (sync), wrapped in a polling retry loop so
 * callers can `await` instead of busy-spinning. Stale locks are inherited from
 * acquirePollLock's existing LOCK_STALE_MS reclaim.
 */
async function acquireLockWithRetry(lockFile, { maxAttempts = 50, retryMs = 20 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    if (acquirePollLock(lockFile)) return true;
    // Jitter: two listeners launched at the same instant otherwise retry in
    // lockstep and keep colliding on the same windows.
    const jitter = Math.floor(Math.random() * retryMs);
    await new Promise((r) => setTimeout(r, retryMs + jitter));
  }
  return false;
}

/**
 * Refresh registry: drop dead entries + dedupe by pid + add/update mine.
 * Guarantees at most one entry per `pid` (load-bearing for findSuperseder's
 * self-exclusion: when iterating, we skip my own pid; with only one entry per
 * pid that's sufficient).
 *
 * Lock-protected: two listeners refreshing concurrently must not lose entries.
 * If lock can't be acquired (very rare), we fall back to a best-effort
 * read-only path: we still return the most recent on-disk registry so the
 * caller's supersede check works, but we don't write our own entry this round.
 * The next invocation 12s later will retry — eventual consistency.
 */
export async function refreshRegistry({
  pid,
  filter,
  offsetFile,
  file = REGISTRY_FILE,
  lockFile = REGISTRY_LOCK_FILE,
  now = Date.now(),
  startTime = getProcessStartTime(pid),
  maxEntries = REGISTRY_MAX_ENTRIES,
}) {
  const locked = await acquireLockWithRetry(lockFile);
  if (!locked) {
    // Read-only fallback: peers still see whatever was on disk last write,
    // so we can detect *being* superseded. We do NOT write our own entry
    // this cycle, which means *being detected as a superseder* by older
    // peers is delayed by one poll. Acceptable: the next 12s poll retries.
    console.error('[tele-listen] could not acquire registry lock; will retry next poll');
    return readRegistry(file);
  }
  try {
    const all = readRegistry(file);
    const live = all.filter((e) => e.pid !== pid && isLiveEntry(e));
    const existing = all.find((e) => e.pid === pid);
    const mine = {
      pid,
      filter,
      offsetFile,
      startedAt: existing && Number.isFinite(existing.startedAt) ? existing.startedAt : now,
      // If a transient `ps` failure returned null, keep the prior valid startTime
      // rather than downgrade liveness checks to fallback mode next round.
      startTime: startTime ?? existing?.startTime ?? null,
    };
    // Cap registry size as defense in depth — keep newest entries.
    let next = [...live, mine];
    if (next.length > maxEntries) next = next.slice(-maxEntries);
    writeRegistry(next, file);
    return next;
  } finally {
    releasePollLock(lockFile);
  }
}

/**
 * Strict-superset check, used to decide whether some other listener's filter
 * (`otherFilter`) covers ours (`myFilter`) and therefore makes us obsolete.
 *
 * Null filter means "catch-all" — listening for any reply, no IDS constraint.
 * We treat catch-all as **neither superseding nor superseded by** any filter:
 * - If `myFilter == null`, we're catch-all and shouldn't be killed by some
 *   narrower filtered listener.
 * - If `otherFilter == null`, treating it as catch-all that supersedes everyone
 *   would let any unintended catch-all run (debug invocation, future code path)
 *   wipe out every legitimate filtered listener across all conversations,
 *   breaking the cross-conversation safety property.
 * Returning false in both cases keeps the mechanism conservative.
 */
export function isStrictSuperset(otherFilter, myFilter) {
  if (myFilter == null || otherFilter == null) return false;
  const mineArr = Array.isArray(myFilter) ? myFilter : [myFilter];
  const otherArr = Array.isArray(otherFilter) ? otherFilter : [otherFilter];
  const mineSet = new Set(mineArr);
  const otherSet = new Set(otherArr);
  if (otherSet.size <= mineSet.size) return false; // must be strictly larger
  for (const m of mineSet) if (!otherSet.has(m)) return false;
  return true;
}

export function findSuperseder({ myPid, myFilter, registry }) {
  for (const e of registry) {
    if (e.pid === myPid) continue;
    if (isStrictSuperset(e.filter, myFilter)) return e;
  }
  return null;
}

export function writePromptAtomic(data, promptFile = DEFAULT_PROMPT_FILE) {
  const dir = path.dirname(promptFile);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = promptFile + `.${Date.now()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, promptFile);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[tele-listen] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const { filterReplyTo, offsetFile } = args;

  // Ensure the shared tmp dir exists before any writer touches it. Several
  // codepaths (audit log, atomicWriteFileSync, lock files) recreate it on
  // demand, but the audit-log appendFileSync at fetch time would silently
  // drop the first line of the first-ever run if we don't ensure it here.
  fs.mkdirSync(DEFAULT_TMP_DIR, { recursive: true });

  const envFromFile = loadEnvFromFile(ENV_FILE);
  const token = getTelegramBotToken(process.env, envFromFile);
  const adminIds = parseAdminChatIds(getTelegramAdminChatRaw(process.env, envFromFile));

  if (!token) {
    console.error('[tele-listen] Missing REPORT_BOT_TOKEN / TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }

  // Registry-based supersede: if another live listener has a strict-superset
  // filter (= the same conversation moved to a newer Monitor with broader IDS),
  // self-exit cleanly so the outer `until ...; do sleep 12; done` loop ends and
  // the orphaned wrapper goes away. We track by PPID — the long-lived bash
  // wrapper — not our own PID, which is short-lived (one poll per invocation).
  //
  // We refresh BEFORE the promptFile/processingFile checks below so the
  // registry stays current even when this poll is a no-op (peers must see us).
  const myMonitorPid = process.ppid;
  const registry = await refreshRegistry({ pid: myMonitorPid, filter: filterReplyTo, offsetFile });
  const superseder = findSuperseder({ myPid: myMonitorPid, myFilter: filterReplyTo, registry });
  if (superseder) {
    console.log(
      `[tele-listen] superseded by listener pid=${superseder.pid} with broader filter — exiting`,
    );
    process.exit(0);
  }

  const promptFile = getPromptFile(filterReplyTo);
  const processingFile = getProcessingFile(filterReplyTo);

  if (fs.existsSync(processingFile)) {
    console.log(`[tele-listen] ${path.basename(processingFile)} exists — still processing, skipping`);
    process.exit(2);
  }

  if (fs.existsSync(promptFile)) {
    console.log(`[tele-listen] ${path.basename(promptFile)} exists — not yet consumed, skipping`);
    process.exit(2);
  }

  // Centralized fetch: acquire lock, fetch updates, cache locally.
  // Orphans are detected and excluded from cache under lock; reaction happens after.
  // The systemMsgIds snapshot is read ONCE per loop and reused for both the
  // in-lock classification and the out-of-lock reply text selection, so a
  // concurrent process appending a new id mid-loop can't flip an orphan's
  // variant between detection and response.
  let fetchFailed = false;
  let pendingOrphans = [];
  let systemMsgIdsSnapshot = new Set();
  const lockAcquired = acquirePollLock();
  if (lockAcquired) {
    try {
      const globalOffset = readOffset(GLOBAL_OFFSET_FILE);
      const fetched = await fetchUpdates(token, globalOffset);
      if (fetched.length > 0) {
        systemMsgIdsSnapshot = readSystemMsgIds();
        const { orphans, nonOrphan } = partitionOrphans(fetched, adminIds, systemMsgIdsSnapshot);
        pendingOrphans = orphans;
        if (nonOrphan.length > 0) appendToCache(nonOrphan);
        // Audit log: every fetched update with classification + reason. Lets us debug
        // cache-miss issues (e.g. user-reply ended up orphan'd because Telegram stripped
        // reply_to_message). Append-only JSONL; rotation handled by external tooling.
        try {
          const auditFile = path.join(DEFAULT_TMP_DIR, 'fetch-audit.jsonl');
          const orphanSet = new Set(orphans.map((o) => o.update.update_id));
          const cachedSet = new Set(nonOrphan.map((u) => u.update_id));
          const lines = fetched.map((u) => {
            const m = u.message;
            const kind = orphanSet.has(u.update_id)
              ? 'orphan'
              : cachedSet.has(u.update_id)
                ? 'cached'
                : 'other';
            return JSON.stringify({
              ts: Math.floor(Date.now() / 1000),
              update_id: u.update_id,
              message_id: m?.message_id ?? u.callback_query?.message?.message_id ?? null,
              from: m?.from?.id ?? u.callback_query?.from?.id ?? null,
              reply_to: m?.reply_to_message?.message_id ?? u.callback_query?.message?.message_id ?? null,
              has_text: Boolean(m?.text || u.callback_query?.data),
              text_preview: m?.text ? m.text.slice(0, 60) : u.callback_query?.data?.slice(0, 60) ?? null,
              update_type: m
                ? 'message'
                : u.edited_message
                  ? 'edited_message'
                  : u.message_reaction
                    ? 'message_reaction'
                    : u.callback_query
                      ? 'callback_query'
                    : Object.keys(u).filter((k) => k !== 'update_id')[0] ?? 'unknown',
              classification: kind,
            });
          });
          fs.appendFileSync(auditFile, lines.join('\n') + '\n', 'utf8');
        } catch (e) {
          console.error(`[tele-listen] audit log write failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        const maxUpdateId = Math.max(...fetched.map((u) => u.update_id));
        writeOffset(maxUpdateId, GLOBAL_OFFSET_FILE);
      }
      pruneCache();
    } catch (e) {
      fetchFailed = true;
      console.error(`[tele-listen] getUpdates failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      releasePollLock();
    }
  }

  // React 💔 to orphans outside lock (best-effort, does not block polling).
  // Use the same systemMsgIds snapshot captured under the lock for the variant
  // text decision — keeps classification and response consistent.
  if (pendingOrphans.length > 0) {
    await reactToOrphans(token, pendingOrphans, systemMsgIdsSnapshot);
  }

  // Resolve per-loop offset AFTER fetch+prune so a new loop's min(cache)
  // initialization reflects what is actually still buffered. Calling it before
  // pruning races: pruneCache may remove the oldest cached entries that the
  // new loop's offset would have pointed at, and the subsequent cache read
  // would then yield only newer entries while `advanceLoopOffset` jumped past
  // the now-deleted ones, permanently skipping any matching updates.
  const loopOffset = resolveStartOffset(offsetFile);

  // Read from local cache using per-loop offset.
  let updates = readCacheSinceOffset(loopOffset);

  if (fetchFailed && updates.length === 0) {
    process.exit(1);
  }

  const processedCallbackKeys = readProcessedCallbackKeys();
  const candidateCallbacks = filterAdminCallbacks(updates, adminIds, filterReplyTo);
  for (const entry of candidateCallbacks) {
    const parsed = parseCallbackData(entry.callbackQuery.data);
    if (parsed.expired) {
      try {
        await answerCallbackQuery(token, entry.callbackQuery.id, 'Nút này đã hết hạn');
      } catch {}
      continue;
    }
    const key = callbackProcessKey(entry.callbackQuery);
    if (!processedCallbackKeys.has(key)) continue;
    try {
      await answerCallbackQuery(token, entry.callbackQuery.id, 'Nút này đã được xử lý');
    } catch {}
  }

  const toProcess = collectMessagesToProcess(updates, adminIds, filterReplyTo, processedCallbackKeys);

  const advanceLoopOffset = () => {
    if (updates.length > 0) {
      const maxUpdateId = Math.max(...updates.map((u) => u.update_id));
      writeOffset(maxUpdateId, offsetFile);
    }
  };

  if (toProcess.length === 0) {
    advanceLoopOffset();
    process.exit(2);
  }

  let data;
  data = buildCombinedPromptData(toProcess);
  writePromptAtomic(data, promptFile);
  markCallbacksProcessed(toProcess);
  // React 👍 AFTER successful prompt write to avoid false ack on failure.
  await acknowledgeEntries(token, toProcess);
  advanceLoopOffset();
  const preview = data.text.slice(0, 60);
  console.log(
    `[tele-listen] prompt written to ${promptFile}: "${preview}${data.text.length > 60 ? '…' : ''}" (messageId: ${data.messageId})`,
  );
  process.exit(0);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main().catch((e) => {
    console.error(`[tele-listen] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
