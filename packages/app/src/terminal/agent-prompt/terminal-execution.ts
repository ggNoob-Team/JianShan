export type TerminalInputRequest = "password" | "confirmation";

const PASSWORD_PROMPT = /(?:password|passphrase|密码|口令)[^\n]{0,80}[:：]\s*$/i;
const CONFIRMATION_PROMPT =
  /(?:\[[yYnN]\/[yYnN]\]|\(yes\/no\)|continue\?|overwrite\?|are you sure[^\n]*\?)\s*$/i;
const COMMAND_FINISHED_PREFIX = String.fromCharCode(27) + "]633;D";
const OSC_TERMINATOR = String.fromCharCode(7);

// The prompt is only trusted after output has gone idle. These patterns cover
// the common POSIX, PowerShell, and cmd shapes without treating arbitrary
// command output ending in "$" as a completed command.
const SHELL_PROMPT_PATTERNS = [
  /^(?:\([^)]*\)\s*)?[^\s@]+@[^\s:]+(?::[^\n]*)?[#$%>❯➜λ]$/u,
  /^(?:PS\s+)?(?:[A-Za-z]:|~|\/|\.{1,2}\/)[^\n]*[#$%>]$/u,
];

/**
 * Detects prompts that cannot be answered safely by the operator agent. The
 * caller hands the PTY back to the user and keeps watching for completion.
 */
export function detectTerminalInputRequest(output: string): TerminalInputRequest | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lastLine = lines[lines.length - 1] ?? "";
  if (PASSWORD_PROMPT.test(lastLine)) return "password";
  if (CONFIRMATION_PROMPT.test(lastLine)) return "confirmation";
  return null;
}

/** Detects VS Code-style command completion emitted by Paseo's shell hooks. */
export function hasTerminalCommandFinishedMarker(rawOutput: string): boolean {
  const start = rawOutput.lastIndexOf(COMMAND_FINISHED_PREFIX);
  if (start < 0) return false;
  const payloadStart = start + COMMAND_FINISHED_PREFIX.length;
  const end = rawOutput.indexOf(OSC_TERMINATOR, payloadStart);
  if (end < 0) return false;
  const payload = rawOutput.slice(payloadStart, end);
  return (
    payload.length === 0 || (payload.startsWith(";") && Number.isInteger(Number(payload.slice(1))))
  );
}

/** Detects a returned shell prompt at the end of the captured output. */
export function detectShellPromptAtEnd(output: string): boolean {
  const lines = output.split(/\r?\n/);
  let lastLine = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = (lines[index] ?? "").trim();
    if (candidate.length > 0) {
      lastLine = candidate;
      break;
    }
  }
  if (!lastLine || lastLine.length > 512) return false;
  return SHELL_PROMPT_PATTERNS.some((pattern) => pattern.test(lastLine));
}

function decodeTailChunks(chunks: Uint8Array[], maxBytes: number): Uint8Array[] {
  const selected: Uint8Array[] = [];
  let remaining = maxBytes;
  for (let index = chunks.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const chunk = chunks[index];
    if (!chunk) continue;
    selected.push(chunk.length <= remaining ? chunk : chunk.slice(chunk.length - remaining));
    remaining -= Math.min(chunk.length, remaining);
  }
  selected.reverse();
  return selected;
}

export function readTerminalOutputTail(
  chunks: Uint8Array[],
  maxBytes: number,
  decode: (bytes: Uint8Array[]) => string,
  sanitize: (text: string) => string,
): string {
  return sanitize(decode(decodeTailChunks(chunks, maxBytes)));
}
