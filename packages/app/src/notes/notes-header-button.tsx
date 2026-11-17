import { useCallback, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { NotebookPen } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
} from "@/components/ui/icon-button-chrome";
import { useToast } from "@/contexts/toast-context";
import { useHostFeature } from "@/runtime/host-features";
import { NotesCaptureProvider } from "./capture-context";
import { ProjectNotesDialog } from "./project-notes-dialog";

const ThemedNotebookPen = withUnistyles(NotebookPen);

/**
 * The workspace header's notes action. The project list is preloaded in a
 * dialog-owned query while the header is mounted, so opening it does not
 * remount the workspace route or wait for a fresh notes.list round trip.
 */
export function NotesHeaderButton({
  serverId,
  projectId,
  projectName,
}: {
  serverId: string;
  projectId: string;
  projectName: string;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const supportsNotes = useHostFeature(serverId, "notesPerEntry");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handlePress = useCallback(() => {
    if (!supportsNotes) {
      toast.show(t("notes.hostUpgrade", { host: serverId }), { variant: "warning" });
      return;
    }
    setIsDialogOpen(true);
  }, [serverId, supportsNotes, t, toast]);

  const handleClose = useCallback(() => setIsDialogOpen(false), []);

  return (
    <>
      <HeaderToggleButton
        testID="workspace-notes-button"
        onPress={handlePress}
        tooltipLabel={t("notes.title")}
        tooltipKeys={[]}
        tooltipSide="left"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("notes.title")}
      >
        <ThemedNotebookPen
          size={iconButtonChromeGlyphSize("large")}
          strokeWidth={1.5}
          uniProps={extraMutedIconColorMapping}
        />
      </HeaderToggleButton>
      {supportsNotes ? (
        <NotesCaptureProvider serverId={serverId} projectId={projectId}>
          <ProjectNotesDialog
            visible={isDialogOpen}
            onClose={handleClose}
            serverId={serverId}
            projectId={projectId}
            projectName={projectName}
          />
        </NotesCaptureProvider>
      ) : null}
    </>
  );
}
