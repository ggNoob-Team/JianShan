/* oxlint-disable react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop, react/jsx-max-depth, paseo/no-raw-pressable, react/style-prop-object -- Skia uses string style props; the editor is a one-off full-screen surface. */
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUpRight,
  Check,
  Crop,
  Pencil,
  RotateCcw,
  Square,
  Type as TypeIcon,
  Undo2,
  X,
} from "lucide-react-native";
import { ImageFormat, Skia, useCanvasRef, useImage } from "@shopify/react-native-skia";
import {
  Canvas,
  Image as SkiaImage,
  Paragraph,
  Path,
  Rect as SkiaRect,
} from "@shopify/react-native-skia";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { persistAttachmentFromBytes } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { StyleSheet as UniStyleSheet, withUnistyles } from "react-native-unistyles";
import { clampCropRect, cropDisplayRectToSource, type CropRect, type Size } from "./model";

const TOOL_COLORS = ["#ff4d4f", "#faad14", "#52c41a", "#1677ff", "#ffffff"] as const;
const MIN_CROP_SIZE = 24;
const DEFAULT_STROKE_WIDTH = 5;
const DEFAULT_TEXT_SIZE = 24;

type Tool = "pen" | "rectangle" | "arrow" | "text";
type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
interface Point {
  x: number;
  y: number;
}
type Shape =
  | { type: "pen"; points: Point[]; color: string; strokeWidth: number }
  | { type: "rectangle"; start: Point; end: Point; color: string; strokeWidth: number }
  | { type: "arrow"; start: Point; end: Point; color: string; strokeWidth: number }
  | { type: "text"; position: Point; text: string; color: string };

interface TextDraft {
  position: Point;
  value: string;
}

export interface ScreenshotEditorProps {
  sourceUri: string;
  onCancel: () => void;
  onComplete: (attachment: AttachmentMetadata) => Promise<void> | void;
}

const ThemedArrowUpRight = withUnistyles(ArrowUpRight);
const ThemedCheck = withUnistyles(Check);
const ThemedCrop = withUnistyles(Crop);
const ThemedPencil = withUnistyles(Pencil);
const ThemedRotateCcw = withUnistyles(RotateCcw);
const ThemedSquare = withUnistyles(Square);
const ThemedType = withUnistyles(TypeIcon);
const ThemedUndo2 = withUnistyles(Undo2);
const ThemedX = withUnistyles(X);
const ThemedTextInput = withUnistyles(EditingTextInput, (theme: Theme) => ({
  color: theme.colors.foreground,
  backgroundColor: theme.colors.surface0,
  borderColor: theme.colors.border,
  placeholderTextColor: theme.colors.foregroundMuted,
}));
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundIconMapping = (theme: Theme) => ({ color: theme.colors.foreground });

function fitSizeWithin(source: Size, width: number, height: number): Size {
  const scale = Math.min(width / source.width, height / source.height);
  return {
    width: Math.max(1, Math.floor(source.width * scale)),
    height: Math.max(1, Math.floor(source.height * scale)),
  };
}

function clampPointToCanvas(point: Point, canvas: Size): Point {
  return {
    x: Math.min(canvas.width, Math.max(0, point.x)),
    y: Math.min(canvas.height, Math.max(0, point.y)),
  };
}

function pointFromEvent(event: { x: number; y: number }, canvas: Size): Point {
  return clampPointToCanvas({ x: event.x, y: event.y }, canvas);
}

function makeArrowPath(start: Point, end: Point): ReturnType<typeof Skia.Path.Make> {
  const path = Skia.Path.Make();
  path.moveTo(start.x, start.y);
  path.lineTo(end.x, end.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(
    10,
    Math.min(22, Math.hypot(end.x - start.x, end.y - start.y) * 0.22),
  );
  const headAngle = Math.PI / 6;
  path.moveTo(end.x, end.y);
  path.lineTo(
    end.x - headLength * Math.cos(angle - headAngle),
    end.y - headLength * Math.sin(angle - headAngle),
  );
  path.moveTo(end.x, end.y);
  path.lineTo(
    end.x - headLength * Math.cos(angle + headAngle),
    end.y - headLength * Math.sin(angle + headAngle),
  );
  return path;
}

function makePenPath(points: Point[]): ReturnType<typeof Skia.Path.Make> | null {
  if (points.length === 0) return null;
  const path = Skia.Path.Make();
  path.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);
  for (const point of points.slice(1)) {
    path.lineTo(point.x, point.y);
  }
  return path;
}

