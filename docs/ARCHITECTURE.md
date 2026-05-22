# Kiến trúc Remotebot

Remotebot gồm ba lớp chính: Telegram transport, policy/command layer, và các tiện ích vận hành chỉ đọc.

## Luồng gửi báo cáo

1. Agent gọi `scripts/send-telegram.mjs`.
2. Script đọc `.env`, tự thêm project code, escape MarkdownV2 nếu cần.
3. Script gửi qua Telegram Bot API.
4. Nếu có `--quick-actions` hoặc `--button`, script gắn inline keyboard.
5. Message ID được ghi vào `scripts/tmp/tele-reply/sent-registry.jsonl`.

## Luồng nhận chỉ dẫn

1. Agent chạy `scripts/tele-listen.mjs` với `--filter-reply-to <IDS>`.
2. Listener dùng cache cục bộ để tránh nhiều listener giẫm offset Telegram của nhau.
3. Reply text và `callback_query` được chuyển thành prompt JSON.
4. Agent chạy `scripts/inspect-command.mjs --prompt-file <path>`.
5. Policy quyết định `allow`, `deny` hoặc `needs_pin`.
6. Agent chỉ hành động nếu command được phép.

## Các file trạng thái

Các file runtime nằm dưới `scripts/tmp/` và không commit:

- `tele-reply/sent-registry.jsonl`: message bot đã gửi.
- `tele-reply/updates-cache.jsonl`: cache update Telegram.
- `tele-reply/processed-callbacks.jsonl`: callback button đã xử lý.
- `remotebot-audit.jsonl`: audit command.
- `remotebot-jobs.json`: job ledger cho progress message.
- `screenshots/*.png`: ảnh chụp màn hình tùy chọn khi debug UI/browser.
- `<jobId>.log`: log của lệnh được bọc bởi `run-with-progress`.

## Module chính

- `scripts/send-telegram.mjs`: gửi tin, file, severity, log tail, inline buttons.
- `scripts/tele-listen.mjs`: nghe reply/callback và ghi prompt JSON.
- `scripts/inspect-command.mjs`: parse command và áp policy.
- `scripts/job-progress.mjs`: gửi/edit progress message theo job.
- `scripts/run-with-progress.mjs`: bọc lệnh dài, gửi mốc queued/running/done/failed và ghi log.
- `scripts/capture-screenshot.mjs`: chụp màn hình Windows desktop và gửi như artifact khi cần.
- `scripts/system-health.mjs`: các kiểm tra chỉ đọc cho máy/VPS.
- `scripts/remote-steward.mjs`: service log và restart service đã whitelist, mặc định dry-run.
- `src/commands/parse.mjs`: nhận diện command intent.
- `src/security/policy.mjs`: whitelist, risk level, dangerous patterns, PIN.
- `src/audit/log.mjs`: ghi audit JSONL.
- `src/jobs/store.mjs`: đọc/ghi job ledger.

## Quyết định thiết kế

- Telegram-first, chưa làm multi-messenger.
- Không nhận raw shell command theo mặc định.
- Zero-deps, dùng Node built-ins.
- Ưu tiên một message có thể edit thay vì spam nhiều message.
- Remote steward mode chỉ bật lệnh ghi khi service đã whitelist và policy/PIN cho phép.
- Screenshot là artifact tùy chọn, không thay thế log tail cho lỗi terminal.
