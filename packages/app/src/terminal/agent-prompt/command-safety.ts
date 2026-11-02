export type TerminalCommandRisk = "safe" | "confirm" | "blocked";

export interface TerminalCommandAssessment {
  risk: TerminalCommandRisk;
  reason: string;
}

const SAFE_COMMANDS = new Set([
  "basename",
  "cat",
  "cd",
  "clear",
  "cp",
  "cut",
  "date",
  "df",
  "diff",
  "dir",
  "dirname",
  "du",
  "echo",
  "false",
  "fd",
  "file",
  "find",
  "free",
  "grep",
  "head",
  "id",
  "jq",
  "ls",
  "mkdir",
  "mv",
  "nl",
  "pgrep",
  "printf",
  "ps",
  "pwd",
  "realpath",
  "rg",
  "rmdir",
  "sort",
  "stat",
  "tail",
  "test",
  "touch",
  "tr",
  "true",
  "uname",
  "uniq",
  "uptime",
  "wc",
  "which",
  "whoami",
]);

const SAFE_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "rev-parse", "remote"]);

const SAFE_NODE_TOOLS: Record<string, ReadonlySet<string>> = {
  node: new Set(["--version", "-v"]),
  npm: new Set(["--version", "-v", "ls", "list", "view"]),
  pnpm: new Set(["--version", "-v", "ls", "list"]),
  yarn: new Set(["--version", "-v", "list"]),
  bun: new Set(["--version", "-v"]),
  python: new Set(["--version", "-V"]),
  python3: new Set(["--version", "-V"]),
  pip: new Set(["--version", "-V"]),
  pip3: new Set(["--version", "-V"]),
  go: new Set(["version"]),
  rustc: new Set(["--version", "-V"]),
  cargo: new Set(["--version", "-V"]),
  java: new Set(["-version", "--version"]),
};

function commandBasename(token: string): string {
  const normalized = token.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return (slash >= 0 ? normalized.slice(slash + 1) : normalized).toLowerCase();
}

/**
 * Finds shell syntax that requires explicit approval. Redirections and command
 * substitution are only special outside single quotes; double quotes still
 * allow `$()` and backtick expansion, so they cannot be treated as inert.
 */
function findUnsafeShellSyntax(command: string): string | null {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      continue;
    }
    if (character === "'") {
      quote = "'";
      continue;
    }
    if (quote === '"') {
      if (character === '"') {
        quote = null;
      } else if (character === "`" || (character === "$" && command[index + 1] === "(")) {
        return "shell expansion is present";
      }
      continue;
    }
    if (character === '"') {
      quote = '"';
      continue;
    }
    if (
      character === "`" ||
      (character === "$" && command[index + 1] === "(") ||
      character === ">" ||
      character === "<"
    ) {
      return "shell redirection or expansion is present";
    }
  }
  return null;
}

function splitSegments(command: string): string[] | null {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === ";" || character === "|" || character === "&") {
      const segment = current.trim();
      if (segment) segments.push(segment);
      current = "";
      continue;
    }
    current += character;
  }
  if (quote) return null;
  const last = current.trim();
  if (last) segments.push(last);
  return segments;
}

function firstToken(segment: string): { token: string; rest: string[] } {
  const tokens = segment.trim().split(/\s+/);
  return { token: tokens[0] ?? "", rest: tokens.slice(1) };
}

function assessRm(rest: string[]): TerminalCommandAssessment {
  const flags = rest.filter((token) => token.startsWith("-"));
  const targets = rest.filter((token) => !token.startsWith("-"));
  const recursive = flags.some((flag) => /^-[^-]*r/i.test(flag) || flag === "--recursive");
  const rootTarget = targets.some((target) =>
    ["/", "/*", "~", "~/", "$home", "${home}", ".", "..", "*"].includes(target.toLowerCase()),
  );
  if (recursive && rootTarget) {
    return { risk: "blocked", reason: "recursive delete of a root or home target" };
  }
  if (rootTarget) {
    return { risk: "blocked", reason: "delete of a root or home target" };
  }
  return { risk: "confirm", reason: "delete changes files" };
}

