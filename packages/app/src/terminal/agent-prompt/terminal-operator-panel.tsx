import { Modal, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ScrollView } from "@/components/ui/scroll-view";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import type { OperatorCommandAssessment } from "./operator-loop";
import { truncateTerminalText } from "./terminal-output";

export type TerminalOperatorStage =
  | "starting"
  | "planning"
  | "approval"
  | "executing"
  | "awaiting_user"
  | "done"
  | "canceled"
  | "error";

export type TerminalOperatorRoundStatus =
  | "planned"
  | "running"
  | "completed"
  | "blocked"
  | "rejected"
  | "canceled";

export interface TerminalOperatorRound {
  round: number;
  commands: OperatorCommandAssessment[];
  status: TerminalOperatorRoundStatus;
  output: string | null;
}

export interface TerminalOperatorRun {
  request: string;
  stage: TerminalOperatorStage;
  rounds: TerminalOperatorRound[];
  output: string;
  conclusion: string | null;
  error: string | null;
  awaitingInputHint: string | null;
}

interface TerminalOperatorPanelProps {
  run: TerminalOperatorRun | null;
  visible: boolean;
  modelLabel: string;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onClose: () => void;
}

const STAGE_KEYS: Record<TerminalOperatorStage, string> = {
  starting: "workspace.terminal.agentPrompt.stageStarting",
  planning: "workspace.terminal.agentPrompt.stagePlanning",
  approval: "workspace.terminal.agentPrompt.stageApproval",
  executing: "workspace.terminal.agentPrompt.stageExecuting",
  awaiting_user: "workspace.terminal.agentPrompt.stageAwaitingUser",
  done: "workspace.terminal.agentPrompt.stageDone",
  canceled: "workspace.terminal.agentPrompt.stageCanceled",
  error: "workspace.terminal.agentPrompt.stageError",
};

const ROUND_STATUS_KEYS: Record<TerminalOperatorRoundStatus, string> = {
  planned: "workspace.terminal.agentPrompt.roundPlanned",
  running: "workspace.terminal.agentPrompt.roundRunning",
  completed: "workspace.terminal.agentPrompt.roundCompleted",
  blocked: "workspace.terminal.agentPrompt.roundBlocked",
  rejected: "workspace.terminal.agentPrompt.roundRejected",
  canceled: "workspace.terminal.agentPrompt.roundCanceled",
};

const RISK_KEYS: Record<OperatorCommandAssessment["risk"], string> = {
  safe: "workspace.terminal.agentPrompt.riskSafe",
  confirm: "workspace.terminal.agentPrompt.riskConfirm",
  blocked: "workspace.terminal.agentPrompt.riskBlocked",
};

const OUTPUT_PREVIEW_CHARS = 2_000;

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

function isRunFinished(stage: TerminalOperatorStage): boolean {
  return stage === "done" || stage === "canceled" || stage === "error";
}

function isStageSpinning(stage: TerminalOperatorStage): boolean {
  return stage === "starting" || stage === "planning" || stage === "executing";
}

function OperatorCommandRow({ command }: { command: OperatorCommandAssessment }) {
  const { t } = useTranslation();
  return (
    <View style={styles.commandRow}>
      <Text style={styles.riskBadge}>{t(RISK_KEYS[command.risk])}</Text>
      <View style={styles.commandCopy}>
        <Text selectable style={styles.commandText}>
          {command.command}
        </Text>
        <Text style={styles.commandReason}>{command.reason}</Text>
      </View>
    </View>
  );
}

