# Migration từ Teleport sang Remotebot

Remotebot là fork từ `thith/teleport`, được tùy biến cho workflow riêng của `vuminhtin`.

## Đổi đường dẫn

Nếu cấu hình agent cũ đang trỏ tới `../teleport`, hãy đổi sang:

```text
../remotebot
```

Các lệnh chính:

```bash
node ../remotebot/scripts/send-telegram.mjs "message"
node ../remotebot/scripts/tele-listen.mjs --filter-reply-to <IDS> --offset-file ../remotebot/scripts/tmp/tele-reply/<offset-file>
```

## Điểm mới chính

- Tài liệu tiếng Việt.
- Kết nối mặc định cho `@tinvu_hcm`.
- Command policy và audit.
- Smart alerts với `--severity`.
- Log tail bằng `--log-tail`.
- Inline buttons bằng `--quick-actions` và `--button`.
- Job progress bằng `scripts/job-progress.mjs`.
- Remote steward chỉ đọc bằng `scripts/system-health.mjs`.

## Việc cần làm sau khi đổi

1. Copy `.env.example` thành `.env` nếu chưa có.
2. Điền `REPORT_BOT_TOKEN`.
3. Nhắn `/start` cho bot.
4. Chạy:

```bash
node scripts/find-telegram-chat.mjs --username tinvu_hcm --write-env
```

5. Gửi thử:

```bash
node scripts/send-telegram.mjs --severity success "remotebot ready"
```
