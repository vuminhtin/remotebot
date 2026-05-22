import test from 'node:test';
import assert from 'node:assert/strict';
import { helpText, resolveCliCommand } from '../scripts/remotebot-cli.mjs';

test('resolveCliCommand mặc định là send', () => {
  assert.deepEqual(resolveCliCommand(['hello']), {
    script: 'send-telegram.mjs',
    args: ['hello'],
  });
});

test('resolveCliCommand nhận subcommand', () => {
  assert.deepEqual(resolveCliCommand(['health', '--section', 'disk']), {
    script: 'system-health.mjs',
    args: ['--section', 'disk'],
  });
});

test('resolveCliCommand nhận help', () => {
  assert.equal(resolveCliCommand(['--help']).help, true);
  assert.match(helpText(), /remotebot send/);
});
