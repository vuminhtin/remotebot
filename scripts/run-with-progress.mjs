#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_TMP_DIR = path.join(__dirname, 'tmp');

export function defaultJobId(now = new Date()) {
  return `job-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
}

export function parseArgs(argv, now = new Date()) {
  const result = {
    jobId: defaultJobId(now),
    project: path.basename(process.cwd()),
    logFile: null,
    noTelegram: false,
    startProgress: 0,
    runningProgress: 20,
    successProgress: 100,
    failureProgress: 100,
    command: [],
  };

  let commandMode = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (commandMode) {
      result.command.push(arg);
      continue;
    }
    if (arg === '--') {
      commandMode = true;
      continue;
    }
    if (arg === '--job-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('--job-id cần một giá trị');
      result.jobId = next;
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
    if (arg === '--log-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--log-file cần đường dẫn');
      result.logFile = next;
      i++;
      continue;
    }
    if (arg === '--no-telegram') {
      result.noTelegram = true;
      continue;
    }
    if (arg === '--running-progress') {
      const next = argv[i + 1];
      if (!next) throw new Error('--running-progress cần số 0-100');
      result.runningProgress = parsePercent(next, '--running-progress');
      i++;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Flag không hỗ trợ: ${arg}`);
    result.command.push(arg);
    commandMode = true;
  }

  if (!result.command.length) throw new Error('Cần command sau --, ví dụ: -- npm test');
  if (!result.logFile) result.logFile = path.join(DEFAULT_TMP_DIR, `${safeFilePart(result.jobId)}.log`);
  return result;
}

export function parsePercent(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`${label} phải là số nguyên từ 0 đến 100`);
  return n;
}

export function safeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'job';
}

export function summarizeCommand(command) {
  return command.map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(' ');
}

export function buildProgressStep(args, progress, status, text) {
  return [
    path.join(ROOT_DIR, 'scripts', 'job-progress.mjs'),
    '--job-id', args.jobId,
    '--project', args.project,
    '--progress', String(progress),
    '--status', status,
    text,
  ];
}

export function emitProgress(args, progress, status, text) {
  if (args.noTelegram) {
    console.log(`[run-with-progress] ${progress}% ${status}: ${text}`);
    return { status: 0 };
  }
  return spawnSync(process.execPath, buildProgressStep(args, progress, status, text), {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
}

export function appendChunk(filePath, chunk) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, chunk);
}

function runChild(command, logFile) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      appendChunk(logFile, chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      appendChunk(logFile, chunk);
    });
    child.on('error', (error) => {
      appendChunk(logFile, `${os.EOL}[run-with-progress] ${error.message}${os.EOL}`);
      resolve({ code: 1, error });
    });
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[run-with-progress] ${error.message}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(args.logFile), { recursive: true });
  fs.writeFileSync(args.logFile, `# ${new Date().toISOString()} ${summarizeCommand(args.command)}${os.EOL}`, 'utf8');

  emitProgress(args, args.startProgress, 'queued', `chuẩn bị chạy: ${summarizeCommand(args.command)}`);
  emitProgress(args, args.runningProgress, 'running', `đang chạy, log: ${args.logFile}`);
  const result = await runChild(args.command, args.logFile);
  if (result.code === 0) {
    emitProgress(args, args.successProgress, 'done', `xong, log: ${args.logFile}`);
    return;
  }
  const signal = result.signal ? ` signal=${result.signal}` : '';
  emitProgress(args, args.failureProgress, 'failed', `lỗi exit=${result.code}${signal}, log: ${args.logFile}`);
  process.exit(result.code || 1);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[run-with-progress] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
