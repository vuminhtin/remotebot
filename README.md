# Remotebot - cầu nối Telegram cho AI coding agent

Remotebot là công cụ nhỏ giúp các AI agent như Claude Code, Codex, Gemini, ... gửi báo cáo tiến độ ngắn qua Telegram và nhận lại chỉ dẫn ngắn khi bạn không ngồi trước máy.

Trọng tâm: báo cáo ngắn, trả lời nhanh. Đây không phải công cụ phản chiếu toàn bộ phiên làm việc.

Forked from `thith/teleport` and customized for `vuminhtin`'s own workflow.

## Bắt đầu nhanh

### 1. Clone cạnh các project của bạn

```bash
cd ~/Projects   # any parent folder works (e.g. ~/work, ~/code, D:\dev)
git clone https://github.com/thith/teleport.git
cd teleport
cp .env.example .env
```

Thư mục `remotebot/` nên nằm cùng cấp với các project cần dùng:

```
<your-parent-folder>/   # e.g. ~/Projects, ~/work, D:\dev
├── teleport/
├── ProjectA/
└── ProjectB/
```

The parent folder name doesn't matter — what matters is that `teleport/` is a **sibling** of your projects.

### 2. Get a bot token and your chat ID

- **Bot token:** open [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → follow prompts → copy the token.
- **Personal chat ID:** open [@userinfobot](https://t.me/userinfobot) → press *Start* → copy your numeric ID.
- **For a team group chat:** create a group, add your bot + people + [@RawDataBot](https://t.me/RawDataBot) → RawDataBot instantly prints the group ID (a negative number) → remove RawDataBot when done.
- **(Optional) Multiple projects → enable Topics:** if you'll run teleport from more than one project, enable forum topics so each project lands in its own thread. In [@BotFather](https://t.me/BotFather): `/mybots` → select your bot → `Bot Settings` → `Topics` → *Enable*. Teleport auto-creates one topic per project (named after the cwd basename) on first send. No further setup; if Topics stays off, sends still work and just share one thread.

### 3. Điền `.env`

```ini
REPORT_BOT_TOKEN=<bot token từ BotFather>
TELEGRAM_ADMIN_CHAT_ID=<chat ID cá nhân hoặc group ID>
TELEGRAM_ADMIN_USERNAME=tinvu_hcm
TELEGRAM_FATAL_MENTION=@tinvu_hcm
```

Nếu chưa biết `TELEGRAM_ADMIN_CHAT_ID`, hãy làm theo cách này:

1. Copy `.env.example` thành `.env`.
2. Điền `REPORT_BOT_TOKEN`.
3. Mở Telegram bằng tài khoản `@tinvu_hcm` và nhắn `/start` cho bot vừa tạo.
4. Chạy lệnh dò chat ID:

```bash
node scripts/find-telegram-chat.mjs --username tinvu_hcm --write-env
```

Nếu script tìm thấy đúng chat, nó sẽ tự ghi `TELEGRAM_ADMIN_CHAT_ID` vào `.env`.

Sau đó kiểm tra gửi thử:

Open Claude Code, Codex, or Gemini CLI **inside any project sibling of `teleport/`** (so `../teleport/` resolves correctly), then paste this prompt — the agent does the rest:

Nếu Telegram nhận được tin nhắn là cấu hình đã đúng. Nếu chưa nhận được, hãy sửa `.env` trước khi cấu hình agent.

### 4. Gắn vào AI agent một lần

Mở Claude Code, Codex hoặc Gemini CLI bên trong một project nằm dưới `~/Projects/`, để đường dẫn `../remotebot/` trỏ đúng. Sau đó dán prompt này cho agent:

> Hãy bật báo cáo Telegram toàn cục cho các AI agent của tôi theo `../remotebot/README.md`. Tìm phần "Đoạn cấu hình" trong README này và copy nguyên văn đoạn đó vào cả ba file cấu hình global để sau này chạy agent nào cũng dùng được: `~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md`. Nếu file nào chưa tồn tại thì tạo mới. Trên Windows, dùng đường dẫn tương đương trong `%USERPROFILE%`. Sau khi ghi xong, hãy gửi thử một tin "hello" bằng agent đang chạy hiện tại.

Prompt trên giúp cấu hình toàn cục cho nhiều agent. Sau đó, dù bạn chạy Claude, Codex hay Gemini trong project nào, agent đều biết cách gửi báo cáo qua Telegram.

Bạn cũng có thể tự cấu hình thủ công: copy đoạn trong phần "Đoạn cấu hình" vào file cấu hình global của từng agent. Nếu chỉ muốn bật cho một project cụ thể, hãy đặt đoạn này vào file cấu hình nội bộ của project đó như `CLAUDE.md`, `GEMINI.md` hoặc `AGENTS.md`.

#### Cài global riêng cho Codex trên máy này

Nếu muốn Codex dùng Remotebot từ mọi workspace, kể cả project không nằm cùng cấp với `remotebot/`, chạy:

```bash
node scripts/install-codex-global.mjs --apply
node scripts/install-windows-shims.mjs --apply
```

Script thứ nhất sẽ cập nhật `%USERPROFILE%\.codex\AGENTS.md` bằng đường dẫn tuyệt đối tới `F:\projects\remotebot`. Script thứ hai tạo các command `remotebot`, `tele`, `tg`, `telegram` trong `%APPDATA%\npm`, để phiên Codex khác có thể tìm thấy command global thay vì phải tự đoán đường dẫn script.

Sau đó các phiên Codex mới sẽ dùng chung token/chat ID trong `F:\projects\remotebot\.env`, không cần nhập lại. Nếu session Codex đã mở trước khi cài, hãy restart session đó để nhận `AGENTS.md` và PATH mới.

#### Agent khác

- **Antigravity:** dùng `~/.gemini/GEMINI.md`, nên đã được bao phủ nếu bạn làm theo bước trên.
- **Cursor:** không có file cấu hình trong home directory. Mở Cursor -> Settings -> Rules -> User Rules, rồi dán "Đoạn cấu hình" vào User Rules.
- **OpenCode hoặc agent khác:** mở agent rồi dán prompt ngắn này: *"Hãy tự cấu hình báo cáo Telegram cho bạn theo `../remotebot/README.md`. Tìm phần 'Đoạn cấu hình' và copy nguyên văn vào file cấu hình global của bạn."*

#### Đoạn cấu hình

Đây là đoạn agent cần copy vào file cấu hình. Thường bạn không cần sửa đoạn này.

````markdown
## Báo cáo Telegram

Khi người dùng yêu cầu gửi báo cáo Telegram, hoặc các biến thể như "send via tele", "tele me", "ping me when done", "gửi tele", "báo cáo qua tele", "tele cho tôi khi xong", "tele", "📨", bạn **phải** đọc `../remotebot/rules/telegram-guide.md` và làm theo. Tra tiền tố nhận diện của bạn trong bảng tiền tố của guide.

Scripts + guide are centralized at `../teleport/` (sibling of every project). Each project keeps no local copy. Do **NOT** rely on any invocation details from memory or from this config snippet; the guide is the single source of truth and may change as Teleport is updated.

After sending any Telegram message, you **MUST immediately** start the reply-listener flow described in the guide's "Listening for Replies" section. **MUST NOT** skip or defer this step even if the task feels complete — the user may reply via Telegram at any time.
````

## Cách dùng

Trước khi rời máy, hãy nói với agent kiểu như:

- "tele"
- "📨"
- "tele mode on"
- "Ping me on Telegram when done."
- "Report via Telegram and wait for instructions."
- "Schedule a wakeup in 30 minutes; tele me when you wake up."
- "Send a tele report after each PR you open."
- "Báo cáo qua tele khi xong."

Agent sẽ gửi báo cáo ngắn, nghe phản hồi của bạn trên Telegram, rồi tiếp tục xử lý. Nếu bot thả phản ứng 💔 vào tin nhắn của bạn, nghĩa là tin đó bị bỏ qua vì bạn gửi tin nhắn thường thay vì bấm Reply vào một tin nhắn trước đó của bot.

## Trước khi rời máy

Remotebot không xử lý được hộp thoại xin quyền của agent. Nếu agent dừng lại để hỏi "có được chạy lệnh này không?", bạn không thể trả lời câu hỏi đó qua Telegram và agent sẽ bị kẹt. Hãy đặt agent vào chế độ tự chạy phù hợp:

- **Claude Code 4.7+:** Auto Mode.
- **Codex:** Auto-Review.
- **Gemini CLI:** YOLO (`-y`).
- **Antigravity:** Settings -> **Auto Execution** -> chọn **Always Proceed**. Bật thêm **Agent Non-Workspace File Access** vì script Remotebot nằm ở `../remotebot/`, ngoài project hiện tại.
- **Cursor:** Settings -> Features -> Agent -> bật **YOLO mode**.
- **Agent khác:** dùng chế độ tương đương "tự chạy không hỏi lại".

Với phiên bản Claude Code hoặc Codex cũ hơn, có thể cần `--dangerously-skip-permissions` hoặc Full Access mode.

Ngoài ra, hãy giữ máy không ngủ. Agent và listener chạy trên cùng máy; nếu máy sleep thì cả hai đều dừng.

- **macOS:** chạy `caffeinate -i` trong terminal.
- **Linux desktop:** chạy `systemd-inhibit --what=sleep -- sleep infinity`.
- **Windows:** đặt sleep timer của power plan hiện tại thành *Never*.

Remotebot cũng có thể chạy trên VPS hoặc cloud VM, khi đó không cần giữ máy cá nhân luôn thức.

## Vì sao không dùng `/remote-control` hoặc bot phản chiếu toàn bộ phiên?

Các công cụ đó đẩy gần như toàn bộ phiên local lên điện thoại: suy nghĩ của agent, tool call, log, diff, từng dòng trung gian. Trên màn hình nhỏ, bạn sẽ phải đọc và quản từng chi tiết, trái với mục tiêu rời khỏi bàn làm việc.

Remotebot làm ngược lại: cuộc trò chuyện đầy đủ vẫn ở laptop, điện thoại chỉ nhận báo cáo ngắn và gửi lại chỉ dẫn ngắn. Nếu bạn chưa tin agent có thể chạy tự chủ, hãy dùng `/remote-control`; Remotebot không phải lựa chọn phù hợp cho kiểu điều khiển đó.

## Ghi chú

- **Không cần dependency ngoài:** dùng Node built-ins.
- **Yêu cầu:** `node` có trong `PATH`; mỗi project nằm cùng cấp với `remotebot/`; một bot, một chat hoặc group, một file `.env` dùng chung.
- **Không dùng cho việc trọng yếu tuyệt đối.** Agent đôi khi có thể quên gửi tin tiếp theo.

## Phát triển

Chạy kiểm thử:

```bash
npm test
```

Đóng gói release local:

```bash
npm run package:release
```

Cài lại command global trên Windows:

```bash
npm run install:codex-global
npm run install:windows-shims
```

Sau khi cài shim, có thể gửi nhanh từ bất kỳ workspace nào:

```bash
tele --severity success "xong"
remotebot health --section disk
```

Cài hoặc cập nhật cấu hình Remotebot global cho Codex:

```bash
node scripts/install-codex-global.mjs --apply
```

Kiểm tra một lệnh Telegram theo policy an toàn:

```bash
node scripts/inspect-command.mjs "chạy test"
```

Hoặc kiểm tra trực tiếp prompt file do listener tạo:

```bash
node scripts/inspect-command.mjs --prompt-file scripts/tmp/tele-reply/prompt.json
```

Gửi thông báo im lặng khi thành công:

```bash
node scripts/send-telegram.mjs --severity success "xong"
```

Gửi cảnh báo lỗi nghiêm trọng kèm 20 dòng log cuối:

```bash
node scripts/send-telegram.mjs --severity fatal --log-tail ./tmp/test.log --lines 20 "test failed"
```

Gửi tin kèm nút thao tác nhanh:

```bash
node scripts/send-telegram.mjs --quick-actions "Cần quyết định bước tiếp theo"
```

Hoặc tự khai báo nút:

```bash
node scripts/send-telegram.mjs --button "Chạy test=run_tests" --button "Dừng=stop" "Chọn hành động"
```

Cập nhật tiến độ một job dài bằng cách edit cùng một message:

```bash
node scripts/job-progress.mjs --job-id scan-all --progress 20 --status running "đang quét"
node scripts/job-progress.mjs --job-id scan-all --progress 80 --status testing "đang chạy test"
node scripts/job-progress.mjs --job-id scan-all --progress 100 --status done "xong"
```

Nếu muốn bọc một lệnh dài để Remotebot tự gửi các mốc queued/running/done/failed:

```bash
node scripts/run-with-progress.mjs --job-id full-test -- npm test
```

Mọi output của lệnh được ghi vào `scripts/tmp/full-test.log`. Khi lệnh lỗi, tin Telegram sẽ chỉ rõ exit code và file log.

Kiểm tra health của máy ở chế độ chỉ đọc:

```bash
node scripts/system-health.mjs
node scripts/system-health.mjs --section disk
node scripts/system-health.mjs --section memory
node scripts/system-health.mjs --section processes --limit 5
node scripts/system-health.mjs --section last_agent_status
```

Chụp màn hình khi cần debug UI/browser rồi gửi như artifact:

```bash
node scripts/capture-screenshot.mjs --send "ảnh lỗi UI hiện tại"
```

Tính năng này chỉ hỗ trợ Windows desktop ở bản hiện tại. Với lỗi terminal, ưu tiên `--log-tail` vì log dễ đọc hơn ảnh chụp.

Điều khiển máy từ xa có kiểm soát:

```bash
node scripts/remote-steward.mjs --action health
node scripts/remote-steward.mjs --action service_log --service example-worker --lines 80
node scripts/remote-steward.mjs --action restart_service --service example-worker --pin 123456
node scripts/remote-steward.mjs --action restart_service --service example-worker --pin 123456 --apply
```

`restart_service` không bật mặc định. Muốn dùng, hãy thêm service vào `stewardServices`, thêm `restart_service` vào `allowedCommands`, và đặt PIN bằng `pinSha256` hoặc biến môi trường `REMOTEBOT_PIN`. Không có service whitelist thì Remotebot sẽ từ chối.
