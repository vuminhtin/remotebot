# Kế hoạch hoàn thiện Remotebot

## 1. Định vị sản phẩm

Remotebot nên được định vị là **cầu nối giám sát từ xa cho AI coding agent**: agent báo cáo ngắn, xin quyết định khi cần, và nhận chỉ dẫn nhanh khi chủ máy không ngồi trước bàn phím.

Không nên biến Remotebot thành shell từ xa toàn quyền. Nếu người dùng có thể gõ bất kỳ lệnh nào từ điện thoại, rủi ro sẽ tăng nhanh hơn giá trị. Lợi thế đúng của dự án là "báo cáo ngắn - điều khiển có kiểm soát", không phải phản chiếu toàn bộ terminal.

Chính kiến:

- Ưu tiên Telegram vì code hiện tại đã bám vào Telegram Bot API.
- Không nên gọi chung là Messenger trong tài liệu kỹ thuật, vì dễ làm lệch kỳ vọng.
- Mọi lệnh từ điện thoại nên đi qua hợp đồng lệnh rõ ràng: bot chỉ nhận các ý định đã định nghĩa, không nhận lệnh shell thô.
- Bảo mật và audit phải là lõi sản phẩm, không phải phần trang trí làm sau.

## 2. Trạng thái hiện tại

Repo hiện có:

- `scripts/send-telegram.mjs`: gửi tin nhắn/file, escape MarkdownV2, reply-to, reaction, ghi registry messageId.
- `scripts/tele-listen.mjs`: nghe reply, lọc admin, cache update, tránh listener giẫm offset, react orphan, tự thay listener cũ.
- `rules/telegram-guide.md`: hướng dẫn agent gửi báo cáo và nghe reply.
- README và guide đã đồng bộ sang thương hiệu Remotebot và đường dẫn `../remotebot`.

Nên xử lý sớm:

- Giữ brand và path convention thống nhất theo `remotebot`.
- Tách logic "vận chuyển qua Telegram" khỏi logic "luồng làm việc của agent" để sau này thêm nút thao tác nhanh/progress mà không làm rối script hiện tại.

## 3. Nguyên tắc sản phẩm

1. Ngắn trước: điện thoại chỉ nhận tóm tắt, lỗi đáng chú ý, và nút quyết định.
2. An toàn từ thiết kế: mặc định không có đường raw command.
3. Một task, một control thread: mỗi job có messageId, trạng thái, log rút gọn, và lịch sử quyết định.
4. Idempotent action: bấm lại nút cũ không được chạy lại việc nguy hiểm.
5. Ghi audit đầy đủ: lệnh nào được gửi từ xa, ai gửi, lúc nào, scope nào, kết quả ra sao.

## 4. Lộ trình hoàn thiện

### Bước mở đầu - Kết nối Telegram của @tinvu_hcm

Mục tiêu: Remotebot gửi được tin nhắn thật tới tài khoản Telegram `@tinvu_hcm`, sau đó dùng chính Telegram làm kênh điều khiển các bước phát triển tiếp theo.

- [x] Thêm `TELEGRAM_ADMIN_USERNAME=tinvu_hcm` vào `.env.example`.
- [x] Thêm `scripts/find-telegram-chat.mjs` để dò `chat_id` từ username sau khi người dùng nhắn `/start` cho bot.
- [x] Người dùng tạo bot bằng BotFather và điền `REPORT_BOT_TOKEN` vào `.env`.
- [x] Người dùng dùng tài khoản `@tinvu_hcm` nhắn `/start` cho bot.
- [x] Chạy `node scripts/find-telegram-chat.mjs --username tinvu_hcm --write-env`.
- [x] Gửi thử `node scripts/send-telegram.mjs "hello from remotebot"`.
- [x] Sau khi gửi thành công, bắt đầu dùng Telegram để nhận báo cáo và gửi chỉ dẫn ngắn.

Hoàn thành khi:

- [x] `.env` có `REPORT_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID`.
- [x] Tin nhắn test tới đúng Telegram của `@tinvu_hcm`.
- [x] Agent có thể gửi báo cáo và nghe reply theo `rules/telegram-guide.md`.

### Giai đoạn 0 - Rename và nền kiểm thử

Mục tiêu: repo đúng tên mới và có kiểm thử tối thiểu.

- [x] Đổi `Teleport`, `teleport`, `../teleport` thành `Remotebot`, `remotebot`, `../remotebot`.
- [x] Cập nhật README quick start theo fork `vuminhtin/remotebot`.
- [x] Thêm `package.json` với script test cơ bản.
- [x] Thêm unit test cho:
  - parse `.env`.
  - parse args.
  - escape MarkdownV2.
  - lọc reply theo messageId.
  - phân loại orphan message.
