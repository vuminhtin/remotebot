const COMMAND_PATTERNS = [
  {
    action: 'continue',
    risk: 'low',
    patterns: [
      /\bcontinue\b/i,
      /\bgo on\b/i,
      /\bkeep going\b/i,
      /\btiếp tục\b/i,
      /\blàm tiếp\b/i,
      /\bcứ làm tiếp\b/i,
    ],
  },
  {
    action: 'fix_failed_tests',
    risk: 'medium',
    patterns: [
      /\bfix failed tests?\b/i,
      /\bfix tests?\b/i,
      /\bsửa lỗi test\b/i,
      /\bsửa test\b/i,
      /\bsửa lỗi đi\b/i,
    ],
  },
  {
    action: 'stop',
    risk: 'low',
    patterns: [
      /\bstop\b/i,
      /\babort\b/i,
      /\bcancel\b/i,
      /\bdừng\b/i,
      /\bdừng lại\b/i,
      /\bhủy\b/i,
    ],
  },
  {
    action: 'send_last_log',
    risk: 'low',
    patterns: [
      /\bsend (last )?logs?\b/i,
      /\blog tail\b/i,
      /\bgửi log\b/i,
      /\bgửi lỗi\b/i,
      /\bcho xem log\b/i,
    ],
  },
  {
    action: 'run_tests',
    risk: 'low',
    patterns: [
      /\brun tests?\b/i,
      /\btest again\b/i,
      /\bchạy test\b/i,
      /\bkiểm thử\b/i,
    ],
  },
  {
    action: 'summarize_status',
    risk: 'low',
    patterns: [
      /\bstatus\b/i,
      /\bsummar(y|ize)\b/i,
      /\btiến độ\b/i,
      /\btình trạng\b/i,
      /\btóm tắt\b/i,
      /\bbáo cáo\b/i,
    ],
  },
  {
    action: 'health',
    risk: 'low',
    patterns: [
      /\bhealth\b/i,
      /\bsystem health\b/i,
      /\bkiểm tra máy\b/i,
      /\btình trạng máy\b/i,
      /\bmáy còn sống không\b/i,
    ],
  },
  {
    action: 'disk',
    risk: 'low',
    patterns: [
      /\bdisk\b/i,
      /\bdisk space\b/i,
      /\bdung lượng\b/i,
      /\bổ đĩa\b/i,
      /\bcòn bao nhiêu ổ\b/i,
    ],
  },
  {
    action: 'memory',
    risk: 'low',
    patterns: [
      /\bmemory\b/i,
      /\bram\b/i,
      /\bbộ nhớ\b/i,
      /\btốn ram\b/i,
    ],
  },
  {
    action: 'processes',
    risk: 'low',
    patterns: [
      /\bprocess(es)?\b/i,
      /\btop process(es)?\b/i,
      /\btiến trình\b/i,
      /\bprocess nào\b/i,
    ],
  },
  {
    action: 'last_agent_status',
    risk: 'low',
    patterns: [
      /\blast agent status\b/i,
      /\bagent status\b/i,
      /\btrạng thái agent\b/i,
      /\blần cuối agent\b/i,
    ],
  },
  {
    action: 'capture_screenshot',
    risk: 'medium',
    patterns: [
      /\bcapture screenshot\b/i,
      /\btake screenshot\b/i,
      /\bscreenshot\b/i,
      /\bchụp màn hình\b/i,
      /\bchup man hinh\b/i,
    ],
  },
  {
    action: 'service_log',
    risk: 'medium',
    patterns: [
      /\bservice log\b/i,
      /\blog service\b/i,
      /\blấy log service\b/i,
      /\bxem log service\b/i,
    ],
  },
  {
    action: 'restart_service',
    risk: 'medium',
    patterns: [
      /\brestart service\b/i,
      /\brestart .*service\b/i,
      /\bkhởi động lại service\b/i,
      /\bkhoi dong lai service\b/i,
    ],
  },
  {
    action: 'shutdown',
    risk: 'high',
    patterns: [
      /\bshutdown\b/i,
      /\btắt máy\b/i,
      /\btat may\b/i,
    ],
  },
];

export const KNOWN_COMMANDS = COMMAND_PATTERNS.map(({ action, risk }) => ({ action, risk }));

export function normalizeCommandText(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

export function parseCommandIntent(text) {
  const normalized = normalizeCommandText(text);
  if (!normalized) {
    return {
      action: 'unknown',
      risk: 'unknown',
      allowedToExecute: false,
      confidence: 0,
      rawText: '',
      reason: 'Nội dung trống.',
    };
  }

  for (const command of COMMAND_PATTERNS) {
    if (normalized === command.action || command.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        action: command.action,
        risk: command.risk,
        allowedToExecute: false,
        confidence: 0.9,
        rawText: normalized,
        reason: 'Khớp command pattern đã định nghĩa.',
      };
    }
  }

  return {
    action: 'unknown',
    risk: 'unknown',
    allowedToExecute: false,
    confidence: 0,
    rawText: normalized,
    reason: 'Không khớp command nào trong whitelist.',
  };
}
