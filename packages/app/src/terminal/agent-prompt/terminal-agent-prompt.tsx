import { ArrowUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { useAgentFormState } from "@/hooks/use-agent-form-state";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useSessionStore } from "@/stores/session-store";
import {
  archiveTerminalOperatorSession,
  ensureTerminalOperatorSession,
  TerminalOperatorError,
  type TerminalOperatorSession,
} from "./operator-session";
import {
  runTerminalOperatorLoop,
  type TerminalCommandExecutor,
  type TerminalOperatorApprovalDecision,
  type TerminalOperatorApprovalRequest,
  type TerminalOperatorLoopEvent,
} from "./operator-loop";
import { selectTerminalPromptAgent } from "./select-agent";
import { TerminalModelSelector } from "./terminal-model-selector";
import {
  TerminalOperatorPanel,
  type TerminalOperatorRound,
  type TerminalOperatorRun,
} from "./terminal-operator-panel";

interface TerminalAgentPromptProps {
  serverId: string;
  workspaceId: string;
  workspaceDirectory: string;
  projectId: string | null;
  runCommands: TerminalCommandExecutor;
}

const COMMAND_PLAN_TIMEOUT_MS = 120_000;

const AgentTextInput = withUnistyles(EditingTextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));

function createAbortError(): Error {
  const error = new Error("The terminal operator was canceled");
  error.name = "AbortError";
  return error;
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw createAbortError();
  let handleAbort: (() => void) | null = null;
  const canceled = new Promise<never>((_, reject) => {
    handleAbort = () => reject(createAbortError());
    signal.addEventListener("abort", handleAbort, { once: true });
  });
  try {
    return await Promise.race([promise, canceled]);
  } finally {
    if (handleAbort) signal.removeEventListener("abort", handleAbort);
  }
}

function describeError(error: unknown, translate: (key: string) => string): string {
  if (error instanceof TerminalOperatorError) {
    if (error.code === "unsupported_host") {
      return translate("workspace.terminal.agentPrompt.hostUnsupported");
    }
    return `${translate("workspace.terminal.agentPrompt.sessionFailed")}: ${error.message}`;
  }
  if (error instanceof Error && error.message.includes("invalid terminal decision")) {
    return translate("workspace.terminal.agentPrompt.badDecision");
  }
  return error instanceof Error ? error.message : String(error);
}

async function waitForOperatorReply(
  client: Pick<DaemonClient, "waitForFinish">,
  agentId: string,
  timeoutMs: number,
  translate: (key: string) => string,
  signal: AbortSignal,
): Promise<string> {
  const result = await raceWithAbort(client.waitForFinish(agentId, timeoutMs), signal);
  if (result.status === "timeout") {
    throw new Error(translate("workspace.terminal.agentPrompt.timeout"));
  }
  if (result.status === "permission") {
    throw new Error(translate("workspace.terminal.agentPrompt.permission"));
  }
  if (result.status !== "idle") {
    throw new Error(result.error ?? translate("workspace.terminal.agentPrompt.failed"));
  }
  return result.lastMessage?.trim() ?? "";
}

function createRun(request: string): TerminalOperatorRun {
  return {
    request,
    stage: "starting",
    rounds: [],
    output: "",
    conclusion: null,
    error: null,
    awaitingInputHint: null,
  };
}

function upsertRound(
  rounds: TerminalOperatorRound[],
  round: TerminalOperatorRound,
): TerminalOperatorRound[] {
  const index = rounds.findIndex((entry) => entry.round === round.round);
  if (index < 0) return [...rounds, round];
  const next = rounds.slice();
  next[index] = { ...next[index], ...round };
  return next;
}

function cancelRounds(rounds: TerminalOperatorRound[]): TerminalOperatorRound[] {
  return rounds.map((round) =>
    round.status === "planned" || round.status === "running"
      ? { ...round, status: "canceled" }
      : round,
  );
}

function applyOperatorEvent(
  run: TerminalOperatorRun,
  event: TerminalOperatorLoopEvent,
): TerminalOperatorRun {
  switch (event.type) {
    case "planning":
      return { ...run, stage: "planning", awaitingInputHint: null };
    case "approval_required":
      return {
        ...run,
        stage: "approval",
        awaitingInputHint: null,
        rounds: upsertRound(run.rounds, {
          round: event.round,
          commands: event.commands,
          status: "planned",
          output: null,
        }),
      };
    case "executing":
      return {
        ...run,
        stage: "executing",
        awaitingInputHint: null,
        rounds: upsertRound(run.rounds, {
          round: event.round,
          commands: event.commands,
          status: "running",
          output: null,
        }),
      };
    case "awaiting_input":
      return {
        ...run,
        stage: "awaiting_user",
        awaitingInputHint: event.hint,
        rounds: upsertRound(run.rounds, {
          round: event.round,
          commands: event.commands,
          status: "running",
          output: null,
        }),
      };
    case "executed":
      return {
        ...run,
        stage: "planning",
        output: event.output,
        awaitingInputHint: null,
        rounds: upsertRound(run.rounds, {
          round: event.round,
          commands: event.commands,
          status: "completed",
          output: event.output,
        }),
      };
    case "blocked":
      return {
        ...run,
        stage: "planning",
        awaitingInputHint: null,
        rounds: upsertRound(run.rounds, {
          round: event.round,
          commands: event.commands,
          status: "blocked",
          output: event.reasons.join(String.fromCharCode(10)),
        }),
      };
    case "rejected":
      return {
        ...run,
        stage: "planning",
        awaitingInputHint: null,
        rounds: upsertRound(run.rounds, {
          round: event.round,
          commands: event.commands,
          status: "rejected",
          output: null,
        }),
      };
    case "finished":
      return { ...run, stage: "done", awaitingInputHint: null, conclusion: event.conclusion };
    case "canceled":
      return {
        ...run,
        stage: "canceled",
        awaitingInputHint: null,
        rounds: cancelRounds(run.rounds),
      };
  }
}

