#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMMANDS = {
  send: 'send-telegram.mjs',
  listen: 'tele-listen.mjs',
  progress: 'job-progress.mjs',
  inspect: 'inspect-command.mjs',
  health: 'system-health.mjs',
  steward: 'remote-steward.mjs',
  screenshot: 'capture-screenshot.mjs',
};

export function resolveCliCommand(argv) {
  const [first, ...rest] = argv;
  if (first && COMMANDS[first]) {
    return { script: COMMANDS[first], args: rest };
  }
  if (first === '--help' || first === '-h') {
    return { script: null, args: [], help: true };
  }
  return { script: COMMANDS.send, args: argv };
}

export function helpText() {
  return [
    'Remotebot CLI',
    '',
    'Dùng nhanh:',
    '  remotebot "nội dung gửi Telegram"',
    '  tele "nội dung gửi Telegram"',
    '  tg "nội dung gửi Telegram"',
    '',
    'Subcommand:',
    '  remotebot send <args...>',
    '  remotebot listen <args...>',
    '  remotebot progress <args...>',
    '  remotebot inspect <args...>',
    '  remotebot health <args...>',
    '  remotebot steward <args...>',
    '  remotebot screenshot <args...>',
  ].join('\n');
}

function main() {
  const resolved = resolveCliCommand(process.argv.slice(2));
  if (resolved.help) {
    console.log(helpText());
    return;
  }
  const scriptPath = path.join(__dirname, resolved.script);
  const res = spawnSync(process.execPath, [scriptPath, ...resolved.args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  process.exit(res.status ?? 1);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
