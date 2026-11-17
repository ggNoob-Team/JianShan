import { memo, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { ScrollView, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { StyleSheet } from "react-native-unistyles";

import {
  TEAM_DATE_PRESETS,
  createTeamDateRange,
  formatTeamDateRange,
  type TeamDateRange,
} from "./team-screen-model";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function rangeFromKeys(startDate: string, endDate: string): TeamDateRange {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return {
    startDate,
    endDate,
    days: Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1,
  };
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function dayLabel(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export interface TeamDateRangeSheetProps {
  visible: boolean;
  range: TeamDateRange;
  onClose: () => void;
  onApply: (range: TeamDateRange) => void;
}

interface PresetButtonProps {
  days: number;
  active: boolean;
  onSelect: (days: number) => void;
}

const PresetButton = memo(function PresetButton({
  days,
  active,
  onSelect,
}: PresetButtonProps): ReactElement {
  const handlePress = useCallback(() => onSelect(days), [days, onSelect]);
  return (
    <Button
      variant={active ? "secondary" : "outline"}
      size="sm"
      onPress={handlePress}
      testID={`team-date-preset-${days}`}
    >
      最近 {days} 天
    </Button>
  );
});

interface CalendarDayProps {
  date: Date;
  dateKey: string;
  disabled: boolean;
  inRange: boolean;
  isStart: boolean;
  isEnd: boolean;
  isToday: boolean;
  onSelect: (dateKey: string) => void;
}

const CalendarDay = memo(function CalendarDay({
  date,
  dateKey,
  disabled,
  inRange,
  isStart,
  isEnd,
  isToday,
  onSelect,
}: CalendarDayProps): ReactElement {
  const handlePress = useCallback(() => onSelect(dateKey), [dateKey, onSelect]);
  const accessibilityState = useMemo(
    () => ({ disabled, selected: isStart || isEnd }),
    [disabled, isEnd, isStart],
  );
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={dayLabel(date)}
      accessibilityState={accessibilityState}
      disabled={disabled}
      highlightStyle={styles.dayHighlight}
      onPress={handlePress}
      style={[
        styles.dayCell,
        inRange && styles.dayInRange,
        (isStart || isEnd) && styles.daySelected,
        isToday && !isStart && !isEnd && styles.dayToday,
        disabled && styles.dayDisabled,
      ]}
      testID={`team-calendar-${dateKey}`}
    >
      <Text
        style={[
          styles.dayText,
          inRange && styles.dayTextInRange,
          (isStart || isEnd) && styles.dayTextSelected,
        ]}
      >
        {date.getDate()}
      </Text>
    </PressHighlight>
  );
});

export function TeamDateRangeSheet({
  visible,
  range,
  onClose,
  onApply,
}: TeamDateRangeSheetProps): ReactElement {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [draftStart, setDraftStart] = useState(range.startDate);
  const [draftEnd, setDraftEnd] = useState<string | null>(range.endDate);
  const [viewMonth, setViewMonth] = useState(
    () =>
      new Date(
        new Date(`${range.endDate}T00:00:00`).getFullYear(),
        new Date(`${range.endDate}T00:00:00`).getMonth(),
        1,
      ),
  );

  useEffect(() => {
    if (!visible) return;
    setDraftStart(range.startDate);
    setDraftEnd(range.endDate);
    const end = new Date(`${range.endDate}T00:00:00`);
    setViewMonth(new Date(end.getFullYear(), end.getMonth(), 1));
  }, [range.endDate, range.startDate, visible]);

  const selectedRange = useMemo(
    () => (draftEnd ? rangeFromKeys(draftStart, draftEnd) : null),
    [draftEnd, draftStart],
  );
  const currentMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const canGoNext = viewMonth < currentMonth;
  const calendarCells = useMemo(() => {
    const mondayOffset =
      (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        viewMonth.getFullYear(),
        viewMonth.getMonth(),
        index - mondayOffset + 1,
      );
      return {
        date,
        key: localDateKey(date),
        outside: date.getMonth() !== viewMonth.getMonth(),
      };
    });
  }, [viewMonth]);

  const applyPreset = useCallback(
    (days: number) => {
      const next = createTeamDateRange(days);
      setDraftStart(next.startDate);
      setDraftEnd(next.endDate);
      onApply(next);
      onClose();
    },
    [onApply, onClose],
  );

  const selectDay = useCallback(
    (dateKey: string) => {
      if (!draftEnd) {
        const start = dateKey < draftStart ? dateKey : draftStart;
        const end = dateKey < draftStart ? draftStart : dateKey;
        setDraftStart(start);
        setDraftEnd(end);
        return;
      }
      setDraftStart(dateKey);
      setDraftEnd(null);
    },
    [draftEnd, draftStart],
  );

  const applyDraft = useCallback(() => {
    if (!selectedRange) return;
    onApply(selectedRange);
    onClose();
  }, [onApply, onClose, selectedRange]);

  const showPreviousMonth = useCallback(
    () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)),
    [viewMonth],
  );
  const showNextMonth = useCallback(
    () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)),
    [viewMonth],
  );

  const sheetHeader = useMemo(() => ({ title: "选择分析范围" }), []);
  const sheetFooter = useMemo(
    () => (
      <View style={styles.footer}>
        <Text style={styles.footerRange}>
          {selectedRange ? formatTeamDateRange(selectedRange) : "再选择结束日期"}
        </Text>
        <View style={styles.footerActions}>
          <Button variant="ghost" size="sm" onPress={onClose}>
            取消
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!selectedRange}
            onPress={applyDraft}
            testID="team-date-range-apply"
          >
            应用
          </Button>
        </View>
      </View>
    ),
    [applyDraft, onClose, selectedRange],
  );

  return (
    <AdaptiveModalSheet
      header={sheetHeader}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={520}
      footer={sheetFooter}
      testID="team-date-range-sheet"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presets}
      >
        {TEAM_DATE_PRESETS.map((days) => {
          const active = range.days === days && range.endDate === localDateKey(today);
          return <PresetButton key={days} days={days} active={active} onSelect={applyPreset} />;
        })}
      </ScrollView>

      <View style={styles.monthHeader}>
        <Button
          variant="ghost"
          size="xs"
          accessibilityLabel="上个月"
          leftIcon={ChevronLeft}
          onPress={showPreviousMonth}
        />
        <Text style={styles.monthTitle}>{formatMonth(viewMonth)}</Text>
        <Button
          variant="ghost"
          size="xs"
          accessibilityLabel="下个月"
          disabled={!canGoNext}
          leftIcon={ChevronRight}
          onPress={showNextMonth}
        />
      </View>

      <View style={styles.weekdays}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarCells.map(({ date, key, outside }) => {
          const disabled = outside || date > today;
          const isStart = !outside && key === draftStart;
          const isEnd = !outside && key === draftEnd;
          const inRange =
            !outside &&
            draftEnd != null &&
            key >= draftStart &&
            key <= draftEnd &&
            !isStart &&
            !isEnd;
          const isToday = !outside && key === localDateKey(today);
          return (
            <CalendarDay
              key={key}
              date={date}
              dateKey={key}
              disabled={disabled}
              inRange={inRange}
              isStart={isStart}
              isEnd={isEnd}
              isToday={isToday}
              onSelect={selectDay}
            />
          );
        })}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  presets: {
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  monthTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  weekdays: {
    flexDirection: "row",
  },
  weekday: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  dayCell: {
    width: "13.2%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  dayHighlight: {
    backgroundColor: theme.colors.surface3,
  },
  dayInRange: {
    backgroundColor: theme.colors.surface3,
  },
  daySelected: {
    backgroundColor: theme.colors.accent,
  },
  dayToday: {
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
  },
  dayDisabled: {
    opacity: theme.opacity[50],
  },
  dayText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  dayTextInRange: {
    color: theme.colors.accent,
  },
  dayTextSelected: {
    color: theme.colors.accentForeground,
    fontWeight: theme.fontWeight.semibold,
  },
  footer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  footerRange: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  footerActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