- [x] Bảo đảm `scripts/tmp/` nằm trong `.gitignore`.

Hoàn thành khi:

- Người mới làm theo README và gửi thử được tin nhắn.
- `node --test` pass.
- Không còn `teleport` trong tài liệu vận hành, trừ phần migration/lịch sử nếu cần giữ.

### Giai đoạn 1 - Lớp lệnh an toàn

Mục tiêu: có thể nhận lệnh từ điện thoại nhưng không biến thành shell từ xa toàn quyền.

- [x] Tạo command schema riêng, ví dụ:
  - `continue`
  - `fix_failed_tests`
  - `stop`
  - `send_last_log`
  - `run_tests`
  - `summarize_status`
- [x] Tạo policy file, ví dụ `remotebot.config.json`:
  - admin chat IDs.
  - lệnh được phép.
  - lệnh nguy hiểm.
  - lệnh cần PIN hoặc xác nhận tại máy.
  - cấu hình riêng theo project.
- [x] Mặc định chỉ cho lệnh đã whitelist: đọc trạng thái, gửi log, tiếp tục task, chạy test, sửa lỗi test theo agent.
- [x] Mặc định chặn: xóa thư mục, rewrite git history, sửa file hệ thống, shutdown/reboot, chạy lệnh thô.
- [x] Ghi audit JSONL mỗi lần nhận và xử lý command qua `scripts/inspect-command.mjs`.
- [x] Tích hợp sâu hơn để agent tự map command được cho phép sang hành động nội bộ nhất quán qua `inspect-command`, action id và guide.

Hoàn thành khi:

- [x] Reply text được parse thành command intent.
- [x] Command không nằm trong whitelist bị từ chối kèm giải thích ngắn.
- [x] Mọi command kiểm tra qua `inspect-command` có audit entry.

### Giai đoạn 2 - Thông báo thông minh

Mục tiêu: bot báo đúng mức nghiêm trọng và không spam.

- [x] Thêm severity vào send API:
  - `info`: gửi im lặng.
  - `success`: gửi im lặng, rất ngắn.
  - `warning`: gửi bình thường.
  - `fatal`: gửi có âm thanh, tag/mention nếu group cho phép.
  - `approval_required`: nói rõ cần quyết định.
- [x] Hỗ trợ `disable_notification` của Telegram cho `success` và `info`.
- [x] Thêm `--log-tail <file> --lines 20` để gửi 20 dòng lỗi cuối.
- [x] Thêm `--artifact <path>` để đính kèm log/report.
- [x] Screenshot là artifact tùy chọn cho task UI/browser qua `scripts/capture-screenshot.mjs`. Với lỗi terminal, log tail thường hữu ích hơn ảnh chụp màn hình.

Hoàn thành khi:

- [x] Agent có thể gửi "success silent" và "fatal loud" bằng cùng một script.
- [x] Failed test report tự động kèm log tail ngắn.
- [x] Tin nhắn vẫn đọc tốt trên điện thoại sau khi kiểm thử thực tế qua Telegram.

### Giai đoạn 3 - Nút thao tác nhanh / inline buttons

Mục tiêu: người dùng bấm nút thay vì gõ text.

- [x] Mở rộng send script để hỗ trợ Telegram inline keyboard:
  - `[Tiếp tục]`
  - `[Sửa lỗi test]`
  - `[Gửi log]`
  - `[Dừng]`
- [x] Thêm listener cho `callback_query`, không chỉ `message.text`.
- Mỗi button tạo callback data ngắn, có:
  - [x] job id.
  - [x] action id.
  - [x] nonce chống replay.
  - [x] hạn dùng.
- [x] Khi bấm nút, bot ack ngay bằng `answerCallbackQuery`.
- [x] Callback cũ hoặc đã xử lý rồi phải bị từ chối an toàn ở mức `chatId:messageId:action`.

Hoàn thành khi:

- [x] Một report có 3-4 nút mẫu.
- [x] Bấm nút tạo prompt JSON cho agent như reply text.
- [x] Bấm lại nút cũ không chạy lại command.

### Giai đoạn 4 - Trạng thái job và thanh tiến độ

Mục tiêu: task dài chỉ cập nhật một tin nhắn, giúp hộp thoại gọn.

- [x] Tạo job ledger local:
  - `jobId`
  - project
  - agent
  - status
  - latestMessageId
  - progress percent
  - startedAt/updatedAt
  - tóm tắt lỗi mới nhất
