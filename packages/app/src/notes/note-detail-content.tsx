import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { Button } from "@/components/ui/button";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import { NoteLinksSection } from "./note-links-section";
import type { HostNote } from "./notes-model";
import { useNoteActions } from "./use-notes";

export interface NoteDetailController {
  isEditing: boolean;
  isSaving: boolean;
  draftTitle: string;
  draftText: string;
  draftComment: string;
  editorSeed: number;
  setDraftTitle: (value: string) => void;
  setDraftText: (value: string) => void;
  setDraftComment: (value: string) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  save: () => void;
  delete: () => void;
}

export function useNoteDetailController(input: {
  note: HostNote | null;
  onDeleted: () => void;
}): NoteDetailController | null {
  const { note, onDeleted } = input;
  const { t } = useTranslation();
  const toast = useToast();
  const actions = useNoteActions(note?.serverId ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(note?.title ?? "");
  const [draftText, setDraftText] = useState(note?.text ?? "");
  const [draftComment, setDraftComment] = useState(note?.comment ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [editorSeed, setEditorSeed] = useState(0);
  const previousNoteId = useRef(note?.noteId);

  useEffect(() => {
    if (previousNoteId.current === note?.noteId) return;
    previousNoteId.current = note?.noteId;
    setIsEditing(false);
    setDraftTitle(note?.title ?? "");
    setDraftText(note?.text ?? "");
    setDraftComment(note?.comment ?? "");
  }, [note?.comment, note?.noteId, note?.text, note?.title]);

  useEffect(() => {
    if (isEditing) return;
    setDraftTitle(note?.title ?? "");
    setDraftText(note?.text ?? "");
    setDraftComment(note?.comment ?? "");
  }, [isEditing, note?.comment, note?.text, note?.title]);

  const startEditing = useCallback(() => {
    if (!note) return;
    setDraftTitle(note.title ?? "");
    setDraftText(note.text);
    setDraftComment(note.comment ?? "");
    setEditorSeed((seed) => seed + 1);
    setIsEditing(true);
  }, [note]);

  const cancelEditing = useCallback(() => setIsEditing(false), []);

  const save = useCallback(() => {
    if (!note) return;
    void (async () => {
      try {
        setIsSaving(true);
        await actions.updateNote(note, {
          title: draftTitle.trim().length > 0 ? draftTitle.trim() : null,
          text: draftText,
          comment: draftComment.trim().length > 0 ? draftComment.trim() : null,
        });
        toast.show(t("notes.bodySaved"), { variant: "success" });
        setIsEditing(false);
      } catch {
        toast.error(t("notes.bodySaveFailed"));
      } finally {
        setIsSaving(false);
      }
    })();
  }, [actions, draftComment, draftText, draftTitle, note, t, toast]);

  const deleteNote = useCallback(() => {
    if (!note) return;
    void confirmDialog({
      title: t("notes.deleteNote"),
      message: t("notes.deleteNoteConfirm"),
      confirmLabel: t("notes.deleteNote"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    }).then((confirmed) => {
      if (!confirmed) return undefined;
      return actions
        .deleteNote(note)
        .then(onDeleted)
        .catch(() => toast.error(t("notes.deleteNoteFailed")));
    });
  }, [actions, note, onDeleted, t, toast]);

  if (!note) return null;

  return {
    isEditing,
    isSaving,
    draftTitle,
    draftText,
    draftComment,
    editorSeed,
    setDraftTitle,
    setDraftText,
    setDraftComment,
    startEditing,
    cancelEditing,
    save,
    delete: deleteNote,
  };
}

export function NoteDetailHeaderActions({
  controller,
}: {
  controller: NoteDetailController;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.headerActions}>
      {controller.isEditing ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={controller.cancelEditing}
          disabled={controller.isSaving}
        >
          {t("common.actions.cancel")}
        </Button>
      ) : null}
      <Button
        variant="default"
        size="sm"
        onPress={controller.isEditing ? controller.save : controller.startEditing}
        disabled={controller.isSaving}
        testID={controller.isEditing ? "note-save" : "note-edit"}
      >
        {controller.isEditing ? t("notes.saveBody") : t("notes.editBody")}
      </Button>
    </View>
  );
}

export function NoteDetailContent({
  note,
  controller,
}: {
  note: HostNote;
  controller: NoteDetailController;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="note-detail-scroll"
    >
      {controller.isEditing ? (
        <View style={styles.editor}>
          <AdaptiveTextInput
            initialValue={controller.draftTitle}
            resetKey={`title-${controller.editorSeed}`}
            onChangeText={controller.setDraftTitle}
            placeholder={t("notes.titlePlaceholder")}
            editable={!controller.isSaving}
            style={styles.titleInput}
            testID="note-title-input"
          />
          <AdaptiveTextInput
            initialValue={controller.draftText}
            resetKey={`text-${controller.editorSeed}`}
            onChangeText={controller.setDraftText}
            multiline
            editable={!controller.isSaving}
            style={styles.textInput}
            testID="note-text-input"
          />
          <AdaptiveTextInput
            initialValue={controller.draftComment}
            resetKey={`comment-${controller.editorSeed}`}
            onChangeText={controller.setDraftComment}
            placeholder={t("notes.addEntryPlaceholder")}
            multiline
            editable={!controller.isSaving}
            style={styles.commentInput}
            testID="note-comment-input"
          />
        </View>
      ) : (
        <View style={styles.viewer}>
          {note.title ? <Text style={styles.title}>{note.title}</Text> : null}
          <MarkdownRenderer text={note.text} />
          <NoteLinksSection text={note.text} />
          {note.comment ? <Text style={styles.comment}>{note.comment}</Text> : null}
          <NoteMetadata note={note} />
        </View>
      )}
      {controller.isEditing ? null : (
        <Button
          variant="outline"
          size="sm"
          leftIcon={Trash2}
          onPress={controller.delete}
          style={styles.deleteRow}
          accessibilityRole="button"
          accessibilityLabel={t("notes.deleteNote")}
          testID="note-delete"
        >
          {t("notes.deleteNote")}
        </Button>
      )}
      {controller.isEditing ? <NoteDetailHeaderActions controller={controller} /> : null}
    </ScrollView>
  );
}

function NoteMetadata({ note }: { note: HostNote }): ReactElement {
  const createdLabel = useCompactTimeAgo(new Date(note.createdAt));
  const updatedLabel = useCompactTimeAgo(new Date(note.updatedAt));
  return (
    <Text style={styles.metadata}>
      {note.projectName} · {note.hostLabel} · {createdLabel} → {updatedLabel}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: {
      xs: theme.spacing[4],
      md: theme.spacing[8],
    },
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[3],
  },
  viewer: {
    gap: theme.spacing[3],
  },
  editor: {
    gap: theme.spacing[2],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: "600",
  },
  comment: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontStyle: "italic",
  },
  metadata: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    opacity: 0.85,
    marginTop: theme.spacing[2],
  },
  titleInput: {
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.base,
  },
  textInput: {
    minHeight: 220,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.base,
  },
  commentInput: {
    minHeight: 72,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.base,
  },
  deleteRow: {
    alignSelf: "flex-start",
    marginTop: theme.spacing[4],
  },
}));