function OperatorRoundCard({ round }: { round: TerminalOperatorRound }) {
  const { t } = useTranslation();
  return (
    <View style={styles.round} testID={`terminal-operator-round-${round.round}`}>
      <View style={styles.roundHeader}>
        <Text style={styles.sectionLabel}>
          {t("workspace.terminal.agentPrompt.round", { round: round.round })}
        </Text>
        <Text style={styles.roundStatus}>{t(ROUND_STATUS_KEYS[round.status])}</Text>
      </View>
      <View style={styles.commandList}>
        {round.commands.map((command) => (
          <OperatorCommandRow
            command={command}
            key={`${round.round}:${command.command}:${command.risk}`}
          />
        ))}
      </View>
      {round.output ? (
        <View style={styles.outputBox}>
          <Text selectable style={styles.outputText}>
            {truncateTerminalText(round.output, OUTPUT_PREVIEW_CHARS)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Wide layouts get a floating card anchored over the terminal's bottom-right
 * corner; compact layouts use a bottom sheet so the summary stays reachable
 * with one hand. Approval and cancel stay visible in the footer while the
 * operator is running.
 */
// oxlint-disable-next-line complexity
export function TerminalOperatorPanel({
  run,
  visible,
  modelLabel,
  onApprove,
  onReject,
  onCancel,
  onClose,
}: TerminalOperatorPanelProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const insets = useSafeAreaInsets();
  const busy = run !== null && !isRunFinished(run.stage);
  const canDismiss = run !== null && (isRunFinished(run.stage) || run.stage === "awaiting_user");
  const approvalRound =
    run?.stage === "approval" && run.rounds.length > 0 ? run.rounds[run.rounds.length - 1] : null;

  return (
    <Modal
      animationType="fade"
      onRequestClose={canDismiss ? onClose : undefined}
      statusBarTranslucent
      transparent
      visible={run !== null && visible}
    >
      <View style={[styles.overlay, isCompact ? styles.overlayCompact : styles.overlayWide]}>
        <PressHighlight
          accessibilityLabel={t("workspace.terminal.agentPrompt.close")}
          disabled={!canDismiss}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        {run ? (
          <View
            style={[
              styles.panel,
              isCompact ? styles.panelCompact : styles.panelWide,
              isCompact ? { paddingBottom: Math.max(insets.bottom, 12) } : null,
            ]}
            testID="terminal-operator-panel"
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{t("workspace.terminal.agentPrompt.panelTitle")}</Text>
                <Text numberOfLines={1} style={styles.model}>
                  {modelLabel}
                </Text>
              </View>
              <Button
                accessibilityLabel={t("workspace.terminal.agentPrompt.close")}
                disabled={busy && run.stage !== "awaiting_user"}
                leftIcon={X}
                onPress={onClose}
                size="xs"
                testID="terminal-operator-close"
                variant="ghost"
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.bodyContent}
              style={styles.body}
              testID="terminal-operator-body"
            >
              <View style={styles.requestBlock}>
                <Text style={styles.sectionLabel}>
                  {t("workspace.terminal.agentPrompt.request")}
                </Text>
                <Text selectable style={styles.requestText}>
                  {run.request}
                </Text>
              </View>

              <View style={styles.stageRow}>
                {isStageSpinning(run.stage) ? <ThemedLoadingSpinner size="small" /> : null}
                <Text
                  style={[styles.stageText, run.stage === "error" ? styles.errorText : null]}
                  testID="terminal-operator-stage"
                >
                  {t(STAGE_KEYS[run.stage])}
                </Text>
              </View>

              {run.awaitingInputHint ? (
                <View style={styles.handoffBox} testID="terminal-operator-handoff">
                  <Text style={styles.handoffTitle}>
                    {t("workspace.terminal.agentPrompt.handoffTitle")}
                  </Text>
                  <Text style={styles.handoffText}>{run.awaitingInputHint}</Text>
                </View>
              ) : null}

              {approvalRound ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>
                    {t("workspace.terminal.agentPrompt.approvalTitle")}
                  </Text>
                  <Text style={styles.approvalHint}>
                    {t("workspace.terminal.agentPrompt.approvalHint")}
                  </Text>
                  <View style={styles.approvalActions}>
                    <Button
                      onPress={onApprove}
                      size="xs"
                      testID="terminal-operator-approve"
                      variant="default"
                    >
                      {t("workspace.terminal.agentPrompt.approve")}
                    </Button>
                    <Button
                      onPress={onReject}
                      size="xs"
                      testID="terminal-operator-reject"
                      variant="secondary"
                    >
                      {t("workspace.terminal.agentPrompt.reject")}
                    </Button>
                  </View>
                </View>
              ) : null}

              {run.rounds.map((round) => (
                <OperatorRoundCard key={round.round} round={round} />
              ))}

              {run.error ? (
                <Text style={styles.errorText} testID="terminal-operator-error">
                  {run.error}
                </Text>
              ) : null}

              {run.conclusion ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>
                    {t("workspace.terminal.agentPrompt.conclusion")}
                  </Text>
                  <View style={styles.summaryBox} testID="terminal-operator-summary">
                    <MarkdownRenderer compact={isCompact} text={run.conclusion} />
                  </View>
                </View>
              ) : null}
            </ScrollView>

            {busy ? (
              <View style={styles.footer}>
                <Button
                  onPress={onCancel}
                  size="xs"
                  testID="terminal-operator-cancel"
                  variant="ghost"
                >
                  {t("workspace.terminal.agentPrompt.cancelRun")}
                </Button>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
  },
  overlayWide: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: theme.spacing[4],
  },
  overlayCompact: {
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.38)",
  },
  panel: {
    flexShrink: 1,
    minHeight: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  panelWide: {
    width: 460,
    maxWidth: "92%",
    maxHeight: "64%",
    marginBottom: 84,
    borderRadius: theme.borderRadius.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  panelCompact: {
    width: "100%",
    maxHeight: "78%",
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  model: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  body: {
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  requestBlock: {
    gap: theme.spacing[1],
  },
  requestText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  stageText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  handoffBox: {
    gap: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[3],
  },
  handoffTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  handoffText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  approvalHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  approvalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  round: {
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[3],
  },
  roundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  roundStatus: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  commandList: {
    gap: theme.spacing[1],
  },
  commandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  riskBadge: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textTransform: "uppercase",
  },
  commandCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  commandText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  commandReason: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  outputBox: {
    maxHeight: 170,
    overflow: "hidden",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[2],
  },
  outputText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  summaryBox: {
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[3],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
}));
