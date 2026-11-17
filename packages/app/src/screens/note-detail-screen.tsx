import { useCallback, useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { StackScreenHeader } from "@/components/headers/stack-screen-header";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  NoteDetailContent,
  NoteDetailHeaderActions,
  useNoteDetailController,
} from "@/notes/note-detail-content";
import { findNoteById, noteDisplayTitle, type HostNote } from "@/notes/notes-model";
import { useNotesList } from "@/notes/use-notes";
import type { Theme } from "@/styles/theme";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

export function NoteDetailScreen(): ReactElement {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ noteId?: string }>();
  const noteId = typeof params.noteId === "string" ? params.noteId : null;
  const { notes, isLoading } = useNotesList();
  const note = findNoteById(notes, noteId);

  let body: ReactElement;
  if (isLoading) {
    body = (
      <>
        <StackScreenHeader title={t("notes.title")} />
        <View style={styles.centered}>
          <ThemedLoadingSpinner size="large" uniProps={mutedColorMapping} />
        </View>
      </>
    );
  } else if (!note) {
    body = (
      <>
        <StackScreenHeader title={t("notes.title")} />
        <View style={styles.centered}>
          <Text style={styles.mutedText}>{t("notes.missing")}</Text>
        </View>
      </>
    );
  } else {
    body = <LoadedNoteDetail key={note.noteId} note={note} />;
  }

  return (
    <View style={styles.container} testID="note-detail-screen">
      {body}
    </View>
  );
}

function LoadedNoteDetail({ note }: { note: HostNote }): ReactElement | null {
  const handleDeleted = useCallback(() => router.back(), []);
  const controller = useNoteDetailController({ note, onDeleted: handleDeleted });
  const headerActions = useMemo(
    () => (controller ? <NoteDetailHeaderActions controller={controller} /> : null),
    [controller],
  );
  if (!controller) return null;

  return (
    <>
      <StackScreenHeader title={noteDisplayTitle(note)} rightContent={headerActions} />
      <NoteDetailContent note={note} controller={controller} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
}));
