/* oxlint-disable react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- The editor is a one-off full-screen surface with DOM drawing controls. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { persistAttachmentFromBlob } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import { clampCropRect, cropDisplayRectToSource, type CropRect } from "./model";
import type { ScreenshotEditorProps } from "./editor.impl";

type Tool = "pen" | "rectangle" | "arrow" | "text";
interface Point {
  x: number;
  y: number;
}
type Shape =
  | { type: "pen"; points: Point[]; color: string; width: number }
  | { type: "rectangle"; start: Point; end: Point; color: string; width: number }
  | { type: "arrow"; start: Point; end: Point; color: string; width: number }
  | { type: "text"; position: Point; text: string; color: string };
interface Size {
  width: number;
  height: number;
}
interface TextDraft {
  position: Point;
  value: string;
}

const COLORS = ["#ff4d4f", "#faad14", "#52c41a", "#1677ff", "#ffffff"] as const;
const MIN_CROP_SIZE = 24;
const STROKE_WIDTH = 5;
const TEXT_SIZE = 24;
const UI = {
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    color: "#111",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    minHeight: 56,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    borderBottom: "1px solid #eee",
  },
  iconButton: {
    width: 36,
    height: 36,
    border: 0,
    borderRadius: 18,
    background: "transparent",
    cursor: "pointer",
    fontSize: 22,
  },
  title: { flex: 1, fontSize: 16, fontWeight: 500 },
  send: {
    border: 0,
    borderRadius: 18,
    padding: "8px 14px",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 500,
  },
  workspace: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#111",
    overflow: "hidden",
  },
  canvasWrap: { position: "relative", overflow: "hidden", background: "#000" },
  canvas: { display: "block", width: "100%", height: "100%", touchAction: "none" },
  textEditor: {
    position: "absolute",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 4,
    border: "1px solid #d4d4d8",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 4px 18px rgba(0,0,0,.24)",
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    height: 34,
    boxSizing: "border-box",
    padding: "0 8px",
    border: "1px solid #e4e4e7",
    borderRadius: 6,
    outline: "none",
    color: "#111",
    background: "#fff",
    fontSize: 14,
  },
  textAdd: {
    width: 34,
    height: 34,
    flex: "0 0 auto",
    border: 0,
    borderRadius: 6,
    background: "#f4f4f5",
    color: "#111",
    cursor: "pointer",
    fontSize: 18,
  },
  tools: {
    minHeight: 52,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "0 12px",
  },
  tool: {
    width: 40,
    height: 40,
    border: 0,
    borderRadius: 8,
    background: "transparent",
    cursor: "pointer",
    fontSize: 18,
  },
  active: { background: "#eee" },
  colors: { display: "flex", justifyContent: "center", gap: 12, padding: "0 0 12px" },
  color: {
    width: 24,
    height: 24,
    borderRadius: 12,
    border: "2px solid transparent",
    cursor: "pointer",
    padding: 0,
  },
  colorActive: { borderColor: "#111" },
  cropMask: { position: "absolute", background: "rgba(0,0,0,.52)" },
  cropFrame: { position: "absolute", border: "2px solid #fff", boxSizing: "border-box" },
  cropHandle: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    background: "#fff",
    border: "2px solid #111",
    boxSizing: "border-box",
    cursor: "nwse-resize",
    touchAction: "none",
  },
  cropActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    borderTop: "1px solid #eee",
  },
  cropHint: { flex: 1, color: "#71717a", fontSize: 13 },
  secondary: {
    border: 0,
    background: "transparent",
    color: "#71717a",
    cursor: "pointer",
    padding: "8px",
  },
  primary: {
    border: 0,
    borderRadius: 18,
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    padding: "8px 14px",
  },
  error: { color: "#b91c1c", fontSize: 13, textAlign: "center", padding: 8 },
  loading: { color: "#aaa", fontSize: 13 },
} as const;

function distance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  width: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(10, Math.min(22, distance(start, end) * 0.22));
  const spread = Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - spread), end.y - head * Math.sin(angle - spread));
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle + spread), end.y - head * Math.sin(angle + spread));
  ctx.stroke();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  if (shape.type === "pen") {
    if (shape.points.length === 0) return;
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(shape.points[0]?.x ?? 0, shape.points[0]?.y ?? 0);
    for (const point of shape.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  } else if (shape.type === "rectangle") {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    const x = Math.min(shape.start.x, shape.end.x);
    const y = Math.min(shape.start.y, shape.end.y);
    ctx.strokeRect(
      x,
      y,
      Math.abs(shape.end.x - shape.start.x),
      Math.abs(shape.end.y - shape.start.y),
    );
  } else if (shape.type === "arrow") {
    drawArrow(ctx, shape.start, shape.end, shape.color, shape.width);
  } else {
    ctx.fillStyle = shape.color;
    ctx.font = `600 ${TEXT_SIZE}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(shape.text, shape.position.x, shape.position.y);
  }
}

function pointFromPointer(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

export function ScreenshotEditor({
  sourceUri: initialSourceUri,
  onCancel,
  onComplete,
}: ScreenshotEditorProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceUri, setSourceUri] = useState(initialSourceUri);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<Size | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef<Shape | null>(null);
  const cropDragRef = useRef<{ corner: string; rect: CropRect; x: number; y: number } | null>(null);

  useEffect(() => {
    let disposed = false;
    const image = new Image();
    const handleLoad = () => {
      if (disposed) return;
      const maxWidth = Math.max(240, window.innerWidth - 32);
      const maxHeight = Math.max(220, window.innerHeight - 230);
      const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      const size = {
        width: Math.max(1, Math.floor(image.naturalWidth * scale)),
        height: Math.max(1, Math.floor(image.naturalHeight * scale)),
      };
      setSourceImage(image);
      imageRef.current = image;
      setCanvasSize(size);
    };
    const handleError = () => setErrorMessage(t("screenshot.errors.load"));
    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
    image.src = sourceUri;
    return () => {
      disposed = true;
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
  }, [sourceUri, t]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = sourceImage;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const shape of shapes) drawShape(context, shape);
    if (draftShape) drawShape(context, draftShape);
  }, [draftShape, shapes, sourceImage]);

  useEffect(() => {
    if (!canvasSize || !canvasRef.current) return;
    canvasRef.current.width = canvasSize.width;
    canvasRef.current.height = canvasSize.height;
  }, [canvasSize]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canvasSize || cropRect || processing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointFromPointer(event, canvas);
    if (tool === "text") {
      event.preventDefault();
      setTextDraft({
        position: {
          x: Math.min(Math.max(8, point.x), Math.max(8, canvasSize.width - 240)),
          y: Math.min(Math.max(8, point.y), Math.max(8, canvasSize.height - 56)),
        },
        value: "",
      });
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    let next: Shape;
    if (tool === "pen") {
      next = { type: "pen", points: [point], color, width: STROKE_WIDTH };
    } else if (tool === "rectangle") {
      next = { type: "rectangle", start: point, end: point, color, width: STROKE_WIDTH };
    } else {
      next = { type: "arrow", start: point, end: point, color, width: STROKE_WIDTH };
    }
    draftRef.current = next;
    setDraftShape(next);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = draftRef.current;
    const canvas = canvasRef.current;
    if (!current || !canvas) return;
    const point = pointFromPointer(event, canvas);
    let next: Shape;
    if (current.type === "pen") {
      next = { ...current, points: [...current.points, point] };
    } else if (current.type === "rectangle" || current.type === "arrow") {
      next = { ...current, end: point };
    } else {
      return;
    }
    draftRef.current = next;
    setDraftShape(next);
  };

  const finishDrawing = () => {
    const current = draftRef.current;
    if (current) setShapes((previous) => [...previous, current]);
    draftRef.current = null;
    setDraftShape(null);
  };

  const commitText = () => {
    if (!textDraft) return;
    const text = (textInputRef.current?.value ?? textDraft.value).trim();
    if (text) {
      setShapes((previous) => [
        ...previous,
        { type: "text", position: textDraft.position, text, color },
      ]);
    }
    setTextDraft(null);
  };

  const selectTool = (nextTool: Tool) => {
    commitText();
    setTool(nextTool);
  };

  const beginCrop = () => {
    if (!canvasSize) return;
    commitText();
    const inset = Math.min(canvasSize.width, canvasSize.height) * 0.08;
    setCropRect({
      x: inset,
      y: inset,
      width: Math.max(MIN_CROP_SIZE, canvasSize.width - inset * 2),
      height: Math.max(MIN_CROP_SIZE, canvasSize.height - inset * 2),
    });
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLDivElement>, corner: string) => {
    if (!cropRect) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    cropDragRef.current = { corner, rect: cropRect, x: event.clientX, y: event.clientY };
  };

  const moveCropHandle = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || !canvasSize) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const start = drag.rect;
    const left = drag.corner === "tl" || drag.corner === "bl";
    const top = drag.corner === "tl" || drag.corner === "tr";
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;
    if (left) {
      x = Math.min(start.x + dx, start.x + start.width - MIN_CROP_SIZE);
      width = start.width + start.x - x;
    } else {
      width = start.width + dx;
    }
    if (top) {
      y = Math.min(start.y + dy, start.y + start.height - MIN_CROP_SIZE);
      height = start.height + start.y - y;
    } else {
      height = start.height + dy;
    }
    setCropRect(clampCropRect({ x, y, width, height }, canvasSize, MIN_CROP_SIZE));
    drag.rect = { x, y, width, height };
    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const applyCrop = async () => {
    if (!cropRect || !canvasSize || !sourceImage || processing) return;
    setProcessing(true);
    setErrorMessage(null);
    const context = ImageManipulator.manipulate(sourceUri);
    let rendered: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    try {
      const sourceCrop = cropDisplayRectToSource(cropRect, canvasSize, {
        width: sourceImage.naturalWidth,
        height: sourceImage.naturalHeight,
      });
      context.crop(sourceCrop);
      rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.PNG });
      setSourceUri(result.uri);
      setCropRect(null);
      setShapes([]);
      setDraftShape(null);
      setTextDraft(null);
      draftRef.current = null;
    } catch {
      setErrorMessage(t("screenshot.errors.crop"));
    } finally {
      rendered?.release();
      context.release();
      setProcessing(false);
    }
  };

  const send = async () => {
    const canvas = canvasRef.current;
    if (!canvas || processing || cropRect || textDraft) return;
    setProcessing(true);
    setErrorMessage(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 1),
      );
      if (!blob) throw new Error("Canvas export failed.");
      const attachment: AttachmentMetadata = await persistAttachmentFromBlob({
        blob,
        mimeType: "image/png",
        fileName: `paseo-screenshot-${Date.now()}.png`,
      });
      await onComplete(attachment);
    } catch {
      setErrorMessage(t("screenshot.errors.save"));
      setProcessing(false);
    }
  };

  return (
    <div style={UI.page} data-testid="screenshot-editor">
      <div style={UI.header}>
        <button
          type="button"
          style={UI.iconButton}
          aria-label={t("common.actions.cancel")}
          onClick={onCancel}
          data-testid="screenshot-editor-cancel"
        >
          ×
        </button>
        <div style={UI.title}>{t("screenshot.editorTitle")}</div>
        <button
          type="button"
          style={UI.send}
          onClick={() => void send()}
          disabled={processing || Boolean(cropRect) || Boolean(textDraft)}
          data-testid="screenshot-editor-send"
        >
          {t("screenshot.send")}
        </button>
      </div>
      <div style={UI.workspace}>
        {!canvasSize ? (
          <div style={UI.loading}>{t("screenshot.loading")}</div>
        ) : (
          <div style={{ ...UI.canvasWrap, width: canvasSize.width, height: canvasSize.height }}>
            <canvas
              ref={canvasRef}
              data-testid="screenshot-canvas"
              style={UI.canvas}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrawing}
              onPointerCancel={finishDrawing}
            />
            {textDraft ? (
              <div
                style={{
                  ...UI.textEditor,
                  left: Math.min(
                    Math.max(8, textDraft.position.x),
                    Math.max(8, canvasSize.width - 248),
                  ),
                  top: Math.min(
                    Math.max(8, textDraft.position.y),
                    Math.max(8, canvasSize.height - 52),
                  ),
                  width: Math.min(240, Math.max(160, canvasSize.width - 16)),
                }}
              >
                <input
                  autoFocus
                  aria-label={t("screenshot.textPlaceholder")}
                  data-testid="screenshot-text-input"
                  maxLength={200}
                  ref={textInputRef}
                  onChange={(event) =>
                    setTextDraft((current) =>
                      current ? { ...current, value: event.target.value } : current,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitText();
                    if (event.key === "Escape") setTextDraft(null);
                  }}
                  placeholder={t("screenshot.textPlaceholder")}
                  style={UI.textInput}
                  value={textDraft.value}
                />
                <button
                  type="button"
                  aria-label={t("common.actions.confirm")}
                  data-testid="screenshot-text-add"
                  onClick={commitText}
                  onPointerDown={() => textInputRef.current?.blur()}
                  style={UI.textAdd}
                >
                  ✓
                </button>
              </div>
            ) : null}
            {cropRect ? (
              <>
                <div style={{ ...UI.cropMask, left: 0, top: 0, right: 0, height: cropRect.y }} />
                <div
                  style={{
                    ...UI.cropMask,
                    left: 0,
                    top: cropRect.y + cropRect.height,
                    right: 0,
                    bottom: 0,
                  }}
                />
                <div
                  style={{
                    ...UI.cropMask,
                    left: 0,
                    top: cropRect.y,
                    width: cropRect.x,
                    height: cropRect.height,
                  }}
                />
                <div
                  style={{
                    ...UI.cropMask,
                    right: 0,
                    top: cropRect.y,
                    width: canvasSize.width - cropRect.x - cropRect.width,
                    height: cropRect.height,
                  }}
                />
                <div
                  style={{
                    ...UI.cropFrame,
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                />
                {(["tl", "tr", "bl", "br"] as const).map((corner) => {
                  const left = corner === "tl" || corner === "bl";
                  const top = corner === "tl" || corner === "tr";
                  return (
                    <div
                      key={corner}
                      style={{
                        ...UI.cropHandle,
                        left: left ? cropRect.x - 12 : cropRect.x + cropRect.width - 12,
                        top: top ? cropRect.y - 12 : cropRect.y + cropRect.height - 12,
                      }}
                      onPointerDown={(event) => beginCropDrag(event, corner)}
                      onPointerMove={moveCropHandle}
                      onPointerUp={() => {
                        cropDragRef.current = null;
                      }}
                    />
                  );
                })}
              </>
            ) : null}
          </div>
        )}
      </div>
      {cropRect ? (
        <div style={UI.cropActions}>
          <div style={UI.cropHint}>{t("screenshot.cropHint")}</div>
          <button type="button" style={UI.secondary} onClick={() => setCropRect(null)}>
            {t("common.actions.cancel")}
          </button>
          <button
            type="button"
            style={UI.primary}
            onClick={() => void applyCrop()}
            data-testid="screenshot-editor-apply-crop"
          >
            {t("screenshot.applyCrop")}
          </button>
        </div>
      ) : (
        <>
          <div style={UI.tools}>
            <button
              type="button"
              style={UI.tool}
              title={t("screenshot.tools.crop")}
              onClick={beginCrop}
              data-testid="screenshot-tool-crop"
            >
              ⌗
            </button>
            <button
              type="button"
              style={{ ...UI.tool, ...(tool === "pen" ? UI.active : {}) }}
              title={t("screenshot.tools.pen")}
              onClick={() => selectTool("pen")}
              data-testid="screenshot-tool-pen"
            >
              ✎
            </button>
            <button
              type="button"
              style={{ ...UI.tool, ...(tool === "rectangle" ? UI.active : {}) }}
              title={t("screenshot.tools.rectangle")}
              onClick={() => selectTool("rectangle")}
              data-testid="screenshot-tool-rectangle"
            >
              □
            </button>
            <button
              type="button"
              style={{ ...UI.tool, ...(tool === "arrow" ? UI.active : {}) }}
              title={t("screenshot.tools.arrow")}
              onClick={() => selectTool("arrow")}
              data-testid="screenshot-tool-arrow"
            >
              ↗
            </button>
            <button
              type="button"
              style={{ ...UI.tool, ...(tool === "text" ? UI.active : {}) }}
              title={t("screenshot.tools.text")}
              onClick={() => selectTool("text")}
              data-testid="screenshot-tool-text"
            >
              T
            </button>
            <span style={{ width: 1, height: 22, background: "#ddd", margin: "0 4px" }} />
            <button
              type="button"
              style={UI.tool}
              title={t("screenshot.tools.undo")}
              onClick={() => setShapes((current) => current.slice(0, -1))}
              disabled={shapes.length === 0}
              data-testid="screenshot-tool-undo"
            >
              ↶
            </button>
            <button
              type="button"
              style={UI.tool}
              title={t("screenshot.tools.reset")}
              onClick={() => {
                setShapes([]);
                setDraftShape(null);
                setTextDraft(null);
                draftRef.current = null;
              }}
              disabled={shapes.length === 0}
              data-testid="screenshot-tool-reset"
            >
              ↺
            </button>
          </div>
          <div style={UI.colors}>
            {COLORS.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-label={t("screenshot.tools.color")}
                style={{
                  ...UI.color,
                  background: entry,
                  ...(color === entry ? UI.colorActive : {}),
                }}
                onClick={() => setColor(entry)}
              />
            ))}
          </div>
        </>
      )}
      {errorMessage ? <div style={UI.error}>{errorMessage}</div> : null}
    </div>
  );
}

export type { ScreenshotEditorProps };
