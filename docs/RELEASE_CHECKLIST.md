# Release checklist

## Trước khi release

- Chạy `npm.cmd test` trên Windows.
- Kiểm tra `.env` không nằm trong Git status.
- Kiểm tra `scripts/tmp/` không có file runtime bị commit.
- Nếu dùng Codex global, chạy `node scripts/install-codex-global.mjs --apply` và kiểm tra `%USERPROFILE%\.codex\AGENTS.md`.
- Gửi thử Telegram:
  - `node scripts/send-telegram.mjs --severity success "release smoke test"`
  - `node scripts/send-telegram.mjs --quick-actions "button smoke test"`
- Bấm thử một inline button và xác nhận listener tạo prompt.
- Chạy thử:
  - `node scripts/system-health.mjs`
  - `node scripts/system-health.mjs --section disk`
  - `node scripts/system-health.mjs --section memory`
  - `node scripts/system-health.mjs --section processes --limit 3`
  - `node scripts/system-health.mjs --section last_agent_status`
  - `node scripts/run-with-progress.mjs --job-id release-test --no-telegram -- npm.cmd test`
  - `node scripts/remote-steward.mjs --action health`
- Nếu cần kiểm thử screenshot trên Windows desktop, chạy `node scripts/capture-screenshot.mjs --out scripts/tmp/screenshots/release-smoke.png`.
- Nếu bật restart service, kiểm thử dry-run trước: `node scripts/remote-steward.mjs --action restart_service --service <name> --pin <PIN>`.

## Kiểm tra tài liệu

- README mô tả đúng đường dẫn `../remotebot`.
- `SECURITY.md` nói rõ không nhận raw shell command.
- `docs/ARCHITECTURE.md` khớp với script hiện có.
- `docs/REMOTEBOT_COMPLETION_PLAN.md` phản ánh đúng trạng thái đã làm.

## Sau khi release

- Tag version.
- Ghi ngắn các thay đổi chính.
- Nếu token từng dùng trong test bị lộ ở bất cứ đâu, revoke token trước khi công bố.
