#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_BIN_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'npm');
const DEFAULT_NAMES = ['remotebot', 'tele', 'tg', 'telegram'];

export function cmdShimContent(rootDir = ROOT_DIR) {
  const cli = path.join(rootDir, 'scripts', 'remotebot-cli.mjs');
  return [
    '@echo off',
    `node "${cli}" %*`,
    '',
  ].join('\r\n');
}

export function parseArgs(argv) {
  const result = {
    apply: false,
    binDir: DEFAULT_BIN_DIR,
    rootDir: ROOT_DIR,
    names: [...DEFAULT_NAMES],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }
    if (arg === '--bin-dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('--bin-dir cần đường dẫn');
      result.binDir = next;
      i++;
      continue;
    }
    if (arg === '--root') {
      const next = argv[i + 1];
      if (!next) throw new Error('--root cần đường dẫn');
      result.rootDir = path.resolve(next);
      i++;
      continue;
    }
    if (arg === '--name') {
      const next = argv[i + 1];
      if (!next) throw new Error('--name cần một tên command');
      result.names.push(next);
      i++;
      continue;
    }
    throw new Error(`Flag không hỗ trợ: ${arg}`);
  }
  return result;
}

export function installShims({ binDir, rootDir, names }) {
  fs.mkdirSync(binDir, { recursive: true });
  const content = cmdShimContent(rootDir);
  const written = [];
  for (const name of names) {
    const file = path.join(binDir, `${name}.cmd`);
    fs.writeFileSync(file, content, 'utf8');
    written.push(file);
  }
  return written;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[install-windows-shims] ${error.message}`);
    process.exit(1);
  }

  if (!args.apply) {
    console.log(cmdShimContent(args.rootDir));
    console.error(`[install-windows-shims] Dry-run. Thêm --apply để ghi vào ${args.binDir}`);
    return;
  }

  const written = installShims(args);
  for (const file of written) console.log(`[install-windows-shims] wrote ${file}`);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
