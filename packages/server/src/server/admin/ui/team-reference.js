(() => {
  const DAY_MS = 86_400_000;
  const CELL_SECONDS = 15 * 60;
  const PALETTE = [
    "#3459a6",
    "#5f82ca",
    "#1d8451",
    "#b7791f",
    "#6d51b2",
    "#b73a34",
    "#2f8f9d",
    "#94a3b8",
  ];
  const COMPONENT_LABELS = {
    input: "输入表达",
    agent: "AI 运行/查看",
    thinking: "思考/阅读",
    history: "历史推断",
  };
  const COMPONENT_ORDER = Object.keys(COMPONENT_LABELS);
  const state = {
    activeMemberId: null,
    calendar: {
      anchor: "",
      dragging: false,
      hover: "",
      month: "",
      selection: null,
    },
    data: null,
    heatmapSelected: "",
    options: null,
    pies: {},
    range: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const teamRoot = () => $(".team-reference-page");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[character];
    });
  }

  function dateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toISOString().slice(0, 10) === value ? date : null;
  }

  function addDays(value, offset) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseDate(value);
    if (!date) return "";
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function inclusiveDays(startValue, endValue) {
    const start = parseDate(startValue);
    const end = parseDate(endValue);
    return start && end ? Math.round((end - start) / DAY_MS) + 1 : 0;
  }

  function defaultRange() {
    const today = dateValue(new Date());
    return { start: addDays(today, -6), end: today };
  }

  function compactDate(value) {
    const parts = String(value ?? "").split("-");
    return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : value;
  }

  function rangeLabel(range) {
    if (!range?.start || !range?.end) return "选择日期范围";
    return range.start === range.end
      ? compactDate(range.start)
      : `${compactDate(range.start)}–${compactDate(range.end)}`;
  }

  function localDayStart(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function localDayEnd(value) {
    return new Date(localDayStart(value).getTime() + DAY_MS - 1);
  }

  function requestFromRange(range) {
    const now = new Date();
    const today = dateValue(now);
    return {
      start: localDayStart(range.start).toISOString(),
      end: (range.end === today ? now : localDayEnd(range.end)).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  function formatDuration(seconds) {
    const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  }

  function formatCompactDate(value) {
    if (!value) return "未知时间";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function monthLabel(value) {
    const [year, month] = String(value).split("-");
    return year && month ? `${year}年${Number(month)}月` : value;
  }

  function shiftMonth(value, offset) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(offset), 1));
    return date.toISOString().slice(0, 7);
  }

  function weekStart(value) {
    const date = parseDate(value);
    if (!date) return "";
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }

  function buildMonthGrid(month, today, maxDays) {
    const first = weekStart(`${month}-01`);
    const minDate = addDays(today, -(maxDays - 1));
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const value = addDays(first, index);
      const parsed = parseDate(value);
      cells.push({
        date: value,
        day: parsed.getUTCDate(),
        inMonth: value.slice(0, 7) === month,
        today: value === today,
        disabled: value > today || value < minDate,
      });
    }
    return { cells, maxDate: today, minDate };
  }

  function dragRange(anchorValue, hoverValue, today, maxDays = 180) {
    const anchor = parseDate(anchorValue);
    const hover = parseDate(hoverValue);
    const todayDate = parseDate(today);
    if (!anchor || !hover || !todayDate) return null;
    const minDate = addDays(today, -(maxDays - 1));
    let normalizedAnchor = anchorValue;
    if (normalizedAnchor < minDate) normalizedAnchor = minDate;
    if (normalizedAnchor > today) normalizedAnchor = today;
    let normalizedHover = hoverValue;
    if (normalizedHover < minDate) normalizedHover = minDate;
    if (normalizedHover > today) normalizedHover = today;
    let start = normalizedAnchor < normalizedHover ? normalizedAnchor : normalizedHover;
    let end = normalizedAnchor < normalizedHover ? normalizedHover : normalizedAnchor;
    if (inclusiveDays(start, end) > maxDays) {
      if (normalizedAnchor <= normalizedHover) {
        end = addDays(start, maxDays - 1);
      } else {
        start = addDays(end, -(maxDays - 1));
      }
    }
    return { start, end };
  }

  function validateRange(range) {
    if (!range?.start || !range?.end) return "请选择开始日期和结束日期";
    if (range.start > range.end) return "开始日期不能晚于结束日期";
    if (range.end > dateValue(new Date())) return "结束日期不能晚于今天";
    if (inclusiveDays(range.start, range.end) > 180) return "日期范围不能超过 180 天";
    return "";
  }

  function quickRange(days, today = dateValue(new Date())) {
    return { start: addDays(today, -(days - 1)), end: today };
  }

  function updateRangeTrigger() {
    const root = teamRoot();
    if (!root || !state.range) return;
    const value = $("#personal-range-value", root);
    if (value)
      value.textContent = `${rangeLabel(state.range)} · ${inclusiveDays(state.range.start, state.range.end)} 天`;
  }

  function renderCalendar() {
    const root = teamRoot();
    if (!root) return;
    const grid = $("#personal-calendar-grid", root);
    const month = $("#personal-calendar-month", root);
    if (!grid || !month) return;
    const today = dateValue(new Date());
    const calendar = buildMonthGrid(state.calendar.month, today, 180);
    const selection = state.calendar.dragging ? state.calendar.selection : state.range;
    month.textContent = monthLabel(state.calendar.month);
    const previous = $('[data-personal-calendar-shift="-1"]', root);
    const next = $('[data-personal-calendar-shift="1"]', root);
    if (previous)
      previous.disabled = shiftMonth(state.calendar.month, -1) < calendar.minDate.slice(0, 7);
    if (next) next.disabled = shiftMonth(state.calendar.month, 1) > calendar.maxDate.slice(0, 7);
    grid.innerHTML = calendar.cells
      .map((cell) => {
        const inRange = selection && cell.date >= selection.start && cell.date <= selection.end;
        const classes = ["personal-calendar-day"];
        if (!cell.inMonth) classes.push("outside-month");
        if (cell.disabled) classes.push("disabled");
        if (cell.today) classes.push("today");
        if (inRange) classes.push("in-range");
        if (selection && cell.date === selection.start) classes.push("range-start");
        if (selection && cell.date === selection.end) classes.push("range-end");
        return `<button type="button" class="${classes.join(" ")}" data-personal-calendar-date="${escapeHtml(cell.date)}"${cell.disabled ? " disabled" : ""} aria-selected="${inRange ? "true" : "false"}" aria-label="${escapeHtml(dateLabel(cell.date))}">${cell.day}</button>`;
      })
      .join("");
  }

  function openCalendar() {
    const root = teamRoot();
    if (!root) return;
    const picker = $("#personal-range-picker", root);
    const popover = $("#personal-range-popover", root);
    const trigger = $("#personal-range-trigger", root);
    if (!picker || !popover || !trigger) return;
    state.calendar.month = String(state.range.end || dateValue(new Date())).slice(0, 7);
    state.calendar.dragging = false;
    state.calendar.anchor = "";
    state.calendar.hover = "";
    state.calendar.selection = { ...state.range };
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (window.innerWidth <= 520) {
      popover.style.top = `${Math.round(trigger.getBoundingClientRect().bottom + 6)}px`;
    } else {
      popover.style.top = "";
    }
    renderCalendar();
    $(
      ".personal-calendar-day.range-start:not(:disabled), .personal-calendar-day:not(:disabled)",
      popover,
    )?.focus();
  }

  function closeCalendar(returnFocus = false) {
    const root = teamRoot();
    if (!root) return;
    const popover = $("#personal-range-popover", root);
    const trigger = $("#personal-range-trigger", root);
    state.calendar.dragging = false;
    if (popover) popover.hidden = true;
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
    }
  }

  async function applyRange(range) {
    const root = teamRoot();
    const error = root ? $("#personal-range-error", root) : null;
    const message = validateRange(range);
    if (message) {
      if (error) error.textContent = message;
      return;
    }
    state.range = { ...range };
    if (error) error.textContent = "";
    updateRangeTrigger();
    closeCalendar(true);
    await reload();
  }

  function calendarDateAtPoint(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const day = target?.closest?.("[data-personal-calendar-date]");
    return day?.dataset.personalCalendarDate ?? "";
  }

  function members() {
    if (!state.data) return [];
    return [...state.data.members, state.data.unassigned];
  }

  function currentMember() {
    const values = members();
    return (
      values.find((member) => member.id === state.activeMemberId) ?? state.data?.members[0] ?? null
    );
  }

  function componentLabel(row) {
    return COMPONENT_LABELS[row.key] ?? row.label;
  }

  function pieSegments(items, total) {
    const shown = items.slice(0, 7);
    const rest = items
      .slice(7)
      .reduce((sum, item) => sum + Math.max(0, Number(item.seconds || 0)), 0);
    const segments = shown.map((item, index) => ({
      label: item.label,
      fullLabel: item.fullLabel || item.label,
      seconds: Math.max(0, Number(item.seconds || 0)),
      color: PALETTE[index],
    }));
    if (rest > 0) segments.push({ label: "其他", seconds: rest, color: PALETTE[7] });
    let cursor = 0;
    return segments.map((item) => {
      const share = total ? item.seconds / total : 0;
      const startAngle = cursor;
      cursor += share * 360;
      return Object.assign({}, item, {
        share,
        startAngle,
        endAngle: cursor,
        middleAngle: (startAngle + cursor) / 2,
      });
    });
  }

  function piePoint(angle, radius) {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: 60 + Math.cos(radians) * radius,
      y: 60 + Math.sin(radians) * radius,
    };
  }

  function piePath(segment) {
    const sweep = Math.min(359.999, Math.max(0.001, segment.endAngle - segment.startAngle));
    const start = piePoint(segment.startAngle, 50);
    const end = piePoint(segment.startAngle + sweep, 50);
    const innerEnd = piePoint(segment.startAngle + sweep, 24);
    const innerStart = piePoint(segment.startAngle, 24);
    const large = sweep > 180 ? 1 : 0;
    return `M${start.x.toFixed(3)} ${start.y.toFixed(3)} A50 50 0 ${large} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} L${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)} A24 24 0 ${large} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)} Z`;
  }

  function renderAllocation(rootId, items, totalSeconds) {
    const root = teamRoot();
    const container = root ? $(`#${rootId}`, root) : null;
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="personal-empty">暂无数据。</div>';
      return;
    }
    const total = Math.max(
      Number(totalSeconds || 0),
      items.reduce((sum, item) => sum + Math.max(0, Number(item.seconds || 0)), 0),
    );
    const segments = pieSegments(items, total);
    state.pies[rootId] = { segments, selected: -1, total };
    const paths = segments
      .map(
        (item, index) =>
          `<path class="personal-pie-slice" data-personal-pie-slice="${index}" d="${piePath(item)}" fill="${item.color}"></path>`,
      )
      .join("");
    const legend = segments
      .map((item, index) => {
        const fullLabel = item.fullLabel || item.label;
        return `<button type="button" class="personal-pie-legend-row" aria-pressed="false" data-personal-pie-root="${escapeHtml(rootId)}" data-personal-pie-segment="${index}" title="${escapeHtml(fullLabel)}"><i style="background:${item.color}"></i><span class="personal-pie-legend-label"><span class="personal-pie-legend-short">${escapeHtml(item.label)}</span><span class="personal-pie-legend-tooltip" role="tooltip">${escapeHtml(fullLabel)}</span></span><b>${Math.round(item.share * 100)}%</b><small>${formatDuration(item.seconds)}</small></button>`;
      })
      .join("");
    container.innerHTML = `<div class="personal-pie-wrap" data-personal-pie-wrap="${escapeHtml(rootId)}"><button type="button" class="personal-pie" data-personal-pie="${escapeHtml(rootId)}" aria-label="点击饼图选择分类" aria-pressed="false"><svg class="personal-pie-svg" viewBox="0 0 120 120" aria-hidden="true">${paths}</svg><span class="personal-pie-center"><b>${formatDuration(total)}</b><span>估算投入</span></span></button><div class="personal-pie-legend">${legend}</div><div class="personal-pie-detail" data-personal-pie-detail="${escapeHtml(rootId)}">点击扇区或图例查看明细</div></div>`;
  }

  function selectPie(rootId, index) {
    const pieState = state.pies[rootId];
    const root = teamRoot();
    if (!pieState || !root) return;
    const wrap = $(`[data-personal-pie-wrap="${rootId}"]`, root);
    if (!wrap) return;
    const selected = pieState.selected === index ? -1 : index;
    pieState.selected = selected;
    const pie = $(".personal-pie", wrap);
    const detail = $(".personal-pie-detail", wrap);
    for (const row of wrap.querySelectorAll(".personal-pie-legend-row")) {
      const active = Number(row.dataset.personalPieSegment) === selected;
      row.classList.toggle("active", active);
      row.setAttribute("aria-pressed", String(active));
    }
    for (const slice of pie.querySelectorAll(".personal-pie-slice")) {
      slice.classList.remove("popped");
      slice.style.transform = "";
    }
    pie.classList.toggle("has-selection", selected >= 0);
    if (selected < 0) {
      $(".personal-pie-center b", pie).textContent = formatDuration(pieState.total);
      $(".personal-pie-center span", pie).textContent = "估算投入";
      detail.textContent = "点击扇区或图例查看明细";
      pie.classList.remove("selected");
      pie.setAttribute("aria-pressed", "false");
      return;
    }
    const segment = pieState.segments[selected];
    const slice = $(`[data-personal-pie-slice="${selected}"]`, pie);
    if (slice) {
      const radians = ((segment.middleAngle - 90) * Math.PI) / 180;
      slice.style.transform = `translate(${(Math.cos(radians) * 7).toFixed(2)}px,${(Math.sin(radians) * 7).toFixed(2)}px)`;
      slice.classList.add("popped");
    }
    $(".personal-pie-center b", pie).textContent = `${Math.round(segment.share * 100)}%`;
    $(".personal-pie-center span", pie).textContent = "占比";
    detail.innerHTML = `已选：<b>${escapeHtml(segment.label)}</b> · ${formatDuration(segment.seconds)} · ${Math.round(segment.share * 100)}%`;
    pie.classList.add("selected");
    pie.setAttribute("aria-pressed", "true");
  }

  function pieIndexAtEvent(event, pie, rootId) {
    const slice = event.target.closest(".personal-pie-slice");
    if (slice && pie.contains(slice)) return Number(slice.dataset.personalPieSlice);
    const pieState = state.pies[rootId];
    if (!pieState || !pieState.total) return -1;
    const rect = pie.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (Math.sqrt(dx * dx + dy * dy) < rect.width * 0.24) return -1;
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
    return pieState.segments.findIndex((item) => angle <= item.endAngle + 0.0001);
  }

  function minuteLabel(minute) {
    const normalized = Math.max(0, Math.min(1440, Number(minute || 0)));
    if (normalized >= 1440) return "24:00";
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  }

  function dateLabel(value) {
    const parts = String(value ?? "")
      .split("-")
      .map(Number);
    if (parts.length !== 3 || parts.some((item) => !item)) return value || "未知日期";
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${week}`;
  }

  function coverageForDate(date) {
    if (!state.data) return { end: 0, start: 0 };
    const startDate = state.data.start.slice(0, 10);
    const endDate = state.data.end.slice(0, 10);
    if (date < startDate || date > endDate) return { end: 0, start: 0 };
    if (date < endDate) return { end: 96, start: 0 };
    const end = new Date(state.data.end);
    const elapsedMinutes = end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60;
    return { end: Math.min(96, Math.ceil(elapsedMinutes / 15)), start: 0 };
  }

  function aggregateDay(day) {
    const coverage = coverageForDate(day.date);
    const cells = [];
    let activeCells = 0;
    for (let index = 0; index < 96; index += 1) {
      const coveredSeconds = index >= coverage.start && index < coverage.end ? CELL_SECONDS : 0;
      const seconds = Math.max(0, Number(day.slots[index] || 0));
      let status = "active";
      if (coveredSeconds <= 0) status = "outside";
      else if (seconds <= 0) status = "empty";
      const ratio = status === "active" ? Math.min(1, seconds / coveredSeconds) : 0;
      if (status === "active") activeCells += 1;
      cells.push({
        coveredSeconds,
        endMinute: (index + 1) * 15,
        index,
        level: heatLevel(ratio),
        ratio,
        seconds,
        startMinute: index * 15,
        status,
      });
    }
    return {
      activeCells,
      cells,
      totalSeconds: day.slots.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0),
    };
  }

  function heatLevel(ratio) {
    const value = Math.max(0, Math.min(1, Number(ratio || 0)));
    if (value <= 0) return 0;
    if (value >= 1) return 4;
    if (value >= 0.66) return 3;
    if (value >= 0.33) return 2;
    return 1;
  }

  function heatStatus(cell) {
    if (cell.status === "outside") return "查询范围外";
    if (cell.status === "empty") return "空缺";
    return formatDuration(cell.seconds);
  }

  function heatCellLabel(day, cell) {
    return `${dateLabel(day.date)} ${minuteLabel(cell.startMinute)}–${minuteLabel(cell.endMinute)}，${heatStatus(cell)}`;
  }

  function heatCellMarkup(day, cell) {
    const className = cell.status === "active" ? `active level-${cell.level}` : cell.status;
    const selected = state.heatmapSelected === `${day.date}-${cell.index}` ? " selected" : "";
    const label = heatCellLabel(day, cell);
    return `<button type="button" class="personal-heat-cell ${className}${selected}" data-personal-heat-cell data-date="${escapeHtml(day.date)}" data-index="${cell.index}" data-start-minute="${cell.startMinute}" data-end-minute="${cell.endMinute}" data-seconds="${cell.seconds}" data-covered-seconds="${cell.coveredSeconds}" data-status="${cell.status}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></button>`;
  }

  function heatDayMarkup(day) {
    const aggregated = aggregateDay(day);
    const firstActive = day.slots.findIndex((value) => Number(value || 0) > 0);
    const lastActive = day.slots.findLastIndex?.((value) => Number(value || 0) > 0) ?? -1;
    const activeSpan =
      firstActive >= 0 && lastActive >= 0
        ? `${minuteLabel(firstActive * 15)}–${minuteLabel((lastActive + 1) * 15)}`
        : "";
    const half = (startHour, endHour, label) => {
      const hours = [];
      for (let hour = startHour; hour < endHour; hour += 1) {
        const cells = aggregated.cells
          .slice(hour * 4, hour * 4 + 4)
          .map((cell) => heatCellMarkup(day, cell))
          .join("");
        hours.push(
          `<div class="personal-heat-hour" data-hour="${hour}"><span class="personal-heat-hour-label">${String(hour).padStart(2, "0")}</span><div class="personal-heat-cells">${cells}</div></div>`,
        );
      }
      return `<div class="personal-heat-half-row"><span class="personal-heat-mobile-half-label" title="${label.replace("–", " 至 ")}">${label}</span><div class="personal-heat-hour-grid">${hours.join("")}</div></div>`;
    };
    return `<div class="personal-heat-day" data-personal-heat-day="${escapeHtml(day.date)}"><div class="personal-heat-day-meta"><strong>${escapeHtml(dateLabel(day.date))}</strong><span>${formatDuration(aggregated.totalSeconds)}${activeSpan ? ` · ${escapeHtml(activeSpan)}` : ""}</span></div><div class="personal-heat-half-layout">${half(0, 12, "00–12")}${half(12, 24, "12–24")}</div></div>`;
  }

  function renderHeatmap(days) {
    const root = teamRoot();
    if (!root) return;
    const container = $("#personal-heatmap-list", root);
    const windowNode = $("#personal-heatmap-window", root);
    const detail = $("#personal-heatmap-detail", root);
    state.heatmapSelected = "";
    if (detail) detail.textContent = "悬停、聚焦或点击时间格查看投入详情。";
    if (!container) return;
    const active = (days ?? [])
      .filter((day) => day.slots.some((value) => Number(value || 0) > 0))
      .sort((left, right) => right.date.localeCompare(left.date));
    if (!active.length) {
      container.innerHTML = '<div class="personal-empty">当前日期范围没有投入记录。</div>';
      if (windowNode) windowNode.textContent = "每格 15 分钟，颜色越深表示投入越满。";
      return;
    }
    if (windowNode) {
      windowNode.textContent = `${formatCompactDate(state.data.start)} 至 ${formatCompactDate(state.data.end)} · ${state.data.timeZone} · 每格 15 分钟`;
    }
    container.innerHTML = active.map(heatDayMarkup).join("");
  }

  function heatDetailText(button) {
    const date = button.dataset.date;
    const start = Number(button.dataset.startMinute);
    const end = Number(button.dataset.endMinute);
    const seconds = Number(button.dataset.seconds || 0);
    const covered = Number(button.dataset.coveredSeconds || 0);
    const status = button.dataset.status;
    if (status === "outside") {
      return `${dateLabel(date)} ${minuteLabel(start)}–${minuteLabel(end)} · 查询范围外`;
    }
    if (status === "empty") {
      return `${dateLabel(date)} ${minuteLabel(start)}–${minuteLabel(end)} · 空缺`;
    }
    return `${dateLabel(date)} ${minuteLabel(start)}–${minuteLabel(end)} · ${formatDuration(seconds)} / 满 ${formatDuration(covered)}`;
  }

  function showHeatDetail(button, persist) {
    const root = teamRoot();
    const detail = root ? $("#personal-heatmap-detail", root) : null;
    if (!button || !detail) return;
    detail.textContent = heatDetailText(button);
    if (!persist) return;
    for (const cell of root.querySelectorAll("[data-personal-heat-cell].selected")) {
      cell.classList.remove("selected");
    }
    button.classList.add("selected");
    state.heatmapSelected = `${button.dataset.date}-${button.dataset.index}`;
  }

  function renderTabs() {
    const root = teamRoot();
    const tabs = root ? $("#team-member-tabs", root) : null;
    if (!tabs || !state.data) return;
    const values = members();
    tabs.style.gridTemplateColumns = `repeat(${Math.max(1, values.length)}, minmax(0, 1fr))`;
    tabs.innerHTML = values
      .map((member) => {
        const active = member.id === state.activeMemberId ? " active" : "";
        const subtitle =
          member.id === "unassigned"
            ? `${member.sessions} 个会话`
            : `${formatDuration(member.seconds)} · ${member.sessions} 会话`;
        const virtual = member.virtual ? ' <em class="virtual-badge">虚拟</em>' : "";
        return `<button type="button" class="team-member-tab${active}" role="tab" aria-selected="${Boolean(active)}" data-team-member="${escapeHtml(member.id)}"><strong>${escapeHtml(member.name)}${virtual}</strong><span>${escapeHtml(subtitle)}</span></button>`;
      })
      .join("");
  }

  function renderMember() {
    const root = teamRoot();
    const member = currentMember();
    if (!root || !member) return;
    $("#team-total-time", root).textContent = formatDuration(member.seconds);
    $("#team-count-sessions", root).textContent = member.sessions;
    $("#team-count-projects", root).textContent = member.projects.length;
    $("#team-count-accounts", root).textContent = member.accounts.length;
    $("#team-count-turns", root).textContent = member.completedTurns;
    renderAllocation(
      "team-pie-composition",
      [...member.timeComponents]
        .sort(
          (left, right) => COMPONENT_ORDER.indexOf(left.key) - COMPONENT_ORDER.indexOf(right.key),
        )
        .map((row) => Object.assign({}, row, { label: componentLabel(row) })),
      member.seconds,
    );
    renderAllocation("team-pie-projects", member.projects, member.seconds);
    renderAllocation("team-pie-accounts", member.accounts, member.seconds);
    renderAllocation(
      "team-pie-sessions",
      member.sessionDistribution.map((row) => ({ ...row, fullLabel: row.label })),
      member.seconds,
    );
    renderHeatmap(member.heatmap);
    updateRangeTrigger();
  }

  function render(data) {
    const root = teamRoot();
    if (!root || !data) return;
    state.data = data;
    const values = members();
    if (!values.some((member) => member.id === state.activeMemberId)) {
      state.activeMemberId = values[0]?.id ?? null;
    }
    $("#team-cache-status", root).textContent =
      `已重新计算 · ${formatCompactDate(data.generatedAt)}`;
    const humanCount = values.filter(
      (member) => member.id !== "unassigned" && member.virtual !== true,
    ).length;
    const virtualCount = values.filter((member) => member.virtual === true).length;
    $("#team-member-count", root).textContent = `${humanCount} 人团队${
      virtualCount > 0 ? ` · ${virtualCount} 项虚拟统计` : ""
    }`;
    renderTabs();
    renderMember();
    $("#team-gate", root).hidden = true;
    $("#team-dashboard", root).hidden = false;
  }

  async function reload() {
    const root = teamRoot();
    if (!root || !state.options) return null;
    const gate = $("#team-gate", root);
    const dashboard = $("#team-dashboard", root);
    try {
      if (gate) {
        gate.hidden = false;
        gate.textContent = "正在加载团队数据…";
      }
      if (dashboard) dashboard.hidden = true;
      const request = requestFromRange(state.range);
      const data = await state.options.load(request);
      render(data);
      return data;
    } catch (error) {
      if (gate) {
        gate.hidden = false;
        gate.textContent = `团队数据加载失败：${error instanceof Error ? error.message : String(error)}`;
      }
      state.options.onError?.(error);
      return null;
    }
  }

  function bindEvents() {
    const root = teamRoot();
    if (!root || root.dataset.teamReferenceBound === "true") return;
    root.dataset.teamReferenceBound = "true";
    root.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.id === "team-refresh") {
        void reload();
        return;
      }
      if (button.dataset.teamMember) {
        state.activeMemberId = button.dataset.teamMember;
        renderTabs();
        renderMember();
        return;
      }
      if (button.id === "personal-range-trigger") {
        const popover = $("#personal-range-popover", root);
        if (popover?.hidden) openCalendar();
        else closeCalendar(false);
        return;
      }
      if (button.dataset.personalQuickDays) {
        void applyRange(quickRange(Number(button.dataset.personalQuickDays)));
        return;
      }
      if (button.dataset.personalCalendarShift) {
        state.calendar.month = shiftMonth(
          state.calendar.month,
          Number(button.dataset.personalCalendarShift),
        );
        state.calendar.selection = null;
        renderCalendar();
        return;
      }
      if (button.dataset.personalCalendarClose !== undefined) {
        closeCalendar(true);
        return;
      }
      if (button.dataset.personalPie) {
        selectPie(
          button.dataset.personalPie,
          pieIndexAtEvent(event, button, button.dataset.personalPie),
        );
        return;
      }
      if (button.dataset.personalPieRoot && button.dataset.personalPieSegment !== undefined) {
        selectPie(button.dataset.personalPieRoot, Number(button.dataset.personalPieSegment));
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const popover = $("#personal-range-popover", root);
        if (popover && !popover.hidden) {
          event.preventDefault();
          closeCalendar(true);
          return;
        }
      }
      const cell = event.target.closest?.("[data-personal-heat-cell]");
      if (!cell || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      const cells = Array.from(
        cell.closest("[data-personal-heat-day]").querySelectorAll("[data-personal-heat-cell]"),
      );
      const next = cells[cells.indexOf(cell) + (event.key === "ArrowRight" ? 1 : -1)];
      if (next) {
        next.focus();
        showHeatDetail(next, false);
      }
    });
    document.addEventListener("pointerdown", (event) => {
      const picker = $("#personal-range-picker", root);
      if (picker && !picker.contains(event.target)) closeCalendar(false);
      const day = event.target.closest?.("[data-personal-calendar-date]");
      if (!day || day.disabled || event.button !== 0) return;
      event.preventDefault();
      state.calendar.dragging = true;
      state.calendar.anchor = day.dataset.personalCalendarDate;
      state.calendar.hover = state.calendar.anchor;
      state.calendar.selection = dragRange(
        state.calendar.anchor,
        state.calendar.hover,
        dateValue(new Date()),
      );
      renderCalendar();
    });
    document.addEventListener("pointermove", (event) => {
      if (!state.calendar.dragging) return;
      const date = calendarDateAtPoint(event);
      if (!date || date === state.calendar.hover) return;
      state.calendar.hover = date;
      state.calendar.selection = dragRange(state.calendar.anchor, date, dateValue(new Date()));
      renderCalendar();
      event.preventDefault();
    });
    document.addEventListener("pointerup", (event) => {
      if (!state.calendar.dragging) return;
      const date = calendarDateAtPoint(event);
      if (date) state.calendar.hover = date;
      state.calendar.selection = dragRange(
        state.calendar.anchor,
        state.calendar.hover || state.calendar.anchor,
        dateValue(new Date()),
      );
      state.calendar.dragging = false;
      if (state.calendar.selection) void applyRange(state.calendar.selection);
    });
    document.addEventListener("pointerover", (event) => {
      const cell = event.target.closest?.("[data-personal-heat-cell]");
      if (cell) showHeatDetail(cell, false);
    });
    document.addEventListener("focusin", (event) => {
      const cell = event.target.closest?.("[data-personal-heat-cell]");
      if (cell) showHeatDetail(cell, false);
    });
    root.addEventListener("click", (event) => {
      const cell = event.target.closest?.("[data-personal-heat-cell]");
      if (cell) showHeatDetail(cell, true);
    });
  }

  function create(options) {
    state.options = options;
    state.range = defaultRange();
    bindEvents();
    updateRangeTrigger();
    return {
      getRange: () => ({ ...state.range }),
      reload,
      render,
    };
  }

  window.JianShanTeamReference = Object.freeze({ create });

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.teamMode !== "public") return;
    const instance = create({
      load: async (request) => {
        const params = new URLSearchParams(request);
        const response = await fetch(`/api/team/public?${params}`);
        if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
        return response.json();
      },
    });
    window.JianShanTeamReferenceInstance = instance;
    void instance.reload();
  });
})();
