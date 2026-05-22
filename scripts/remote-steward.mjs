#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCommandIntent } from '../src/commands/parse.mjs';
import { evaluateCommand, loadPolicy } from '../src/security/policy.mjs';
import { buildReport } from './system-health.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export function parseArgs(argv) {
  const result = {
    action: 'health',
    service: null,
    config: path.join(ROOT_DIR, 'remotebot.config.json'),
    lines: 80,
    limit: 5,
    apply: false,
    pin: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--action') {
      const next = argv[i + 1];
      if (!next) throw new Error('--action cần một giá trị');
      result.action = next;
      i++;
      continue;
    }
    if (arg === '--service') {
      const next = argv[i + 1];
      if (!next) throw new Error('--service cần tên service');
      result.service = next;
      i++;
      continue;
    }
    if (arg === '--config') {
      const next = argv[i + 1];
      if (!next) throw new Error('--config cần đường dẫn');
      result.config = next;
      i++;
      continue;
    }
    if (arg === '--lines') {
      const next = argv[i + 1];
      if (!next) throw new Error('--lines cần một số');
      const n = Number(next);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error('--lines phải là số nguyên từ 1 đến 1000');
      result.lines = n;
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
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }
    if (arg === '--pin') {
      const next = argv[i + 1];
      if (!next) throw new Error('--pin cần một giá trị');
      result.pin = next;
      i++;
      continue;
    }
    throw new Error(`Flag không hỗ trợ: ${arg}`);
  }
  return result;
}

export function loadStewardConfig(filePath) {
  const policy = loadPolicy(filePath);
  return {
    policy,
    services: policy.stewardServices ?? {},
  };
}

export function resolveService(services, name) {
  if (!name) throw new Error('Cần --service cho action này');
  const service = services[name];
  if (!service) throw new Error(`Service '${name}' chưa được whitelist trong stewardServices.`);
  return service;
}

export function tailFile(filePath, lines = 80) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.split(/\r?\n/).slice(-lines).join('\n');
}

export function buildRestartCommand(service, platform = process.platform) {
  if (platform === 'win32') {
    if (!service.windowsServiceName) throw new Error('Service chưa khai báo windowsServiceName.');
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Restart-Service -Name '${String(service.windowsServiceName).replaceAll("'", "''")}' -Force`,
      ],
    };
  }
  if (!service.systemdUnit) throw new Error('Service chưa khai báo systemdUnit.');
  return {
    command: 'systemctl',
    args: ['restart', service.systemdUnit],
  };
}

export function checkPolicy(action, policy, pin) {
  const intent = parseCommandIntent(action);
  const decision = evaluateCommand(intent, policy, { pin });
  if (decision.decision !== 'allow') {
    throw new Error(decision.reason);
  }
  return decision;
}

export function runReadOnlyAction(args) {
  const sectionMap = {
    health: 'health',
    disk: 'disk',
    memory: 'memory',
    processes: 'processes',
    last_agent_status: 'last_agent_status',
  };
  const section = sectionMap[args.action];
  if (!section) return null;
  return buildReport({
    section,
    limit: args.limit,
    path: process.cwd(),
  });
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const readOnly = runReadOnlyAction(args);
    if (readOnly != null) {
      console.log(readOnly);
      return;
    }

    const { policy, services } = loadStewardConfig(args.config);
    checkPolicy(args.action, policy, args.pin);

    if (args.action === 'service_log') {
      const service = resolveService(services, args.service);
      if (!service.logFile) throw new Error(`Service '${args.service}' chưa khai báo logFile.`);
      console.log(tailFile(service.logFile, args.lines));
      return;
    }

    if (args.action === 'restart_service') {
      const service = resolveService(services, args.service);
      const cmd = buildRestartCommand(service);
      if (!args.apply) {
        console.log(`DRY RUN: ${cmd.command} ${cmd.args.join(' ')}`);
        return;
      }
      const res = spawnSync(cmd.command, cmd.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (res.status !== 0) throw new Error((res.stderr || res.stdout || `exit ${res.status}`).trim());
      console.log(`Restarted service '${args.service}'.`);
      return;
    }

    throw new Error(`Action không hỗ trợ: ${args.action}`);
  } catch (error) {
    console.error(`[remote-steward] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
