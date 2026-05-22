#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export function timestampForRelease(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

export function parseArgs(argv, now = new Date()) {
  const result = {
    version: null,
    stamp: timestampForRelease(now),
    outDir: path.join(ROOT_DIR, 'dist'),
    noZip: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') {
      const next = argv[i + 1];
      if (!next) throw new Error('--version cần một giá trị');
      result.version = next;
      i++;
      continue;
    }
    if (arg === '--stamp') {
      const next = argv[i + 1];
      if (!next) throw new Error('--stamp cần một giá trị');
      result.stamp = next;
      i++;
      continue;
    }
    if (arg === '--out-dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('--out-dir cần đường dẫn');
      result.outDir = next;
      i++;
      continue;
    }
    if (arg === '--no-zip') {
      result.noZip = true;
      continue;
    }
    throw new Error(`Flag không hỗ trợ: ${arg}`);
  }
  if (!result.version) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    result.version = pkg.version;
  }
  return result;
}

export function releaseName(version, stamp) {
  return `remotebot-${version}-${stamp}`;
}

export function shouldExcludeReleasePath(relativePath) {
  const normalized = String(relativePath).replaceAll('/', '\\');
  return (
    normalized === '.git' ||
    normalized.startsWith('.git\\') ||
    normalized === 'dist' ||
    normalized.startsWith('dist\\') ||
    normalized === 'node_modules' ||
    normalized.startsWith('node_modules\\') ||
    normalized === '.env' ||
    normalized === 'scripts\\tmp' ||
    normalized.startsWith('scripts\\tmp\\')
  );
}

export function copyReleaseTree(sourceRoot, targetRoot, relativePath = '') {
  const sourcePath = path.join(sourceRoot, relativePath);
  const items = fs.readdirSync(sourcePath, { withFileTypes: true });
  fs.mkdirSync(path.join(targetRoot, relativePath), { recursive: true });
  for (const item of items) {
    const childRel = path.join(relativePath, item.name);
    if (shouldExcludeReleasePath(childRel)) continue;
    const childSource = path.join(sourceRoot, childRel);
    const childTarget = path.join(targetRoot, childRel);
    if (item.isDirectory()) {
      copyReleaseTree(sourceRoot, targetRoot, childRel);
    } else if (item.isFile()) {
      fs.mkdirSync(path.dirname(childTarget), { recursive: true });
      fs.copyFileSync(childSource, childTarget);
    }
  }
}

export function zipDirectory(sourceDir, zipPath) {
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$source = '${path.resolve(sourceDir).replaceAll("'", "''")}'`,
    `$zip = '${path.resolve(zipPath).replaceAll("'", "''")}'`,
    'if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }',
    '[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)',
  ].join('; ');
  const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || `zip failed ${res.status}`).trim());
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const name = releaseName(args.version, args.stamp);
    const stage = path.resolve(args.outDir, name);
    const zipPath = `${stage}.zip`;
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    copyReleaseTree(ROOT_DIR, stage);
    if (!args.noZip) zipDirectory(stage, zipPath);
    console.log(JSON.stringify({ stage, zip: args.noZip ? null : zipPath }, null, 2));
  } catch (error) {
    console.error(`[package-release] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
