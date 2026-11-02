import {
  buildOperatorLimitPrompt,
  buildOperatorObservationPrompt,
  buildOperatorStartPrompt,
  parseOperatorDecision,
  type OperatorObservation,
} from "./command-plan";
import {
  assessTerminalCommand,
  type TerminalCommandAssessment,
  type TerminalCommandRisk,
} from "./command-safety";

export const DEFAULT_OPERATOR_MAX_ROUNDS = 8;
const DEFAULT_OPERATOR_REPLY_TIMEOUT_MS = 120_000;

export interface OperatorCommandAssessment extends TerminalCommandAssessment {
  command: string;
}

export type TerminalOperatorApprovalDecision = "run" | "reject" | "cancel";

export interface TerminalOperatorApprovalRequest {
  round: number;
  commands: OperatorCommandAssessment[];
  signal: AbortSignal;
}

export interface ExecuteTerminalCommandsOptions {
  signal: AbortSignal;
  onAwaitingInput: (hint: string) => void;
}

export interface TerminalCommandExecutionResult {
  output: string;
  canceled: boolean;
}

export type TerminalCommandExecutor = (
  commands: string[],
  options: ExecuteTerminalCommandsOptions,
) => Promise<TerminalCommandExecutionResult>;

export type TerminalOperatorLoopEvent =
  | { type: "planning"; round: number }
  | { type: "approval_required"; round: number; commands: OperatorCommandAssessment[] }
  | { type: "executing"; round: number; commands: OperatorCommandAssessment[] }
  | {
      type: "awaiting_input";
      round: number;
      commands: OperatorCommandAssessment[];
      hint: string;
    }
  | {
      type: "executed";
      round: number;
      commands: OperatorCommandAssessment[];
      output: string;
    }
  | {
      type: "blocked";
      round: number;
      commands: OperatorCommandAssessment[];
      reasons: string[];
    }
  | {
      type: "rejected";
      round: number;
      commands: OperatorCommandAssessment[];
      reason: string | null;
    }
  | { type: "finished"; conclusion: string }
  | { type: "canceled" };

export type TerminalOperatorLoopResult =
  | { status: "done"; conclusion: string }
  | { status: "canceled" };

export interface TerminalOperatorLoopInput {
  request: string;
  cwd: string;
  signal: AbortSignal;
  sendPrompt: (prompt: string) => Promise<void>;
  waitForReply: (timeoutMs: number) => Promise<string>;
  requestApproval: (
    request: TerminalOperatorApprovalRequest,
  ) => Promise<TerminalOperatorApprovalDecision>;
  executeCommands: TerminalCommandExecutor;
  onEvent: (event: TerminalOperatorLoopEvent) => void;
  maxRounds?: number;
  replyTimeoutMs?: number;
}

function abortError(): Error {
  const error = new Error("The terminal operator was canceled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function assessmentFor(command: string): OperatorCommandAssessment {
  return { command, ...assessTerminalCommand(command) };
}

function strongestRisk(commands: OperatorCommandAssessment[]): TerminalCommandRisk {
  if (commands.some((command) => command.risk === "blocked")) return "blocked";
  if (commands.some((command) => command.risk === "confirm")) return "confirm";
  return "safe";
}

async function requestFinalConclusion(
  input: TerminalOperatorLoopInput,
  replyTimeoutMs: number,
): Promise<string> {
  await input.sendPrompt(buildOperatorLimitPrompt({ cwd: input.cwd }));
  const reply = await input.waitForReply(replyTimeoutMs);
  throwIfAborted(input.signal);
  const decision = parseOperatorDecision(reply);
  if (decision.type === "finish") return decision.conclusion;
  return decision.note ?? "";
}

/**
 * Drives the visible terminal in multiple agent turns. The caller owns the
 * backgrounds agent, PTY bridge, and approval UI; this function only sequences
 * plan -> safety gate -> execute -> feed output back into the conversation.
 */
export async function runTerminalOperatorLoop(
  input: TerminalOperatorLoopInput,
): Promise<TerminalOperatorLoopResult> {
  const maxRounds = input.maxRounds ?? DEFAULT_OPERATOR_MAX_ROUNDS;
  const replyTimeoutMs = input.replyTimeoutMs ?? DEFAULT_OPERATOR_REPLY_TIMEOUT_MS;
  let round = 1;
  let prompt = buildOperatorStartPrompt({ request: input.request, cwd: input.cwd });

  try {
    while (true) {
      throwIfAborted(input.signal);
      if (round > maxRounds) {
        const conclusion = await requestFinalConclusion(input, replyTimeoutMs);
        input.onEvent({ type: "finished", conclusion });
        return { status: "done", conclusion };
      }

      input.onEvent({ type: "planning", round });
      await input.sendPrompt(prompt);
      throwIfAborted(input.signal);
      const reply = await input.waitForReply(replyTimeoutMs);
      throwIfAborted(input.signal);
      const decision = parseOperatorDecision(reply);
      if (decision.type === "finish") {
        input.onEvent({ type: "finished", conclusion: decision.conclusion });
        return { status: "done", conclusion: decision.conclusion };
      }

      const commands = decision.commands.map(assessmentFor);
      const risk = strongestRisk(commands);
      if (risk === "blocked") {
        const reasons = commands
          .filter((command) => command.risk === "blocked")
          .map((command) => command.reason);
        input.onEvent({ type: "blocked", round, commands, reasons });
        prompt = buildOperatorObservationPrompt({
          cwd: input.cwd,
          observation: { type: "blocked", round, commands: decision.commands, reasons },
        });
        round += 1;
        continue;
      }

      if (risk === "confirm") {
        input.onEvent({ type: "approval_required", round, commands });
        const approval = await input.requestApproval({ round, commands, signal: input.signal });
        throwIfAborted(input.signal);
        if (approval === "cancel") {
          input.onEvent({ type: "canceled" });
          return { status: "canceled" };
        }
        if (approval === "reject") {
          input.onEvent({ type: "rejected", round, commands, reason: null });
          prompt = buildOperatorObservationPrompt({
            cwd: input.cwd,
            observation: { type: "rejected", round, commands: decision.commands, reason: null },
          });
          round += 1;
          continue;
        }
      }

      input.onEvent({ type: "executing", round, commands });
      const result = await input.executeCommands(decision.commands, {
        signal: input.signal,
        onAwaitingInput: (hint) => input.onEvent({ type: "awaiting_input", round, commands, hint }),
      });
      throwIfAborted(input.signal);
      if (result.canceled) {
        input.onEvent({ type: "canceled" });
        return { status: "canceled" };
      }

      input.onEvent({ type: "executed", round, commands, output: result.output });
      const observation: OperatorObservation = {
        type: "executed",
        round,
        commands: decision.commands,
        output: result.output,
      };
      prompt = buildOperatorObservationPrompt({ cwd: input.cwd, observation });
      round += 1;
    }
  } catch (error) {
    if (input.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      input.onEvent({ type: "canceled" });
      return { status: "canceled" };
    }
    throw error;
  }
}
