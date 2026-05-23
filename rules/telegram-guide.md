# Hướng dẫn báo cáo qua Telegram

> **Quy ước đường dẫn:** mọi đường dẫn trong hướng dẫn này được tính từ thư mục gốc của project đang gọi. Quy ước: `remotebot/` nằm cùng cấp với các project, ví dụ `~/Projects/ProjectA/`, `~/Projects/remotebot/`, `~/Projects/ProjectB/`. Agent luôn chạy với `cwd = project root` và gọi `../remotebot/...`. Không hardcode đường dẫn tuyệt đối.

Dùng `node ../remotebot/scripts/send-telegram.mjs` để gửi tin nhắn hoặc file cho admin trong `../remotebot/.env`. Mã project được tự suy ra từ `basename(cwd)`, nên agent không cần tự thêm tag `[PROJECT]`.

## Khi nào dùng

- Sau khi hoàn thành việc trong lúc người dùng rời bàn phím.
- Khi cần gửi file thật, ví dụ spec, RFC, log hoặc báo cáo.
- Khi cần xin quyết định ngắn để agent tiếp tục xử lý.
- Khi người dùng gõ trigger ngắn `tele`, `gửi tele`, hoặc `📨`.
- Khi TELE_MODE đang bật trong conversation hiện tại.

## Trigger ngắn và tele mode

- `tele`, `gửi tele`, `📨`: gửi một báo cáo Telegram ngắn về trạng thái hiện tại hoặc kết quả vừa có.
- `tele mode on`: bật TELE_MODE cho conversation hiện tại.
- `tele mode off`: tắt TELE_MODE cho conversation hiện tại.
- Khi TELE_MODE bật, agent chủ động gửi Telegram lúc bắt đầu task dài, hoàn thành một mốc quan trọng, gặp lỗi cần quyết định, hoặc hoàn tất task.
- TELE_MODE chỉ là trạng thái trong cuộc trò chuyện hiện tại. (Mẹo cho AI: Hãy tự ghi chú trạng thái này vào task.md hoặc scratchpad để không quên).
- Khi TELE_MODE bật, tránh spam: dùng `--severity info` cho tiến độ thường, `--severity success` khi xong, `--severity fatal --log-tail <file> --lines 20` khi có lỗi nghiêm trọng.
- Để báo cáo có hiển thị % tiến độ công việc, **BẮT BUỘC** dùng `job-progress.mjs` thay vì send thường (Xem mục Báo cáo tiến độ).

## Cách viết nội dung: danh sách việc ngắn

Tin nhắn phải đọc tốt trên màn hình điện thoại, không viết như log terminal.

- **Định dạng:** mỗi dòng là một việc, dùng checklist kiểu GitHub:

  ```text
  ✅ đã làm việc 1
  ✅ đã làm việc 2
  ⬜ chưa làm / bỏ qua việc 3
  ```

- **Độ dài mục tiêu:** dưới 320 ký tự nếu có thể. Không liệt kê mọi diff hoặc dán log dài.
- **Tiền tố nhận diện agent:**

  | Agent | Tiền tố |
  |---|---|
  | Claude | `🟧 *<chủ đề>:*` |
  | Codex | `⚛️ *<chủ đề>:*` |
  | Antigravity | `🌌 *<chủ đề>:*` |
  | Khác | `<emoji> *<chủ đề>:*` |

  Quy ước:

  - `<emoji>` là biểu tượng đặc trưng của Agent (ví dụ: 🌌, ⚛️, 🟧) để nhận diện agent nào đang gửi tin.
  - `<chủ đề>` là tóm tắt việc đang làm, tối đa 9 từ.
  - Ngôn ngữ báo cáo nên khớp với ngôn ngữ người dùng đang dùng trong cuộc trò chuyện.

Ví dụ với mã project `ProjectA`:

