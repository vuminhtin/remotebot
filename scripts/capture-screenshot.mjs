#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SCREENSHOT_DIR = path.join(__dirname, 'tmp', 'screenshots');

export function timestampForFile(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function defaultScreenshotPath(now = new Date()) {
  return path.join(DEFAULT_SCREENSHOT_DIR, `screenshot-${timestampForFile(now)}.png`);
}

export function parseArgs(argv, now = new Date()) {
  const result = {
    out: defaultScreenshotPath(now),
    send: false,
    caption: 'Screenshot từ Remotebot',
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      const next = argv[i + 1];
      if (!next) throw new Error('--out cần đường dẫn file .png');
      result.out = next;
      i++;
      continue;
    }
    if (arg === '--send') {
      result.send = true;
      continue;
    }
    if (arg === '--caption') {
      const next = argv[i + 1];
      if (!next) throw new Error('--caption cần nội dung');
      result.caption = next;
      i++;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Flag không hỗ trợ: ${arg}`);
    positional.push(arg);
  }
  if (positional.length) result.caption = positional.join(' ');
  if (path.extname(result.out).toLowerCase() !== '.png') throw new Error('--out phải là file .png');
  return result;
}

export function buildWindowsScreenshotScript(outPath) {
  const safeOut = String(path.resolve(outPath)).replaceAll("'", "''");
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$screen = [System.Windows.Forms.Screen]::PrimaryScreen',
    '$bounds = $screen.Bounds',
    '$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height',
    '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
    '$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)',
    `$bitmap.Save('${safeOut}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    '$graphics.Dispose()',
    '$bitmap.Dispose()',
  ].join('; ');
}

export function captureScreenshot(outPath, platform = process.platform) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  if (platform !== 'win32') {
    return {
      ok: false,
      reason: `capture-screenshot hiện mới hỗ trợ Windows desktop, platform=${platform}`,
    };
  }
  const res = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    buildWindowsScreenshotScript(outPath),
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    return {
      ok: false,
      reason: (res.stderr || res.stdout || `PowerShell exit ${res.status}`).trim(),
    };
  }
  return {
    ok: fs.existsSync(outPath),
    path: path.resolve(outPath),
    reason: fs.existsSync(outPath) ? null : 'PowerShell chạy xong nhưng không thấy file ảnh.',
  };
}

export function sendScreenshot(outPath, caption) {
  return spawnSync(process.execPath, [
    path.join(ROOT_DIR, 'scripts', 'send-telegram.mjs'),
    '--artifact', path.resolve(outPath),
    caption,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[capture-screenshot] ${error.message}`);
    process.exit(1);
  }

  const result = captureScreenshot(args.out);
  if (!result.ok) {
    console.error(`[capture-screenshot] ${result.reason}`);
    process.exit(1);
  }
  console.log(`[capture-screenshot] saved ${result.path}`);
  if (args.send) {
    const send = sendScreenshot(result.path, args.caption);
    if (send.status !== 0) process.exit(send.status || 1);
  }
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
