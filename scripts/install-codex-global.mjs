#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_AGENTS_FILE = path.join(os.homedir(), '.codex', 'AGENTS.md');
const START = '<!-- REMOTEBOT GLOBAL CONFIG START -->';
const END = '<!-- REMOTEBOT GLOBAL CONFIG END -->';

export function buildCodexGlobalBlock(rootDir = ROOT_DIR) {
  const sendScript = path.join(rootDir, 'scripts', 'send-telegram.mjs');
  const listenScript = path.join(rootDir, 'scripts', 'tele-listen.mjs');
  const inspectScript = path.join(rootDir, 'scripts', 'inspect-command.mjs');
  const progressScript = path.join(rootDir, 'scripts', 'job-progress.mjs');
  const guideFile = path.join(rootDir, 'rules', 'telegram-guide.md');
  const offsetDir = path.join(rootDir, 'scripts', 'tmp', 'tele-reply');

  return `${START}
## Remotebot Telegram Reporting

Khi người dùng yêu cầu gửi báo cáo Telegram hoặc các biến thể như "gửi tele", "báo cáo qua tele", "tele cho tôi khi xong", "ping me on Telegram", "send via tele", "tele", "📨", bạn phải dùng Remotebot đã cấu hình sẵn trên máy này.

Cấu hình Telegram dùng chung nằm tại:

- Root: \`${rootDir}\`
- Guide: \`${guideFile}\`
- Send script: \`${sendScript}\`
- Listen script: \`${listenScript}\`
- Inspect command script: \`${inspectScript}\`
- Job progress script: \`${progressScript}\`
- PATH commands, nếu có: \`remotebot\`, \`tele\`, \`tg\`, \`telegram\`

Không được trả lời rằng workspace hiện tại không có Telegram token/chat ID. Token và chat ID đã được cấu hình tập trung trong \`${path.join(rootDir, '.env')}\`. Không yêu cầu người dùng nhập lại BOT_TOKEN hoặc CHAT_ID.

Cách gửi từ bất kỳ workspace nào:

\`\`\`powershell
remotebot --severity success "<nội dung ngắn>"
\`\`\`

Nếu command shim chưa có trong PATH thì dùng đường dẫn tuyệt đối:

\`\`\`powershell
node "${sendScript}" --severity success "<nội dung ngắn>"
\`\`\`

Trigger ngắn và tele mode:

- Nếu người dùng gõ riêng \`tele\`, \`gửi tele\`, \`📨\`, hoặc thêm các cụm này vào cuối yêu cầu, hãy gửi một báo cáo Telegram ngắn về trạng thái hiện tại hoặc kết quả vừa có.
- Nếu người dùng gõ \`tele mode on\`, bật TELE_MODE cho riêng conversation hiện tại (Mẹo cho AI: Hãy tự ghi chú trạng thái này vào task.md hoặc scratchpad để không quên). Từ đó, chủ động gửi Telegram khi bắt đầu task dài, xong một mốc quan trọng, gặp lỗi cần quyết định, hoặc hoàn tất task.
- Nếu người dùng gõ \`tele mode off\`, tắt TELE_MODE cho conversation hiện tại.
- TELE_MODE là trạng thái trong cuộc trò chuyện hiện tại, không ghi file và không giả định áp dụng cho conversation khác.
- Khi TELE_MODE đang bật, vẫn tránh spam: dùng \`--severity info\` cho tiến độ thường, \`--severity success\` khi xong, \`--severity fatal --log-tail <file> --lines 20\` khi lỗi nghiêm trọng.
- Để báo cáo có hiển thị % tiến độ công việc, **BẮT BUỘC** dùng \`${path.basename(progressScript)}\` thay vì send thường:
\`\`\`powershell
tele progress --job-id my-task-1 --progress 50 --status running "đang xử lý"
\`\`\`
Lệnh này tự động gộp/cập nhật % trên cùng một tin nhắn.

🚨 BẮT BUỘC NGHE PHẢN HỒI (TELE-LISTEN):
Ngay sau mỗi lần gửi tin nhắn thành công, bạn KHÔNG ĐƯỢC BỎ QUA bước này. Bạn PHẢI lập tức tạo một tác vụ nền (background task) để nghe phản hồi.
Trên PowerShell, hãy chạy lệnh chờ sau ở background (hoặc dùng công cụ schedule). Bạn phải lấy được $CONVO_ID từ lệnh send trước đó:
\`\`\`powershell
tele listen --wait-once --convo $CONVO_ID
\`\`\`

🚨 KIỂM DUYỆT LỆNH (INSPECT-COMMAND):
Khi có phản hồi (file prompt JSON được ghi ra), TRƯỚC KHI thực thi bất kỳ lệnh nào trong đó, bạn BẮT BUỘC phải kiểm tra policy:
\`\`\`powershell
tele inspect --prompt-file <prompt-file>
\`\`\`
Chỉ làm theo reply/callback nếu exit code là 0.

Quy tắc vận hành:

- Giữ báo cáo ngắn, theo checklist khi phù hợp.
- BẮT BUỘC luôn tự động thêm MỘT EMOJI ĐẶC TRƯNG của bạn vào dòng đầu tiên của mọi tin nhắn báo cáo theo đúng định dạng \`<emoji> *<chủ đề>:*\` (ví dụ: \`🌌 *Cập nhật cấu hình:*\`, \`⚛️ *Sửa lỗi:*\`, \`🟧 *Tái cấu trúc:*\`) để người dùng phân biệt. Hệ thống đã tự động gắn tên project nên bạn KHÔNG được tự thêm tên project nữa.
- Nhận diện trigger ngắn: \`tele\`, \`gửi tele\`, \`📨\`.
- Nhận diện mode: \`tele mode on\`, \`tele mode off\`.
- Nếu cần hướng dẫn chi tiết hơn, đọc \`${guideFile}\`, nhưng luôn dùng đường dẫn tuyệt đối ở trên thay vì giả định \`../remotebot\`.
${END}`;
}

export function upsertMarkedBlock(content, block) {
  const startIndex = content.indexOf(START);
  const endIndex = content.indexOf(END);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return `${content.slice(0, startIndex).trimEnd()}\n\n${block}\n\n${content.slice(endIndex + END.length).trimStart()}`;
  }
  const prefix = content.trimEnd();
  return `${prefix ? `${prefix}\n\n` : ''}${block}\n`;
}

export function parseArgs(argv) {
  const result = { apply: false, agentsFile: DEFAULT_AGENTS_FILE, rootDir: ROOT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }
    if (arg === '--agents-file') {
      const next = argv[i + 1];
      if (!next) throw new Error('--agents-file cần đường dẫn');
      result.agentsFile = next;
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
    throw new Error(`Flag không hỗ trợ: ${arg}`);
  }
  return result;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[install-codex-global] ${error.message}`);
    process.exit(1);
  }

  const block = buildCodexGlobalBlock(args.rootDir);
  const current = fs.existsSync(args.agentsFile) ? fs.readFileSync(args.agentsFile, 'utf8') : '';
  const next = upsertMarkedBlock(current, block);

  if (!args.apply) {
    console.log(next);
    console.error('[install-codex-global] Dry-run only. Thêm --apply để ghi file.');
    return;
  }

  fs.mkdirSync(path.dirname(args.agentsFile), { recursive: true });
  fs.writeFileSync(args.agentsFile, next, 'utf8');
  console.log(`[install-codex-global] Đã cập nhật ${args.agentsFile}`);
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isDirectRun) {
  main();
}