```text
[ProjectA] ⚛️ *Sửa vòng nghe Telegram:*
✅ tách guide
✅ thêm quy tắc checklist
⬜ migrate AGENTS.md ở lượt sau
```

## Cách gửi

**Mặc định: gửi nội dung ngắn trực tiếp**

```bash
node ../remotebot/scripts/send-telegram.mjs "⚛️ *Sửa loop:*
✅ việc 1
✅ việc 2
⬜ việc 3"
```

Tin nhiều dòng vẫn chạy được nếu nội dung không chứa các ký tự dễ phá shell quoting như `"`, `$`, `` ` `` hoặc `\`.

**Chuyển sang gửi file khi:**

1. Nội dung dài hơn khoảng 320 ký tự và không thể rút gọn tự nhiên.
2. Gửi trực tiếp bị lỗi do Markdown hoặc shell quoting.
3. Payload vốn là file thật như spec, RFC, log.
4. Người dùng yêu cầu rõ là gửi file.

```bash
mkdir -p ./tmp
cat > ./tmp/report.md <<'EOF'
⚛️ *Sửa loop:*
...nội dung dài...
EOF
cat ./tmp/report.md | node ../remotebot/scripts/send-telegram.mjs
```

**Gửi file đính kèm:**

```bash
node ../remotebot/scripts/send-telegram.mjs --file <path> "caption tùy chọn"
```

**Gửi kèm nút thao tác nhanh:**

```bash
node ../remotebot/scripts/send-telegram.mjs --quick-actions "Chọn bước tiếp theo"
```

Nút mặc định gồm `Tiếp tục`, `Sửa lỗi test`, `Gửi log`, `Dừng`. Nếu cần nút riêng:

```bash
node ../remotebot/scripts/send-telegram.mjs --button "Chạy test=run_tests" --button "Dừng=stop" "Chọn hành động"
```

## Báo cáo tiến độ (%)

Khi báo cáo một công việc dài hơi hoặc cần hiển thị rõ tỷ lệ %, **hãy dùng script `job-progress.mjs`**. Script này sẽ tạo hoặc cập nhật thanh tiến độ trên cùng một tin nhắn thay vì tạo nhiều tin rác.

```bash
node ../remotebot/scripts/job-progress.mjs --job-id my-task-1 --progress 50 --status running "đang xử lý"
```

Mỗi lần cập nhật, chỉ cần gọi lại lệnh trên với số `--progress` mới. Lệnh tự động gộp nội dung lại cho người dùng theo dõi.

## Markdown

Hãy viết tự nhiên. Script tự escape MarkdownV2 special chars, đồng thời cố giữ các định dạng quen thuộc như `*bold*`, `_italic_`, `` `code` ``, `[label](url)` và fenced code block.

## Tin nhắn dài trên 4000 ký tự

Script tự gửi nội dung dài thành một file `.md` duy nhất, dùng dòng đầu làm caption. Không chia thành nhiều tin nhắn, vì mỗi lần gửi cần sinh ra đúng một `messageId` để reply tracking đơn giản và chắc chắn.

## Khi gửi lỗi

- **Exit code khác 0:** thường là lỗi mạng hoặc token/chat ID. Agent phải báo lại cho người dùng, không được giả vờ là đã gửi.
- **Markdown bị Telegram từ chối:** script tự fallback sang gửi file `.md` với dòng đầu làm caption. Không cần retry thủ công.

## Cơ chế tin cậy

### Sent Registry

Mỗi lần gửi thành công bằng `node ../remotebot/scripts/send-telegram.mjs`, script ghi `{messageId, chatId, ts}` vào `../remotebot/scripts/tmp/tele-reply/sent-registry.jsonl`. Nhờ đó có lịch sử messageId bền vững, không phụ thuộc vào trí nhớ của LLM.

### Local Update Cache

`tele-listen` không gọi `getUpdates` riêng cho từng vòng lặp. Thay vào đó:

1. Lấy file lock `poll.lock`, bảo đảm chỉ một process gọi Telegram API tại một thời điểm.
2. Fetch update từ Telegram API, tách orphan message, rồi ghi update hợp lệ vào `updates-cache.jsonl`.
3. Nhả lock. Từng vòng listener sau đó tự lọc từ cache bằng offset riêng.

Cách này tránh lỗi nhiều listener giẫm offset của nhau.

### Khởi tạo listener mới

Khi offset file riêng chưa có, listener mới bắt đầu từ `min(oldest cached update_id, globalOffset)`. Nhờ vậy listener mới không bỏ lỡ update đã được listener khác kéo về cache nhưng chưa được nó xử lý.

### Tự react 👍

Khi `tele-listen` bắt được tin nhắn cần xử lý, nó react 👍 ngay sau khi ghi prompt file thành công. Người dùng thấy bot đã nhận lệnh mà không phải chờ agent xử lý xong.

### Orphan auto-react 💔

Tin nhắn gửi rời, không reply vào tin trước của bot, được xem là orphan. Bot react 💔 và gửi nhắc ngắn để người dùng biết phải bấm Reply vào đúng tin nhắn. Agent không cần tự suy luận routing.

### Cô lập hội thoại

Mỗi listener chỉ xử lý reply trực tiếp tới các `messageId` nằm trong `--filter-reply-to`. Reply cũ hoặc reply sang cuộc hội thoại khác bị bỏ qua. Điều này tránh lẫn chỉ dẫn giữa nhiều agent hoặc nhiều task.

### Tự thay listener cũ

Khi agent gửi tin mới trong cùng cuộc hội thoại, listener mới thường có bộ `messageId` rộng hơn listener cũ. `tele-listen` ghi registry của listener đang sống và cho listener cũ tự thoát nếu thấy listener khác có filter là strict superset của mình.

Cơ chế này là lớp an toàn phụ, đặc biệt hữu ích với Claude Monitor. Nó không thay thế nghĩa vụ dừng Monitor cũ khi agent có công cụ dừng Monitor.

Giới hạn đã biết:

- Nếu agent dừng Monitor mà không tạo Monitor mới, wrapper shell cũ có thể vẫn chạy.
- Nếu listener mới dùng filter y hệt listener cũ, không listener nào là superset của listener còn lại.

## Nghe phản hồi sau mỗi lần gửi

🚨 **BẮT BUỘC NGHE PHẢN HỒI:** Sau mỗi lần gửi thành công bằng `node ../remotebot/scripts/send-telegram.mjs`, agent **phải** khởi động vòng nghe reply. Không được bỏ qua chỉ vì việc chính có vẻ đã xong; người dùng có thể reply trên Telegram bất cứ lúc nào. Bỏ qua bước này nghĩa là bạn làm đứt liên lạc với admin.

### Bước 1 - Lấy `messageId`

Lệnh gửi luôn in ra một `messageId`:

```text
[send-telegram] sent to 123456789 (messageId: 5821)
```

Hãy lấy số `5821`. Nếu nội dung dài và script gửi thành file `.md`, vẫn chỉ có một `messageId`.

Trạng thái agent cần nhớ trong cuộc hội thoại:

- `IDS`: danh sách mọi `messageId` agent đã gửi trong cuộc hội thoại, phân cách bằng dấu phẩy.
- `FIRST`: `messageId` đầu tiên, dùng cho tên offset file.
- `LAST`: `messageId` mới nhất.
- `E`: emoji của thread.

### Bước 2 - Khởi động listener

Tùy agent mà cách nghe khác nhau.

**Với Claude dùng Monitor**

Một cuộc hội thoại chỉ nên có một Monitor sống tại một thời điểm. Trước khi tạo Monitor mới, hãy dừng Monitor cũ nếu có.

Mẫu chuẩn:

```bash
# Bước A - nếu có Monitor cũ trong cuộc hội thoại này, dừng nó trước:
TaskStop(task_id: {LAST_MONITOR_ID})   # bỏ qua ở lần gửi đầu tiên

