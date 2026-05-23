import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('1. Fetching latest from thith/teleport...');
try {
  execSync('git remote add upstream https://github.com/thith/teleport.git', { cwd: ROOT_DIR, stdio: 'ignore' });
} catch (e) {
  // Remote might already exist
}
execSync('git fetch upstream', { cwd: ROOT_DIR, stdio: 'inherit' });

console.log('\n2. Overwriting core files with upstream versions...');
// We checkout the specific files we want to upgrade to avoid merge conflicts with our custom files
const filesToUpdate = [
  'scripts/send-telegram.mjs',
  'scripts/tele-listen.mjs',
  'scripts/convo-*.mjs',
  'scripts/topics-*.mjs',
  'scripts/pending-*.mjs',
  'rules/telegram-guide.md',
];
try {
  execSync(`git checkout upstream/main -- ${filesToUpdate.join(' ')}`, { cwd: ROOT_DIR, stdio: 'inherit' });
} catch (e) {
  console.error('Failed to checkout files from upstream. Make sure upstream/main has these files.');
  process.exit(1);
}

console.log('\n3. Re-applying custom remotebot patches...');

// Patch 1: Windows setTimeout fix in tele-listen.mjs
const listenPath = path.join(ROOT_DIR, 'scripts', 'tele-listen.mjs');
if (fs.existsSync(listenPath)) {
  let content = fs.readFileSync(listenPath, 'utf8');
  // Replace direct process.exit(0) with setTimeout to avoid Windows libuv crash
  content = content.replace(/process\.exit\(0\);/g, 'setTimeout(() => process.exit(0), 10);');
  fs.writeFileSync(listenPath, content);
  console.log('   [+] Applied Windows setTimeout fix to tele-listen.mjs');
}

// Patch 2: Emoji rules in telegram-guide.md
const guidePath = path.join(ROOT_DIR, 'rules', 'telegram-guide.md');
if (fs.existsSync(guidePath)) {
  let content = fs.readFileSync(guidePath, 'utf8');
  
  // Replace <emoji> *<Agent> on <topic>:* with <emoji> *<chủ đề>:*
  content = content.replace(/<emoji> \*<Agent> on <topic>:\*/g, '<emoji> *<chủ đề>:*');
  content = content.replace(/<Agent> on <topic>/g, '<chủ đề>');
  
  // Replace Agent/Emoji bullet points
  const bulletRegex = /- \*\*Agent:\*\*.*?\n- \*\*Emoji:\*\*.*?\n/s;
  const newBullets = `- **Emoji:** MUST use the fixed emoji for your identity (e.g., 🌌 for Antigravity, ⚛️ for Codex, 🟧 for Claude) to quickly identify who is sending. Do NOT add the agent name.\n`;
  content = content.replace(bulletRegex, newBullets);

  // Replace examples
  content = content.replace(/🦊 \*Claude on loop fix:\*/g, '⚛️ *Sửa loop:*');

  fs.writeFileSync(guidePath, content);
  console.log('   [+] Applied Emoji Prefix formatting to telegram-guide.md');
}

// Patch 3: Update install-codex-global.mjs to use new listener format
const installPath = path.join(ROOT_DIR, 'scripts', 'install-codex-global.mjs');
if (fs.existsSync(installPath)) {
  let content = fs.readFileSync(installPath, 'utf8');
  
  // Replace the old while($true) listener loop with the new wait-once loop
  const oldListenerBlock = /while \(\$true\) \{ node "\$\{listenScript\}" --filter-reply-to <IDS>.*? \}/s;
  const newListenerBlock = `node "\${listenScript}" --wait-once --convo $CONVO_ID`;
  
  if (oldListenerBlock.test(content)) {
    content = content.replace(oldListenerBlock, newListenerBlock);
    
    // Also update the description text before it
    content = content.replace(
      /Trên PowerShell, hãy chạy lệnh vòng lặp sau ở background \(hoặc dùng công cụ schedule\):/,
      'Trên PowerShell, hãy chạy lệnh chờ sau ở background (hoặc dùng công cụ schedule). Bạn phải lấy được $CONVO_ID từ lệnh send trước đó:'
    );

    fs.writeFileSync(installPath, content);
    console.log('   [+] Updated listener command in install-codex-global.mjs to use --wait-once and --convo');
  } else {
    console.log('   [-] Listener command in install-codex-global.mjs was already updated or not found.');
  }
}

console.log('\n4. Committing updates...');
try {
  execSync('git add scripts/ rules/', { cwd: ROOT_DIR, stdio: 'inherit' });
  // Check if there are changes to commit
  const status = execSync('git status --porcelain', { cwd: ROOT_DIR }).toString();
  if (status.trim() !== '') {
    execSync('git commit -m "chore: refork and apply custom features"', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('\n✅ Refork & Update completed successfully!');
  } else {
    console.log('\n✅ Already up-to-date. No changes to commit.');
  }
} catch (e) {
  console.error('Error during commit:', e.message);
}
