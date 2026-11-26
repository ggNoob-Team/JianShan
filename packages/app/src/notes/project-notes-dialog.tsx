import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  AdaptiveModalSheet,
  SheetHeaderIconButton,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { FlatList } from "@/components/ui/scroll-view";
import type { Theme } from "@/styles/theme";
import { AddNoteButton } from "./add-note-button";
import { useNotesCaptureContextBridge } from "./capture-context";
import {
  NoteDetailContent,
  NoteDetailHeaderActions,
  useNoteDetailController,
} from "./note-detail-content";
import { NoteListRow } from "./note-list-row";
import { noteDisplayTitle, type HostNote } from "./notes-model";
import { useNotesList } from "./use-notes";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

export interface ProjectNotesDialogProps {
  visible: boolean;
  onClose: () => void;
  serverId: string;
  projectId: string;
  projectName: string;
}

/**
 * The workspace header's notes surface. It stays mounted while closed so its
 * scoped query can preload the project list into the shared React Query cache;
 * opening the dialog then never waits for a route transition or a fresh list.
 */
export function ProjectNotesDialog({
  visible,
  onClose,
  serverId,
  projectId,
  projectName,
}: ProjectNotesDialogProps): ReactElement {
  const { t } = useTranslation();
  const contextBridge = useNotesCaptureContextBridge();
  const { notes, isLoading, isRefreshing, error, refresh } = useNotesList({ serverId });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const projectNotes = useMemo(
    () => notes.filter((note) => note.projectId === projectId),
    [notes, projectId],
  );
  const selectedNote = projectNotes.find((note) => note.noteId === selectedNoteId) ?? null;

  const handleClose = useCallback(() => {
    setSelectedNoteId(null);
    onClose();
  }, [onClose]);

  const handleBackToList = useCallback(() => {
    setSelectedNoteId(null);
  }, []);

  const handleOpenNote = useCallback((note: HostNote) => {
    setSelectedNoteId(note.noteId);
  }, []);

  const detailController = useNoteDetailController({
    note: selectedNote,
    onDeleted: handleBackToList,
  });

  useEffect(() => {
    if (!visible) setSelectedNoteId(null);
  }, [visible]);

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const header = useMemo<SheetHeader>(() => {
    if (selectedNote && detailController) {
      return {
        title: noteDisplayTitle(selectedNote),
        subtitle: projectName ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {projectName}
          </Text>
        ) : undefined,
        back: {
          onPress: handleBackToList,
          accessibilityLabel: t("common.actions.back"),
        },
        actions: <NoteDetailHeaderActions controller={detailController} />,
      };
    }

    return {
      title: t("notes.title"),
      subtitle: projectName ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {projectName}
        </Text>
      ) : undefined,
      actions: (
        <SheetHeaderIconButton
          icon={RotateCw}
          label={isRefreshing ? t("notes.refreshing") : t("notes.refresh")}
          onPress={handleRefresh}
          busy={isRefreshing}
          testID="project-notes-refresh"
        />
      ),
    };
  }, [
    detailController,
    handleBackToList,
    handleRefresh,
    isRefreshing,
    projectName,
    selectedNote,
    t,
  ]);

  const footer = useMemo(() => (selectedNote ? undefined : <AddNoteButton />), [selectedNote]);
  const renderItem = useCallback(
    ({ item }: { item: HostNote }) => <NoteListRow note={item} onOpen={handleOpenNote} />,
    [handleOpenNote],
  );

  let content: ReactElement;
  if (selectedNote && detailController) {
    content = (
      <View style={styles.detail} testID="project-notes-detail">
        <NoteDetailContent note={selectedNote} controller={detailController} />
      </View>
    );
  } else if (isLoading) {
    content = (
      <View style={styles.centered}>
        <ThemedLoadingSpinner size="large" uniProps={mutedColorMapping} />
      </View>
    );
  } else if (error && projectNotes.length === 0) {
    content = (
      <View style={styles.centered} testID="project-notes-error">
        <Text style={styles.emptyTitle}>{t("notes.loadFailed")}</Text>
        {error.message ? <Text style={styles.emptyDescription}>{error.message}</Text> : null}
        <Button
          variant="secondary"
          size="sm"
          leftIcon={RotateCw}
          onPress={handleRefresh}
          loading={isRefreshing}
          testID="project-notes-retry"
        >
          {t("common.actions.retry")}
        </Button>
      </View>
    );
  } else {
    content = (
      <View style={styles.body}>
        {error ? (
          <View style={styles.errorBanner} testID="project-notes-refresh-error">
            <View style={styles.errorTextGroup}>
              <Text style={styles.errorTitle}>{t("notes.loadFailed")}</Text>
              {error.message ? <Text style={styles.errorMessage}>{error.message}</Text> : null}
            </View>
            <Button
              variant="ghost"
              size="xs"
              leftIcon={RotateCw}
              onPress={handleRefresh}
              loading={isRefreshing}
            >
              {t("common.actions.retry")}
            </Button>
          </View>
        ) : null}
        {projectNotes.length === 0 ? (
          <View style={styles.centered} testID="project-notes-empty">
            <Text style={styles.emptyTitle}>{t("notes.projectEmptyTitle")}</Text>
            <Text style={styles.emptyDescription}>{t("notes.projectEmptyDescription")}</Text>
          </View>
        ) : (
          <FlatList
            data={projectNotes}
            keyExtractor={projectNoteKey}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator
            testID="project-notes-list"
          />
        )}
      </View>
    );
  }

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      footer={footer}
      snapPoints={PROJECT_NOTES_SNAP_POINTS}
      desktopMaxWidth={640}
      desktopHeight="85%"
      scrollable={false}
      bodyStyle={styles.dialogBody}
      contentStyle={styles.dialogContent}
      contextBridge={contextBridge}
      testID="project-notes-dialog"
    >
      {content}
    </AdaptiveModalSheet>
  );
}

const PROJECT_NOTES_SNAP_POINTS = ["88%", "96%"];

function projectNoteKey(note: HostNote): string {
  return `${note.serverId}:${note.noteId}`;
}

const styles = StyleSheet.create((theme) => ({
  dialogBody: {
    flex: 1,
    minHeight: 0,
  },
  dialogContent: {
    flex: 1,
    minHeight: 0,
  },
  detail: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    gap: theme.spacing[2],
  },
  centered: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
    maxWidth: 420,
  },
  errorBanner: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
    alignItems: "flex-start",
  },
  errorTextGroup: {
    gap: theme.spacing[1],
  },
  errorTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  errorMessage: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: theme.spacing[3],
  },
}));