- [x] Thêm `editMessageText` để cập nhật lại chính tin nhắn cũ.
- [x] Thêm template progress:
  - `0% queued`
  - `20% scanning`
  - `40% fixing`
  - `80% testing`
  - `100% xong`
- [x] Chỉ cập nhật khi có thay đổi đáng kể hoặc mỗi 20%, tránh spam.
- [x] Thêm `scripts/run-with-progress.mjs` để bọc một command dài và tự gửi queued/running/done/failed.

Hoàn thành khi:

- [x] Task dài cập nhật một message duy nhất.
- [x] Nếu edit fail, fallback sang gửi message mới và cập nhật ledger.

### Giai đoạn 5 - Chế độ quản lý máy từ xa

Mục tiêu: giám sát máy/VPS từ xa ở mức an toàn.

- Tách thành module riêng, không bật mặc định.
- Lệnh rủi ro thấp:
  - [x] `health`
  - [x] `disk`
  - [x] `memory`
  - [x] `processes`
  - [x] `last_agent_status`
- Lệnh rủi ro vừa:
  - [x] restart service đã whitelist, mặc định dry-run, chỉ chạy thật với `--apply`.
  - [x] lấy log service đã whitelist.
- Lệnh rủi ro cao:
  - shutdown.
  - reboot.
  - kill process.
  - clean disk.
- [x] PIN xác minh được bằng `pinSha256` hoặc biến môi trường `REMOTEBOT_PIN`.
- Lệnh rủi ro cao phải cần PIN và/hoặc xác nhận tại máy. Không cho chạy mặc định chỉ bằng một nút trên Telegram.
- CPU temperature trên Windows/Linux/macOS cần adapter riêng; không hứa một API chung nếu chưa có dependency rõ.

Hoàn thành khi:

- [x] `health` chạy được tối thiểu trên Windows.
- [x] Các lệnh chỉ đọc `disk`, `memory`, `processes`, `last_agent_status` chạy được trên Windows.
- [x] High-risk command bị khóa nếu chưa bật profile riêng.
- [x] Có audit đầy đủ cho command đi qua `inspect-command`.

### Giai đoạn 6 - Tài liệu và đóng gói

Mục tiêu: người khác có thể cài, dùng, và hiểu giới hạn.

- README mới:
  - quick start.
  - mô hình bảo mật.
  - safe commands.
  - ví dụ.
  - troubleshooting.
- [x] Thêm `SECURITY.md`.
- [x] Thêm `docs/ARCHITECTURE.md`.
- [x] Thêm migration note từ Teleport sang Remotebot.
- [x] Thêm release checklist.

Hoàn thành khi:

- Người mới có thể setup trong 10-15 phút.
- [x] Security defaults được nói rõ trong tài liệu, không ẩn trong code.

## 5. Thứ tự ưu tiên thực tế

Ưu tiên đề xuất:

1. Rename + tests + README cleanup.
2. Safety command layer.
3. Thông báo thông minh.
4. Inline buttons.
5. Job progress/edit message.
6. Chế độ quản lý máy từ xa.

Lý do: nếu làm inline buttons hoặc remote server trước policy layer, bot sẽ rất hấp dẫn nhưng nguy hiểm. Nên xây "đường ray" trước, rồi mới gắn các nút bấm và tính năng quyền lực lên trên.

## 6. Hướng refactor kỹ thuật

Nên tách code theo các module:

- `src/telegram/client.mjs`: sendMessage, sendDocument, editMessage, reactions, callback ack.
- `src/config/env.mjs`: đọc env/config.
- `src/security/policy.mjs`: whitelist, risk level, PIN/confirm rules.
- `src/commands/parse.mjs`: text/callback -> command intent.
- `src/jobs/store.mjs`: JSONL/state ledger.
- `src/alerts/format.mjs`: severity, templates, log tail.
- `scripts/send-telegram.mjs`: CLI wrapper gọi module.
- `scripts/tele-listen.mjs`: CLI wrapper gọi module.

Chưa cần chuyển sang TypeScript ngay. Repo đang có lợi thế zero-deps và Node thuần; nên giữ lợi thế đó cho tới khi nhu cầu schema/test lớn hơn.

## 7. Quyết định

- Làm Telegram-first, chưa mở multi-messenger.
- Không hỗ trợ lệnh shell thô theo mặc định.
- PIN là lớp phụ, không thay thế whitelist/policy.
- Log tail hữu ích hơn screenshot cho lỗi terminal.
- Screenshot chỉ nên dùng cho UI/browser tasks.
- Chế độ quản lý máy từ xa là module tùy chọn, không nằm trong lõi báo cáo của agent.
