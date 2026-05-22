# Changelog

## 0.2.0 - 2026-05-22

Feature-complete Remotebot release after the 0.1.0 foundation.

- PIN verification through `pinSha256` or `REMOTEBOT_PIN`.
- `run-with-progress` helper for long commands with queued/running/done/failed updates.
- Optional Windows screenshot capture and Telegram artifact sending for UI/browser debugging.
- `remote-steward` helper for service logs and whitelisted service restart with PIN and dry-run default.
- Repeatable local release packaging through `npm run package:release`.

## 0.1.0 - 2026-05-22

Initial Remotebot release.

- Forked from `thith/teleport` and customized for `vuminhtin`.
- Vietnamese-first documentation.
- Telegram setup helper for `@tinvu_hcm`.
- Global Codex install script using absolute path `F:\projects\remotebot`.
- Short triggers: `tele`, `gửi tele`, `📨`.
- Conversation-local `tele mode on/off`.
- Safe command parser, whitelist policy, dangerous pattern blocking, and JSONL audit.
- Smart alerts: severity, silent success/info, fatal mention, log tail, artifacts.
- Inline buttons with action id, job id, nonce, expiry, callback listener, and duplicate protection.
- Job progress messages using Telegram `editMessageText` with local job ledger and throttling.
- Read-only steward commands: `health`, `disk`, `memory`, `processes`, `last_agent_status`.
- Security, architecture, migration, and release checklist docs.