function ScreenshotTextShape({
  shape,
  canvasWidth,
}: {
  shape: Extract<Shape, { type: "text" }>;
  canvasWidth: number;
}) {
  const width = Math.max(1, canvasWidth - shape.position.x);
  const paragraph = useMemo(() => {
    const builder = Skia.ParagraphBuilder.Make({ maxLines: 1 })
      .pushStyle({
        fontFamilies: ["sans-serif", "Noto Sans CJK SC", "System"],
        fontSize: DEFAULT_TEXT_SIZE,
        color: Skia.Color(shape.color),
      })
      .addText(shape.text)
      .pop();
    const next = builder.build();
    next.layout(width);
    return next;
  }, [shape.color, shape.text, width]);

  return (
    <Paragraph paragraph={paragraph} x={shape.position.x} y={shape.position.y} width={width} />
  );
}

function renderShape(shape: Shape, index: number, canvasWidth: number) {
  if (shape.type === "pen") {
    const path = makePenPath(shape.points);
    return path ? (
      <Path
        key={index}
        path={path}
        color={shape.color}
        style="stroke"
        strokeWidth={shape.strokeWidth}
        strokeCap="round"
        strokeJoin="round"
      />
    ) : null;
  }

  if (shape.type === "rectangle") {
    const x = Math.min(shape.start.x, shape.end.x);
    const y = Math.min(shape.start.y, shape.end.y);
    return (
      <SkiaRect
        key={index}
        x={x}
        y={y}
        width={Math.abs(shape.end.x - shape.start.x)}
        height={Math.abs(shape.end.y - shape.start.y)}
        color={shape.color}
        style="stroke"
        strokeWidth={shape.strokeWidth}
      />
    );
  }

  if (shape.type === "text") {
    return <ScreenshotTextShape key={index} shape={shape} canvasWidth={canvasWidth} />;
  }

  return (
    <Path
      key={index}
      path={makeArrowPath(shape.start, shape.end)}
      color={shape.color}
      style="stroke"
      strokeWidth={shape.strokeWidth}
      strokeCap="round"
      strokeJoin="round"
    />
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onPress,
  children,
  testID,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.toolButton, active && styles.toolButtonActive, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

function CropHandle({
  corner,
  cropRect,
  canvas,
  onChange,
}: {
  corner: Corner;
  cropRect: CropRect;
  canvas: Size;
  onChange: (rect: CropRect) => void;
}) {
  const currentRect = useRef(cropRect);
  currentRect.current = cropRect;
  const startRect = useRef(cropRect);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRect.current = currentRect.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const start = startRect.current;
          const left = corner === "top-left" || corner === "bottom-left";
          const top = corner === "top-left" || corner === "top-right";
          let x = start.x;
          let y = start.y;
          let width = start.width;
          let height = start.height;

          if (left) {
            x = Math.min(start.x + gesture.dx, start.x + start.width - MIN_CROP_SIZE);
            width = start.width + start.x - x;
          } else {
            width = start.width + gesture.dx;
          }
          if (top) {
            y = Math.min(start.y + gesture.dy, start.y + start.height - MIN_CROP_SIZE);
            height = start.height + start.y - y;
          } else {
            height = start.height + gesture.dy;
          }

          onChange(
            clampCropRect(
              {
                x,
                y,
                width,
                height,
              },
              canvas,
              MIN_CROP_SIZE,
            ),
          );
        },
      }),
    [canvas, corner, onChange],
  );

  const left = corner === "top-left" || corner === "bottom-left";
  const top = corner === "top-left" || corner === "top-right";
  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.cropHandle,
        {
          left: cropRect.x - 12,
          top: cropRect.y - 12,
          ...(left ? {} : { left: cropRect.x + cropRect.width - 12 }),
          ...(top ? {} : { top: cropRect.y + cropRect.height - 12 }),
        },
      ]}
    />
  );
}

function CropOverlay({
  cropRect,
  canvas,
  onChange,
}: {
  cropRect: CropRect;
  canvas: Size;
  onChange: (rect: CropRect) => void;
}) {
  const top = cropRect.y;
  const left = cropRect.x;
  const right = canvas.width - cropRect.x - cropRect.width;
  return (
    <>
      <View style={[styles.cropMask, { top: 0, left: 0, right: 0, height: top }]} />
      <View
        style={[
          styles.cropMask,
          { top: cropRect.y + cropRect.height, left: 0, right: 0, bottom: 0 },
        ]}
      />
      <View
        style={[
          styles.cropMask,
          {
            top: cropRect.y,
            left: 0,
            width: left,
            height: cropRect.height,
          },
        ]}
      />
      <View
        style={[
          styles.cropMask,
          {
            top: cropRect.y,
            right: 0,
            width: right,
            height: cropRect.height,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.cropFrame,
          {
            left: cropRect.x,
            top: cropRect.y,
            width: cropRect.width,
            height: cropRect.height,
          },
        ]}
      />
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => (
        <CropHandle
          key={corner}
          corner={corner}
          cropRect={cropRect}
          canvas={canvas}
          onChange={onChange}
        />
      ))}
    </>
  );
}

