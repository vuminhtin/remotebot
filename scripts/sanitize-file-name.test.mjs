import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, 'tele-listen.mjs'), 'utf8');

// Extract sanitizeFileName function for testing
const match = code.match(/function sanitizeFileName\(rawName\) \{[\s\S]*?\n\}/);
if (!match) throw new Error('Could not find sanitizeFileName function');
const sanitizeFileName = new Function('rawName', `${match[0]}; return sanitizeFileName(rawName);`);

test('sanitizeFileName', async (t) => {
  await t.test('path traversal', () => {
    assert.strictEqual(sanitizeFileName('../etc/passwd'), 'etc_passwd');
    assert.strictEqual(sanitizeFileName('..\\windows\\system32'), 'windows_system32');
  });

  await t.test('pure dots', () => {
    assert.strictEqual(sanitizeFileName('.'), null);
    assert.strictEqual(sanitizeFileName('..'), null);
    assert.strictEqual(sanitizeFileName('...'), null);
  });

  await t.test('RTL override character (U+202E)', () => {
    assert.strictEqual(sanitizeFileName('\u202Eevil.exe'), 'evil.exe');
  });

  await t.test('BIDI isolate (U+2066)', () => {
    assert.strictEqual(sanitizeFileName('\u2066evil.exe'), 'evil.exe');
  });

  await t.test('NUL byte', () => {
    assert.strictEqual(sanitizeFileName('file\x00.txt'), 'file.txt');
  });

  await t.test('empty string', () => {
    assert.strictEqual(sanitizeFileName(''), null);
    assert.strictEqual(sanitizeFileName('   '), null);
  });

  await t.test('200-char overflow', () => {
    const longName = 'a'.repeat(200) + '.txt';
    const sanitized = sanitizeFileName(longName);
    assert.strictEqual(sanitized.length, 100);
    assert.strictEqual(sanitized.endsWith('.txt'), true);
    assert.strictEqual(sanitized, 'a'.repeat(96) + '.txt');
  });

  await t.test('200-char overflow without extension', () => {
    const longName = 'a'.repeat(200);
    const sanitized = sanitizeFileName(longName);
    assert.strictEqual(sanitized.length, 100);
    assert.strictEqual(sanitized, 'a'.repeat(100));
  });

  await t.test('Windows reserved', () => {
    assert.strictEqual(sanitizeFileName('CON.txt'), null);
    assert.strictEqual(sanitizeFileName('PRN'), null);
    assert.strictEqual(sanitizeFileName('con'), null);
    assert.strictEqual(sanitizeFileName('COM1.tar.gz'), null);
  });

  await t.test('Mixed Unicode', () => {
    assert.strictEqual(sanitizeFileName('báo cáo.pdf'), 'b_o_c_o.pdf');
  });

  await t.test('Leading dot', () => {
    assert.strictEqual(sanitizeFileName('.hidden'), 'hidden');
  });
});