export function TerminalAgentPrompt({
  serverId,
  workspaceId,
  workspaceDirectory,
  projectId,
  runCommands,
}: TerminalAgentPromptProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const agents = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
  const focusedAgentId = useSessionStore(
    (state) => state.sessions[serverId]?.focusedAgentId ?? null,
  );
  const inputRef = useRef<EditingTextInputHandle>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<TerminalOperatorRun | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const sessionRef = useRef<TerminalOperatorSession | null>(null);
  const mountedRef = useRef(true);
  const clientRef = useRef(client);
  const abortRef = useRef<AbortController | null>(null);
  const approvalResolverRef = useRef<((decision: TerminalOperatorApprovalDecision) => void) | null>(
    null,
  );
  clientRef.current = client;

  const defaultAgent = useMemo(() => {
    if (!agents) {
      return null;
    }
    return selectTerminalPromptAgent({
      agents: agents.values(),
      workspaceId,
      workspaceDirectory,
      focusedAgentId,
    });
  }, [agents, focusedAgentId, workspaceDirectory, workspaceId]);

  const initialValues = useMemo(() => {
    if (!defaultAgent) {
      return undefined;
    }
    return {
      provider: defaultAgent.provider,
      model: defaultAgent.model,
    };
  }, [defaultAgent]);

  const modelForm = useAgentFormState({
    serverId,
    workingDir: workspaceDirectory,
    initialValues,
    isCreateFlow: true,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      approvalResolverRef.current?.("cancel");
      approvalResolverRef.current = null;
      const session = sessionRef.current;
      sessionRef.current = null;
      const currentClient = clientRef.current;
      if (session && currentClient) {
        void currentClient.cancelAgent(session.agentId).catch(() => undefined);
        void archiveTerminalOperatorSession(currentClient, session);
      }
    };
  }, []);

  useEffect(() => {
    if (!run) return;
    if (run.stage === "awaiting_user") {
      setPanelVisible(false);
      return;
    }
    if (
      run.stage === "approval" ||
      run.stage === "done" ||
      run.stage === "canceled" ||
      run.stage === "error"
    ) {
      setPanelVisible(true);
    }
  }, [run]);

  const resolveApproval = useCallback((decision: TerminalOperatorApprovalDecision) => {
    const resolve = approvalResolverRef.current;
    if (!resolve) return;
    approvalResolverRef.current = null;
    resolve(decision);
  }, []);

  const handleCancelRun = useCallback(() => {
    resolveApproval("cancel");
    abortRef.current?.abort();
    const agentId = sessionRef.current?.agentId;
    if (client && agentId) {
      void client.cancelAgent(agentId).catch(() => undefined);
    }
    if (mountedRef.current) {
      setRun((current) =>
        current && current.stage !== "done" && current.stage !== "error"
          ? {
              ...current,
              stage: "canceled",
              awaitingInputHint: null,
              rounds: cancelRounds(current.rounds),
            }
          : current,
      );
    }
  }, [client, resolveApproval]);

  const handleSubmit = useCallback(async () => {
    const request = draft.trim();
    const provider = modelForm.selectedProvider;
    if (!request || !client || !provider || busy) {
      return;
    }
    const model = modelForm.selectedModel || null;
    Keyboard.dismiss();
    setBusy(true);
    setPanelVisible(true);
    setRun(createRun(request));
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      const session = await ensureTerminalOperatorSession({
        client,
        existing: sessionRef.current,
        provider,
        model,
        cwd: workspaceDirectory,
        projectId,
      });
      if (!mountedRef.current) {
        void archiveTerminalOperatorSession(client, session);
        return;
      }
      sessionRef.current = session;
      if (signal.aborted) {
        setRun((current) => (current ? { ...current, stage: "canceled" } : current));
        return;
      }

      const requestApproval = (_approval: TerminalOperatorApprovalRequest) => {
        if (signal.aborted) return Promise.resolve<TerminalOperatorApprovalDecision>("cancel");
        return new Promise<TerminalOperatorApprovalDecision>((resolve) => {
          approvalResolverRef.current = resolve;
        });
      };

      const outcome = await runTerminalOperatorLoop({
        request,
        cwd: workspaceDirectory,
        signal,
        sendPrompt: async (prompt) => {
          await client.sendAgentMessage(session.agentId, prompt);
        },
        waitForReply: (timeoutMs) =>
          waitForOperatorReply(client, session.agentId, timeoutMs, t, signal),
        requestApproval,
        executeCommands: (commands, options) => runCommands(commands, options),
        onEvent: (event) => {
          if (!mountedRef.current) return;
          setRun((current) => {
            if (!current) return current;
            const next = applyOperatorEvent(current, event);
            if (next.stage === "done" && !next.conclusion) {
              return { ...next, conclusion: t("workspace.terminal.agentPrompt.noConclusion") };
            }
            return next;
          });
        },
        replyTimeoutMs: COMMAND_PLAN_TIMEOUT_MS,
      });

      if (mountedRef.current && outcome.status === "done") {
        inputRef.current?.reset();
        setDraft("");
      }
    } catch (error) {
      if (mountedRef.current) {
        if (signal.aborted) {
          setRun((current) =>
            current
              ? {
                  ...current,
                  stage: "canceled",
                  awaitingInputHint: null,
                  rounds: cancelRounds(current.rounds),
                }
              : current,
          );
        } else {
          setRun((current) =>
            current ? { ...current, stage: "error", error: describeError(error, t) } : current,
          );
        }
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      approvalResolverRef.current = null;
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }, [
    busy,
    client,
    draft,
    modelForm.selectedModel,
    modelForm.selectedProvider,
    projectId,
    runCommands,
    t,
    workspaceDirectory,
  ]);

  const handleSubmitPress = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
  }, []);

  const handleApprove = useCallback(() => {
    setRun((current) => (current ? { ...current, stage: "executing" } : current));
    resolveApproval("run");
  }, [resolveApproval]);

  const handleReject = useCallback(() => {
    setRun((current) => (current ? { ...current, stage: "planning" } : current));
    resolveApproval("reject");
  }, [resolveApproval]);

  const handleShowDetails = useCallback(() => {
    setPanelVisible(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    if (!run) return;
    if (run.stage === "awaiting_user") {
      setPanelVisible(false);
      return;
    }
    if (run.stage === "done" || run.stage === "canceled" || run.stage === "error") {
      setPanelVisible(false);
      setRun(null);
    }
  }, [run]);

  const enabled = Boolean(client && modelForm.selectedProvider);
  const canSubmit = enabled && draft.trim().length > 0 && !busy && !modelForm.isAllModelsLoading;
  const placeholder = t(
    enabled
      ? "workspace.terminal.agentPrompt.placeholder"
      : "workspace.terminal.agentPrompt.noModel",
  );
  const modelLabel =
    modelForm.selectedModel ||
    modelForm.selectedProvider ||
    t("workspace.terminal.agentPrompt.noModel");
  const showHandoffBar = run?.stage === "awaiting_user" && !panelVisible;

  return (
    <View style={styles.root} testID="terminal-agent-prompt">
      {showHandoffBar ? (
        <View style={styles.handoffBar} testID="terminal-agent-handoff">
          <Text numberOfLines={2} style={styles.handoffText}>
            {t("workspace.terminal.agentPrompt.handoffInline")}
          </Text>
          <View style={styles.handoffActions}>
            <Button onPress={handleShowDetails} size="xs" variant="ghost">
              {t("workspace.terminal.agentPrompt.showDetails")}
            </Button>
            <Button
              onPress={handleCancelRun}
              size="xs"
              testID="terminal-agent-handoff-cancel"
              variant="ghost"
            >
              {t("workspace.terminal.agentPrompt.cancelRun")}
            </Button>
          </View>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TerminalModelSelector
          disabled={busy || modelForm.isAllModelsLoading}
          isLoading={modelForm.isAllModelsLoading}
          onSelect={modelForm.setProviderAndModelFromUser}
          providers={modelForm.modelSelectorProviders}
          selectedModel={modelForm.selectedModel}
          selectedProvider={modelForm.selectedProvider}
          serverId={serverId}
        />
        <AgentTextInput
          ref={inputRef}
          accessibilityLabel={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          editable={enabled && !busy}
          initialValue=""
          onChangeText={handleDraftChange}
          onSubmitEditing={handleSubmitPress}
          placeholder={placeholder}
          returnKeyType="send"
          style={styles.input}
          testID="terminal-agent-prompt-input"
        />
        <Button
          accessibilityLabel={t("workspace.terminal.agentPrompt.send")}
          disabled={!canSubmit}
          leftIcon={ArrowUp}
          loading={busy}
          onPress={handleSubmitPress}
          size="xs"
          style={styles.sendButton}
          testID="terminal-agent-prompt-send"
          variant="default"
        />
      </View>
      <TerminalOperatorPanel
        modelLabel={modelLabel}
        onApprove={handleApprove}
        onCancel={handleCancelRun}
        onClose={handleClosePanel}
        onReject={handleReject}
        run={run}
        visible={panelVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[2],
  },
  handoffBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  handoffText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  handoffActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  inputRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    paddingLeft: theme.spacing[1],
    paddingRight: 4,
  },
  input: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingVertical: 0,
  },
  sendButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 0,
  },
}));