export function ScreenshotEditor({
  sourceUri: initialSourceUri,
  onCancel,
  onComplete,
}: ScreenshotEditorProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [sourceUri, setSourceUri] = useState(initialSourceUri);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(TOOL_COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const draftShapeRef = useRef<Shape | null>(null);
  const textInputRef = useRef<EditingTextInputHandle>(null);
  const canvasRef = useCanvasRef();
  const image = useImage(sourceUri, () => setErrorMessage(t("screenshot.errors.load")));
  const imageSize = useMemo<Size | null>(
    () => (image ? { width: image.width(), height: image.height() } : null),
    [image],
  );
  const canvas = useMemo<Size | null>(() => {
    if (!imageSize) return null;
    return fitSizeWithin(
      imageSize,
      Math.max(1, width - 24),
      Math.max(180, height - insets.top - insets.bottom - 230),
    );
  }, [height, imageSize, insets.bottom, insets.top, width]);

  const startShape = useCallback(
    (point: Point) => {
      if (!canvas || cropRect || tool === "text") return;
      let next: Shape;
      if (tool === "pen") {
        next = { type: "pen", points: [point], color, strokeWidth: DEFAULT_STROKE_WIDTH };
      } else if (tool === "rectangle") {
        next = {
          type: "rectangle",
          start: point,
          end: point,
          color,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
      } else {
        next = {
          type: "arrow",
          start: point,
          end: point,
          color,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
      }
      draftShapeRef.current = next;
      setDraftShape(next);
    },
    [canvas, color, cropRect, tool],
  );

  const updateShape = useCallback((point: Point) => {
    const current = draftShapeRef.current;
    if (!current) return;
    let next: Shape;
    if (current.type === "pen") {
      next = { ...current, points: [...current.points, point] };
    } else if (current.type === "rectangle" || current.type === "arrow") {
      next = { ...current, end: point };
    } else {
      return;
    }
    draftShapeRef.current = next;
    setDraftShape(next);
  }, []);

  const finishShape = useCallback(() => {
    const current = draftShapeRef.current;
    if (current) {
      setShapes((previous) => [...previous, current]);
    }
    draftShapeRef.current = null;
    setDraftShape(null);
  }, []);

  const beginText = useCallback(
    (point: Point) => {
      if (!canvas) return;
      setTextDraft({
        position: {
          x: Math.min(Math.max(8, point.x), Math.max(8, canvas.width - 240)),
          y: Math.min(Math.max(8, point.y), Math.max(8, canvas.height - 56)),
        },
        value: "",
      });
    },
    [canvas],
  );

  const commitText = useCallback(() => {
    if (!textDraft) return;
    const text = (textInputRef.current?.getText() ?? textDraft.value).trim();
    if (text) {
      setShapes((previous) => [
        ...previous,
        { type: "text", position: textDraft.position, text, color },
      ]);
    }
    setTextDraft(null);
    Keyboard.dismiss();
  }, [color, textDraft]);

  const selectTool = useCallback(
    (nextTool: Tool) => {
      commitText();
      setTool(nextTool);
    },
    [commitText],
  );

  const drawResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          Boolean(canvas && !cropRect && !processing && !textDraft && tool !== "text"),
        onMoveShouldSetPanResponder: () =>
          Boolean(canvas && !cropRect && !processing && !textDraft && tool !== "text"),
        onPanResponderGrant: (event) => {
          if (!canvas) return;
          startShape(
            pointFromEvent(
              { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
              canvas,
            ),
          );
        },
        onPanResponderMove: (event) => {
          if (!canvas) return;
          updateShape(
            pointFromEvent(
              { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
              canvas,
            ),
          );
        },
        onPanResponderRelease: finishShape,
        onPanResponderTerminate: finishShape,
      }),
    [canvas, cropRect, finishShape, processing, startShape, textDraft, tool, updateShape],
  );

  const beginCrop = useCallback(() => {
    if (!canvas) return;
    commitText();
    const inset = Math.min(canvas.width, canvas.height) * 0.08;
    setCropRect({
      x: inset,
      y: inset,
      width: Math.max(MIN_CROP_SIZE, canvas.width - inset * 2),
      height: Math.max(MIN_CROP_SIZE, canvas.height - inset * 2),
    });
  }, [canvas, commitText]);

  const applyCrop = useCallback(async () => {
    if (!cropRect || !canvas || !imageSize || processing) return;
    setProcessing(true);
    setErrorMessage(null);
    const context = ImageManipulator.manipulate(sourceUri);
    let rendered: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    try {
      const sourceCrop = cropDisplayRectToSource(cropRect, canvas, imageSize);
      context.crop(sourceCrop);
      rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.PNG });
      setSourceUri(result.uri);
      setCropRect(null);
      setShapes([]);
      setDraftShape(null);
      setTextDraft(null);
      draftShapeRef.current = null;
    } catch {
      setErrorMessage(t("screenshot.errors.crop"));
    } finally {
      rendered?.release();
      context.release();
      setProcessing(false);
    }
  }, [canvas, cropRect, imageSize, processing, sourceUri, t]);

  const send = useCallback(async () => {
    if (processing || cropRect || textDraft || !image) return;
    setProcessing(true);
    setErrorMessage(null);
    try {
      const snapshot = canvasRef.current?.makeImageSnapshot();
      if (!snapshot) throw new Error("Canvas is not ready.");
      const bytes = snapshot.encodeToBytes(ImageFormat.PNG);
      const attachment = await persistAttachmentFromBytes({
        bytes,
        mimeType: "image/png",
        fileName: `paseo-screenshot-${Date.now()}.png`,
      });
      await onComplete(attachment);
    } catch {
      setErrorMessage(t("screenshot.errors.save"));
      setProcessing(false);
    }
  }, [canvasRef, cropRect, image, onComplete, processing, t, textDraft]);

  const undo = useCallback(() => {
    setShapes((previous) => previous.slice(0, -1));
  }, []);

  const reset = useCallback(() => {
    setShapes([]);
    setDraftShape(null);
    setTextDraft(null);
    draftShapeRef.current = null;
  }, []);

  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="fullScreen" visible>
      <View
        style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        testID="screenshot-editor"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t("common.actions.cancel")}
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.headerButton}
            testID="screenshot-editor-cancel"
          >
            <ThemedX size={ICON_SIZE.md} uniProps={mutedIconMapping} />
          </Pressable>
          <Text style={styles.title}>{t("screenshot.editorTitle")}</Text>
          <Pressable
            accessibilityLabel={t("screenshot.send")}
            accessibilityRole="button"
            disabled={processing || Boolean(cropRect) || Boolean(textDraft) || !image}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              (processing || Boolean(cropRect) || Boolean(textDraft) || !image) && styles.disabled,
            ]}
            testID="screenshot-editor-send"
          >
            <ThemedCheck size={ICON_SIZE.md} uniProps={foregroundIconMapping} />
            <Text style={styles.sendLabel}>{t("screenshot.send")}</Text>
          </Pressable>
        </View>

        <View style={styles.workspace}>
          {!image || !canvas ? (
            <View style={styles.loading}>
              <ActivityIndicator />
              <Text style={styles.mutedText}>{t("screenshot.loading")}</Text>
            </View>
          ) : (
            <View style={[styles.canvasFrame, { width: canvas.width, height: canvas.height }]}>
              <View
                style={{ width: canvas.width, height: canvas.height }}
                {...drawResponder.panHandlers}
              >
                <Canvas ref={canvasRef} style={{ width: canvas.width, height: canvas.height }}>
                  <SkiaImage
                    image={image}
                    x={0}
                    y={0}
                    width={canvas.width}
                    height={canvas.height}
                    fit="fill"
                  />
                  {shapes.map((shape, index) => renderShape(shape, index, canvas.width))}
                  {draftShape ? renderShape(draftShape, shapes.length, canvas.width) : null}
                </Canvas>
              </View>
              {tool === "text" && !cropRect ? (
                <Pressable
                  accessibilityLabel={t("screenshot.textPlaceholder")}
                  onPress={(event) =>
                    beginText({
                      x: event.nativeEvent.locationX,
                      y: event.nativeEvent.locationY,
                    })
                  }
                  style={styles.textLayer}
                  testID="screenshot-text-layer"
                />
              ) : null}
              {textDraft ? (
                <View
                  style={[
                    styles.textEditor,
                    {
                      left: Math.min(
                        Math.max(8, textDraft.position.x),
                        Math.max(8, canvas.width - 248),
                      ),
                      top: Math.min(
                        Math.max(8, textDraft.position.y),
                        Math.max(8, canvas.height - 56),
                      ),
                      width: Math.min(240, Math.max(160, canvas.width - 16)),
                    },
                  ]}
                >
                  <ThemedTextInput
                    accessibilityLabel={t("screenshot.textPlaceholder")}
                    autoFocus
                    blurOnSubmit
                    initialValue=""
                    maxLength={200}
                    onChangeText={(value) =>
                      setTextDraft((current) => (current ? { ...current, value } : current))
                    }
                    onSubmitEditing={commitText}
                    placeholder={t("screenshot.textPlaceholder")}
                    ref={textInputRef}
                    returnKeyType="done"
                    style={styles.textInput}
                    testID="screenshot-text-input"
                  />
                  <Pressable
                    accessibilityLabel={t("common.actions.confirm")}
                    accessibilityRole="button"
                    onPressIn={() => textInputRef.current?.blur()}
                    onPress={commitText}
                    style={styles.textAddButton}
                    testID="screenshot-text-add"
                  >
                    <ThemedCheck size={ICON_SIZE.sm} uniProps={foregroundIconMapping} />
                  </Pressable>
                </View>
              ) : null}
              {cropRect ? (
                <CropOverlay cropRect={cropRect} canvas={canvas} onChange={setCropRect} />
              ) : null}
            </View>
          )}
        </View>

        {cropRect ? (
          <View style={styles.cropActions}>
            <Text style={styles.cropHint}>{t("screenshot.cropHint")}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCropRect(null)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>{t("common.actions.cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void applyCrop()}
              style={styles.primaryButton}
              testID="screenshot-editor-apply-crop"
            >
              <Text style={styles.primaryLabel}>{t("screenshot.applyCrop")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.toolRow}>
              <ToolButton
                label={t("screenshot.tools.crop")}
                onPress={beginCrop}
                testID="screenshot-tool-crop"
              >
                <ThemedCrop size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
              <ToolButton
                label={t("screenshot.tools.pen")}
                active={tool === "pen"}
                onPress={() => selectTool("pen")}
                testID="screenshot-tool-pen"
              >
                <ThemedPencil size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
              <ToolButton
                label={t("screenshot.tools.rectangle")}
                active={tool === "rectangle"}
                onPress={() => selectTool("rectangle")}
                testID="screenshot-tool-rectangle"
              >
                <ThemedSquare size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
              <ToolButton
                label={t("screenshot.tools.arrow")}
                active={tool === "arrow"}
                onPress={() => selectTool("arrow")}
                testID="screenshot-tool-arrow"
              >
                <ThemedArrowUpRight size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
              <ToolButton
                label={t("screenshot.tools.text")}
                active={tool === "text"}
                onPress={() => selectTool("text")}
                testID="screenshot-tool-text"
              >
                <ThemedType size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
              <View style={styles.toolDivider} />
              <ToolButton
                label={t("screenshot.tools.undo")}
                disabled={shapes.length === 0}
                onPress={undo}
                testID="screenshot-tool-undo"
              >
                <ThemedUndo2 size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
              <ToolButton
                label={t("screenshot.tools.reset")}
                disabled={shapes.length === 0}
                onPress={reset}
                testID="screenshot-tool-reset"
              >
                <ThemedRotateCcw size={ICON_SIZE.md} uniProps={mutedIconMapping} />
              </ToolButton>
            </View>
            <View style={styles.colorRow}>
              {TOOL_COLORS.map((entry) => (
                <Pressable
                  key={entry}
                  accessibilityLabel={t("screenshot.tools.color")}
                  accessibilityRole="button"
                  onPress={() => setColor(entry)}
                  style={[
                    styles.colorButton,
                    { backgroundColor: entry },
                    color === entry && styles.colorButtonActive,
                  ]}
                />
              ))}
            </View>
          </>
        )}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = UniStyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
  },
  title: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  sendButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  sendLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  workspace: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  loading: {
    alignItems: "center",
    gap: theme.spacing[3],
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  canvasFrame: {
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  textLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  textEditor: {
    position: "absolute",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    padding: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    zIndex: 2,
  },
  textInput: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.fontSize.base,
  },
  textAddButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface3,
  },
  cropMask: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.52)",
  },
  cropFrame: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "transparent",
  },
  cropHandle: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#111111",
  },
  cropActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  cropHint: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  primaryButton: {
    paddingHorizontal: theme.spacing[3],
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foreground,
  },
  primaryLabel: {
    color: theme.colors.surface0,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  secondaryButton: {
    paddingHorizontal: theme.spacing[2],
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  toolRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  toolButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  toolButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  toolDivider: {
    width: theme.borderWidth[1],
    height: 22,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing[1],
  },
  colorRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
  colorButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorButtonActive: {
    borderColor: theme.colors.foreground,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
}));
