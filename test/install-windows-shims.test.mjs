import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cmdShimContent, installShims, parseArgs } from '../scripts/install-windows-shims.mjs';

test('cmdShimContent gọi remotebot-cli bằng node', () => {
  const content = cmdShimContent('F:\\projects\\remotebot');
  assert.match(content, /@echo off/);
  assert.match(content, /remotebot-cli\.mjs/);
});

test('parseArgs nhận apply bin root name', () => {
  const args = parseArgs(['--apply', '--bin-dir', 'bin', '--root', '.', '--name', 'rb']);
  assert.equal(args.apply, true);
  assert.equal(args.binDir, 'bin');
  assert.ok(args.names.includes('rb'));
});

test('installShims ghi các file cmd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotebot-shims-'));
  try {
    const written = installShims({ binDir: dir, rootDir: 'F:\\projects\\remotebot', names: ['remotebot', 'tg'] });
    assert.equal(written.length, 2);
    assert.equal(fs.existsSync(path.join(dir, 'remotebot.cmd')), true);
    assert.equal(fs.existsSync(path.join(dir, 'tg.cmd')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
