import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import type { AttachmentMetadata } from "@/attachments/types";
import { captureCurrentScreen, isScreenCaptureSupported } from "./screen-capture";
import { ScreenshotEditor } from "./editor";

type ScreenshotCompleteHandler = (attachment: AttachmentMetadata) => Promise<void> | void;

interface ScreenshotCaptureContextValue {
  supported: boolean;
  openScreenshotEditor: (onComplete: ScreenshotCompleteHandler) => void;
}

interface EditorState {
  sourceUri: string;
  onComplete: ScreenshotCompleteHandler;
}

const ScreenshotCaptureContext = createContext<ScreenshotCaptureContextValue | null>(null);

function waitForUiToSettle(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function useScreenshotCapture(): ScreenshotCaptureContextValue | null {
  return useContext(ScreenshotCaptureContext);
}

export function ScreenshotCaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const supported = isScreenCaptureSupported();
  const [capturing, setCapturing] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openScreenshotEditor = useCallback(
    (onComplete: ScreenshotCompleteHandler) => {
      if (!supported || capturing || editor) return;
      setCapturing(true);
      const capture = async () => {
        try {
          await waitForUiToSettle();
          const source = await captureCurrentScreen();
          setEditor({ sourceUri: source.uri, onComplete });
        } catch {
          toast.show(t("screenshot.errors.capture"), { variant: "error" });
        } finally {
          setCapturing(false);
        }
      };
      void capture();
    },
    [capturing, editor, supported, t, toast],
  );

  const value = useMemo(
    () => ({ supported, openScreenshotEditor }),
    [openScreenshotEditor, supported],
  );

  const closeEditor = useCallback(() => setEditor(null), []);

  const completeEditor = useCallback(
    async (attachment: AttachmentMetadata) => {
      const handler = editor?.onComplete;
      setEditor(null);
      await handler?.(attachment);
    },
    [editor],
  );

  return (
    <ScreenshotCaptureContext.Provider value={value}>
      {children}
      {editor ? (
        <ScreenshotEditor
          key={editor.sourceUri}
          sourceUri={editor.sourceUri}
          onCancel={closeEditor}
          onComplete={completeEditor}
        />
      ) : null}
    </ScreenshotCaptureContext.Provider>
  );
}