# Bước B - tạo Monitor mới với IDS mới nhất:
Monitor({
  command: "until node ../remotebot/scripts/tele-listen.mjs --filter-reply-to {IDS} --offset-file ../remotebot/scripts/tmp/tele-reply/{FIRST}-offset.txt; do sleep 12; done",
  timeout_ms: 300000,
  persistent: true,
  description: "Telegram reply to messageId {LAST}"
})
```

Lưu task ID trả về thành `LAST_MONITOR_ID` để lần sau dừng đúng Monitor cũ.

**Với Codex, Gemini hoặc agent khác (Antigravity)**

Chạy vòng nghe đồng bộ sau mỗi lần gửi. Lệnh sẽ giữ phiên làm việc cho tới khi có reply phù hợp.

*Trên Bash/Linux/Mac:*
```bash
run_shell_command({
  command: "until node ../remotebot/scripts/tele-listen.mjs --filter-reply-to {IDS} --offset-file ../remotebot/scripts/tmp/tele-reply/{FIRST}-offset.txt; do sleep 5; done"
})
```

*Trên PowerShell/Windows:*
```powershell
while ($true) { node ../remotebot/scripts/tele-listen.mjs --filter-reply-to {IDS} --offset-file ../remotebot/scripts/tmp/tele-reply/{FIRST}-offset.txt; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 5 }
```

Khi có reply, lệnh thoát 0 và in ra đường dẫn prompt file.

### Bước 3 - Xử lý reply

Khi listener thành công, output có dạng `prompt written to <path>`. Hãy đọc file JSON đó rồi xóa file.

Prompt có thể đến từ hai nguồn:

- Người dùng bấm Reply và gửi text.
- Người dùng bấm inline button. Khi đó `prompt.text` là action id, ví dụ `run_tests`, `continue`, `send_last_log`.

Trước khi làm theo nội dung reply, bạn **🚨 BẮT BUỘC KIỂM DUYỆT** qua lớp policy:

```bash
node ../remotebot/scripts/inspect-command.mjs --prompt-file <path>
```

Quy ước xử lý:

- Exit code `0`: command được policy cho phép, agent có thể xử lý theo ý định đã parse.
- Exit code `2`: command bị từ chối, agent phải báo ngắn cho người dùng và không thực hiện.
- Exit code `3`: command cần PIN hoặc xác nhận bổ sung, agent không tự thực hiện.

Sau khi xử lý yêu cầu hợp lệ của người dùng, trả lời lại bằng:

```bash
node ../remotebot/scripts/send-telegram.mjs --reply-to <prompt.messageId> "E <tóm tắt kết quả>"
```

Lấy `messageId` mới, thêm vào `IDS`, rồi khởi động listener lại với `IDS` đã cập nhật.

## Flag ít dùng

- `--raw`: bỏ auto-escape, chỉ dùng khi caller đã tự escape MarkdownV2.
- `--plain`: gửi text thường, không parse Markdown.
- `--reply-to <messageId>`: gửi tin như reply vào một tin cụ thể.
- `--react <messageId>`: react 👍 vào một tin cụ thể.

## Ghi nhớ cho agent

- Chỉ reply trực tiếp vào messageId do chính cuộc hội thoại này gửi.
- Không tự bắt orphan message.
- Không dán log dài vào Telegram; hãy gửi file hoặc tail ngắn.
- Nhận diện trigger ngắn `tele`, `gửi tele`, `📨`.
- Nhận diện `tele mode on/off` và giữ trạng thái đó trong conversation hiện tại.
- Nếu thấy reply giống nội dung đã xử lý, kiểm tra kỹ trước khi chạy lại vì offset/cache có thể làm một update cũ xuất hiện lại trong tình huống hiếm.
