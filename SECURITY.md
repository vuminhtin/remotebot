# Bảo mật Remotebot

Remotebot được thiết kế như cầu nối giám sát từ xa, không phải shell từ xa toàn quyền. Mặc định chỉ nên cho phép các lệnh đã định nghĩa rõ và có rủi ro thấp.

## Nguyên tắc mặc định

- Không nhận lệnh shell thô từ Telegram.
- Không chạy lệnh xóa dữ liệu, rewrite Git history, shutdown/reboot, kill process hoặc sửa file hệ thống nếu chưa có cơ chế xác nhận riêng.
- Mọi reply/callback từ Telegram phải đi qua `scripts/inspect-command.mjs` trước khi agent hành động.
- Mọi command đã inspect được ghi audit vào `scripts/tmp/remotebot-audit.jsonl`.
- `.env` chứa bot token và chat ID phải nằm ngoài Git.
- PIN chỉ là lớp phụ sau whitelist. Nếu command không nằm trong `allowedCommands`, nhập đúng PIN cũng không được chạy.

## Token và chat ID

- `REPORT_BOT_TOKEN` là secret. Không commit, không dán vào issue, log, screenshot hoặc tài liệu công khai.
- `TELEGRAM_ADMIN_CHAT_ID` giới hạn người có thể gửi lệnh cho bot.
- Nếu nghi token bị lộ, vào BotFather để revoke token và tạo token mới.

## Lệnh được phép

Các lệnh mặc định có rủi ro thấp:

- `continue`
- `stop`
- `send_last_log`
- `run_tests`
- `summarize_status`
- `health`
- `disk`
- `memory`
- `processes`
- `last_agent_status`

`fix_failed_tests` có rủi ro vừa vì có thể sửa file trong workspace. Agent vẫn phải tuân theo quyền của môi trường làm việc và không tự ý phá dữ liệu.

Các lệnh rủi ro vừa như `capture_screenshot`, `service_log`, `restart_service` chỉ nên bật khi có nhu cầu rõ. `restart_service` phải đi qua `stewardServices`, không nhận tên service tùy tiện từ Telegram.

## PIN

Có hai cách cấu hình PIN:

- Đặt `pinSha256` trong `remotebot.config.json`.
- Hoặc đặt biến môi trường `REMOTEBOT_PIN` và giữ `pinEnvVar` mặc định.

Ưu tiên `pinSha256` nếu config có thể bị người khác đọc. Không commit PIN thô vào repo.

## Lệnh bị chặn

Policy mặc định chặn các nội dung giống:

- `rm -rf`
- `Remove-Item ... -Recurse`
- `git reset --hard`
- `git clean -f`
- `shutdown`
- `reboot`
- `format`

Danh sách này nằm trong `remotebot.config.example.json`. Khi tạo config thật, hãy giữ mặc định bảo thủ trước rồi chỉ mở thêm khi có nhu cầu rõ.

## Inline buttons

Inline button chỉ truyền action id, ví dụ `continue` hoặc `run_tests`. Listener chặn bấm lại cùng một action trên cùng một message bằng khóa `chatId:messageId:action`.

Button mới có nonce và hạn dùng. Callback hết hạn hoặc đã xử lý rồi sẽ được ack nhưng không chạy lại hành động.

## Screenshot và service restart

Screenshot có thể chứa dữ liệu nhạy cảm trên màn hình. Chỉ bật khi bạn chấp nhận gửi ảnh đó qua Telegram.

Restart service là thao tác ghi. Remotebot chỉ hỗ trợ service đã whitelist bằng `windowsServiceName` hoặc `systemdUnit`, mặc định dry-run, và nên yêu cầu PIN.

## Báo cáo lỗi bảo mật

Nếu phát hiện hành vi có thể khiến bot chạy lệnh ngoài whitelist hoặc lộ token, hãy tạm dừng bot, revoke token trong BotFather, rồi sửa policy trước khi bật lại.