// oxlint-disable-next-line complexity
function assessCommandSegment(segment: string): TerminalCommandAssessment {
  const { token, rest } = firstToken(segment);
  const command = commandBasename(token);
  if (!command) return { risk: "confirm", reason: "empty command" };

  if (command === "sudo" || command === "doas") {
    return { risk: "confirm", reason: "sudo may ask for a password" };
  }
  if (command === "rm") return assessRm(rest);
  if (command === "mv" || command === "cp" || command === "mkdir" || command === "touch") {
    return { risk: "confirm", reason: "command changes files" };
  }
  if (command === "rmdir") return { risk: "confirm", reason: "delete changes files" };
  if (command === "dd") {
    return rest.some((value) => /^of=(?:\/dev\/|[a-z]:\\|\\\\\.\\physicaldrive)/i.test(value))
      ? { risk: "blocked", reason: "raw disk write" }
      : { risk: "confirm", reason: "dd can overwrite data" };
  }
  if (/^(mkfs|fdisk|parted|wipefs)/i.test(command)) {
    return { risk: "blocked", reason: "disk formatting or partitioning" };
  }
  if (
    command === "shutdown" ||
    command === "reboot" ||
    command === "halt" ||
    command === "poweroff"
  ) {
    return { risk: "blocked", reason: "command stops the machine" };
  }
  if (command === "chmod" || command === "chown") {
    const recursive = rest.some((value) => value === "-R" || value === "--recursive");
    const rootTarget = rest.some((value) => value === "/" || value === "/*");
    if (recursive && rootTarget) {
      return { risk: "blocked", reason: "recursive ownership change at the filesystem root" };
    }
    return { risk: "confirm", reason: "command changes permissions or ownership" };
  }
  if (command === "git") {
    const subcommand = rest[0]?.toLowerCase() ?? "";
    if (SAFE_GIT_SUBCOMMANDS.has(subcommand)) {
      return { risk: "safe", reason: "read-only git inspection" };
    }
    if (subcommand === "branch") {
      const flags = rest.slice(1);
      const safe = flags.every((flag) => ["-a", "-v", "--list", "--show-current"].includes(flag));
      return safe
        ? { risk: "safe", reason: "read-only git inspection" }
        : { risk: "confirm", reason: "git branch can change branches" };
    }
    return { risk: "confirm", reason: "git command can change the checkout" };
  }
  const nodeTool = SAFE_NODE_TOOLS[command];
  if (nodeTool) {
    return rest.length > 0 && nodeTool.has(rest[0])
      ? { risk: "safe", reason: "read-only version query" }
      : { risk: "confirm", reason: "command can execute project code" };
  }
  if (
    command === "find" &&
    rest.some((value) => ["-delete", "-exec", "-execdir", "-ok"].includes(value))
  ) {
    return { risk: "confirm", reason: "find can modify files or run commands" };
  }
  if (command === "rg" && rest.some((value) => value === "--pre" || value.startsWith("--pre="))) {
    return { risk: "confirm", reason: "ripgrep can run a preprocessor command" };
  }
  if ((command === "tail" || command === "head") && rest.some((value) => /^-.*f/.test(value))) {
    return { risk: "confirm", reason: "follow mode does not finish on its own" };
  }
  if (command === "cat" && rest.some((value) => value === "-" || value.startsWith("/dev/"))) {
    return { risk: "confirm", reason: "command can wait on a stream or device" };
  }
  if (command === "sed" && rest.some((value) => value === "-i" || value.startsWith("-i"))) {
    return { risk: "confirm", reason: "sed edits files in place" };
  }
  if (command === "sed" || command === "awk" || command === "xargs") {
    return { risk: "confirm", reason: "command can execute expressions or other commands" };
  }
  if (
    command === "curl" ||
    command === "wget" ||
    command === "ssh" ||
    command === "scp" ||
    command === "rsync"
  ) {
    return { risk: "confirm", reason: "network command" };
  }
  if (command === "env" || command === "printenv" || command === "history" || command === "alias") {
    return { risk: "confirm", reason: "command can expose shell state or secrets" };
  }
  if (command === "kill" || command === "pkill" || command === "killall") {
    return { risk: "confirm", reason: "command stops processes" };
  }
  if (SAFE_COMMANDS.has(command)) {
    return { risk: "safe", reason: "read-only inspection" };
  }
  return { risk: "confirm", reason: "command is not in the safe read-only set" };
}

/**
 * Classifies a command for the approval gate. Only commands that cannot mutate
 * the checkout, shell state, or machine are auto-run. Everything else is either
 * confirmed by the user or refused outright when it is destructive enough that
 * a mis-click should not be able to start it.
 */
export function assessTerminalCommand(command: string): TerminalCommandAssessment {
  const trimmed = command.trim();
  if (!trimmed) return { risk: "blocked", reason: "empty command" };
  if (/[\r\n]/.test(trimmed)) {
    return { risk: "blocked", reason: "commands must be a single line" };
  }
  if (/:\(\)\s*\{\s*:\|:&\s*\};:/.test(trimmed)) {
    return { risk: "blocked", reason: "fork bomb" };
  }
  const unsafeSyntax = findUnsafeShellSyntax(trimmed);
  if (unsafeSyntax) {
    return { risk: "confirm", reason: unsafeSyntax };
  }
  const segments = splitSegments(trimmed);
  if (!segments || segments.length === 0) {
    return { risk: "confirm", reason: "command could not be parsed safely" };
  }
  let strongest: TerminalCommandAssessment = { risk: "safe", reason: "read-only command" };
  for (const segment of segments) {
    const assessment = assessCommandSegment(segment);
    if (assessment.risk === "blocked") return assessment;
    if (assessment.risk === "confirm") strongest = assessment;
  }
  return strongest;
}
