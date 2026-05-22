#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_JOB_STATE_FILE = path.join(__dirname, 'tmp', 'remotebot-jobs.json');
const DEFAULT_AUDIT_FILE = path.join(__dirname, 'tmp', 'remotebot-audit.jsonl');

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function safeDiskInfo(targetPath = process.cwd()) {
  if (typeof fs.statfsSync !== 'function') return null;
  try {
    const stat = fs.statfsSync(path.resolve(targetPath));
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    return {
      path: path.parse(path.resolve(targetPath)).root || path.resolve(targetPath),
      total,
      free,
      usedPercent: total > 0 ? Math.round(((total - free) / total) * 100) : null,
    };
  } catch {
    return null;
  }
}

export function collectMemoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    total,
    free,
    used: total - free,
    usedPercent: total > 0 ? Math.round(((total - free) / total) * 100) : null,
  };
}

export function collectHealth({ targetPath = process.cwd(), now = new Date() } = {}) {
  const memory = collectMemoryInfo();
  return {
    ts: now.toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptimeSeconds: Math.round(os.uptime()),
    cpuCount: os.cpus().length,
    loadavg: os.loadavg(),
    memory,
    disk: safeDiskInfo(targetPath),
  };
}

export function collectTopProcesses({ limit = 5, platform = process.platform } = {}) {
  if (platform === 'win32') {
    const command = [
      '$ErrorActionPreference = "Stop";',
      `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First ${limit} ProcessName,Id,CPU,WorkingSet64 | ConvertTo-Json -Compress`,
    ].join(' ');
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => ({
      pid: row.Id,
      name: row.ProcessName,
      cpu: row.CPU ?? null,
      memoryBytes: row.WorkingSet64 ?? 0,
    }));
  }

  const out = execFileSync('ps', ['-eo', 'pid=,comm=,pcpu=,rss=', '--sort=-rss'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  }).trim();
  return out.split('\n').slice(0, limit).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+?)\s+([\d.]+)\s+(\d+)$/);
    if (!match) return null;
    return {
      pid: Number(match[1]),
      name: match[2],
      cpu: Number(match[3]),
      memoryBytes: Number(match[4]) * 1024,
    };
  }).filter(Boolean);
}

export function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readLastJsonl(filePath, limit = 5) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function collectLastAgentStatus({ stateFile = DEFAULT_JOB_STATE_FILE, auditFile = DEFAULT_AUDIT_FILE, limit = 5 } = {}) {
  const state = readJsonFile(stateFile, { jobs: {} });
  const jobs = Object.values(state.jobs ?? {})
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0, limit);
  return {
    jobs,
    audit: readLastJsonl(auditFile, limit),
  };
}

export function formatHealthText(health) {
  const disk = health.disk
    ? `\nDisk ${health.disk.path}: ${health.disk.usedPercent}% used, ${formatBytes(health.disk.free)} free / ${formatBytes(health.disk.total)}`
    : '\nDisk: unavailable';
  return [
    `Health ${health.hostname}`,
    `${health.platform} ${health.release} ${health.arch}`,
    `Uptime: ${Math.round(health.uptimeSeconds / 60)} phút`,
    `CPU: ${health.cpuCount} cores`,
    `Memory: ${health.memory.usedPercent}% used, ${formatBytes(health.memory.free)} free / ${formatBytes(health.memory.total)}`,
  ].join('\n') + disk;
}

export function formatDiskText(disk) {
  if (!disk) return 'Disk: unavailable';
  return `Disk ${disk.path}\nUsed: ${disk.usedPercent}%\nFree: ${formatBytes(disk.free)} / ${formatBytes(disk.total)}`;
}

export function formatMemoryText(memory) {
  return `Memory\nUsed: ${memory.usedPercent}%\nFree: ${formatBytes(memory.free)} / ${formatBytes(memory.total)}\nUsed bytes: ${formatBytes(memory.used)}`;
}

export function formatProcessesText(processes) {
  if (!processes.length) return 'Processes: unavailable';
  return ['Top processes by memory:', ...processes.map((p) => {
    const cpu = p.cpu == null ? '' : ` cpu=${Number(p.cpu).toFixed(1)}`;
    return `- ${p.name} pid=${p.pid} mem=${formatBytes(p.memoryBytes)}${cpu}`;
  })].join('\n');
}

export function formatLastAgentStatusText(status) {
  const jobLines = status.jobs.length
    ? status.jobs.map((job) => `- job ${job.jobId}: ${job.progress ?? '?'}% ${job.status ?? ''} (${job.updatedAt ?? 'no time'})`)
    : ['- không có job ledger'];
  const auditLines = status.audit.length
    ? status.audit.map((entry) => `- ${entry.action ?? 'unknown'}: ${entry.decision ?? 'unknown'} (${entry.ts ?? 'no time'})`)
    : ['- không có audit command'];
  return ['Last agent status', 'Jobs:', ...jobLines, 'Audit:', ...auditLines].join('\n');
}

export function buildReport(args) {
  if (args.section === 'health') return formatHealthText(collectHealth({ targetPath: args.path }));
  if (args.section === 'disk') return formatDiskText(safeDiskInfo(args.path));
  if (args.section === 'memory') return formatMemoryText(collectMemoryInfo());
  if (args.section === 'processes') return formatProcessesText(collectTopProcesses({ limit: args.limit }));
  if (args.section === 'last_agent_status') {
    return formatLastAgentStatusText(collectLastAgentStatus({
      stateFile: args.stateFile,
      auditFile: args.auditFile,
      limit: args.limit,
    }));
  }
  throw new Error(`Section không hỗ trợ: ${args.section}`);
}

export function parseArgs(argv) {
  const result = {
    json: false,
    path: process.cwd(),
    section: 'health',
    limit: 5,
    stateFile: DEFAULT_JOB_STATE_FILE,
    auditFile: DEFAULT_AUDIT_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      result.json = true;
      continue;
    }
    if (arg === '--path') {
      const next = argv[i + 1];
      if (!next) throw new Error('--path cần đường dẫn');
      result.path = next;
      i++;
      continue;
    }
    if (arg === '--section') {
      const next = argv[i + 1];
      if (!next) throw new Error('--section cần một giá trị');
      result.section = next;
      i++;
      continue;
    }
    if (arg === '--limit') {
      const next = argv[i + 1];
      if (!next) throw new Error('--limit cần một số');
      const n = Number(next);
      if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('--limit phải là số nguyên từ 1 đến 20');
      result.limit = n;
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
    if (arg === '--audit-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--audit-file cần đường dẫn');
      result.auditFile = next;
      i++;
      continue;
    }
    throw new Error(`Flag không hỗ trợ: ${arg}`);
  }
  return result;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[system-health] ${error.message}`);
    process.exit(1);
  }
  if (args.json) {
    const data = args.section === 'health'
      ? collectHealth({ targetPath: args.path })
      : args.section === 'disk'
        ? safeDiskInfo(args.path)
        : args.section === 'memory'
          ? collectMemoryInfo()
          : args.section === 'processes'
            ? collectTopProcesses({ limit: args.limit })
            : collectLastAgentStatus({ stateFile: args.stateFile, auditFile: args.auditFile, limit: args.limit });
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(buildReport(args));
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
