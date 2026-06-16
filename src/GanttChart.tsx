import { createPortal, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/compat';
import type { JSX } from 'preact';
import type { Task } from './parseYaml';
import type { Theme } from './themes';

const DAY_W = 40;
const LABEL_W = 280;
const ROW_H = 52;
const PROJ_H = 54;
const HDR_H = 68;
const RANGE_PAD = 4;

const PROJECT_COLORS = [
  '#60a5fa', '#34d399', '#f472b6', '#fb923c',
  '#a78bfa', '#fbbf24', '#2dd4bf', '#f87171',
];

const ACCENT = '#4f8ef7';
const POPOVER_W = 320;
const POP_CARET = 7;
const POP_GAP = 10;
const POP_MARGIN = 8;

function hexRgb(hex: string): string {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(',');
}

function parseDay(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

interface Project {
  name: string;
  color: string;
  tasks: Task[];
}

interface MonthInfo {
  label: string;
  offset: number;
  width: number;
}

interface DayTick {
  offset: number;
  dayNum: number;
  isMonday: boolean;
  isWeekend: boolean;
}

interface GanttChartProps {
  tasks: Task[];
  selectedAssignees: Set<string> | null;
  theme: Theme;
}

export default function GanttChart({ tasks, selectedAssignees, theme }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverOffset, setHoverOffset] = useState<number | null>(null);
  const [openTask, setOpenTask] = useState<{ task: Task; anchorRect: DOMRect } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Hover-driven popover: open on marker hover/focus, close after a short delay
  // so the pointer can travel onto the popover (e.g. to click a link inside it).
  const popoverCloseTimer = useRef<number | null>(null);
  const cancelPopoverClose = () => {
    if (popoverCloseTimer.current !== null) {
      clearTimeout(popoverCloseTimer.current);
      popoverCloseTimer.current = null;
    }
  };
  const openPopover = (task: Task, anchorRect: DOMRect) => {
    cancelPopoverClose();
    setOpenTask({ task, anchorRect });
  };
  const schedulePopoverClose = () => {
    cancelPopoverClose();
    popoverCloseTimer.current = window.setTimeout(() => setOpenTask(null), 140);
  };
  useEffect(() => cancelPopoverClose, []);

  useEffect(() => {
    const obs = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const colorMap = useMemo(() => {
    const names = [...new Set(tasks.map(t => t.project))];
    return Object.fromEntries(
      names.map((n, i) => [n, PROJECT_COLORS[i % PROJECT_COLORS.length]])
    );
  }, [tasks]);

  const { rangeStart, totalDays, months, firstMondayOffset } = useMemo(() => {
    const allDates = tasks.flatMap(t => {
      const ds = [parseDay(t.start), parseDay(t.end)];
      if (t.originallyPlannedStart) ds.push(parseDay(t.originallyPlannedStart));
      if (t.originallyPlannedEnd) ds.push(parseDay(t.originallyPlannedEnd));
      return ds;
    });
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    const rangeStart = new Date(minDate);
    rangeStart.setDate(rangeStart.getDate() - RANGE_PAD);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(maxDate);
    rangeEnd.setDate(rangeEnd.getDate() + RANGE_PAD + 2);

    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

    const firstMonday = new Date(rangeStart);
    while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1);
    const firstMondayOffset = daysBetween(rangeStart, firstMonday);

    const months: MonthInfo[] = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      const mStart = new Date(Math.max(cursor.getTime(), rangeStart.getTime()));
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const mEnd = new Date(Math.min(nextMonth.getTime() - 1, rangeEnd.getTime()));
      months.push({
        label: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        offset: daysBetween(rangeStart, mStart),
        width: daysBetween(mStart, mEnd) + 1,
      });
      cursor.setTime(nextMonth.getTime());
    }

    return { rangeStart, totalDays, months, firstMondayOffset };
  }, [tasks]);

  const dayTicks = useMemo((): DayTick[] => {
    const ticks: DayTick[] = [];
    for (let off = 0; off < totalDays; off++) {
      const d = new Date(rangeStart.getTime() + off * 86_400_000);
      ticks.push({
        offset: off,
        dayNum: d.getDate(),
        isMonday: d.getDay() === 1,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }
    return ticks;
  }, [rangeStart, totalDays]);

  const todayOffset = useMemo(() => {
    // "Today" is the current calendar day in UTC, placed on the same
    // local-midnight grid the task bars use (parseDay / rangeStart).
    const now = new Date();
    const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const off = daysBetween(rangeStart, today);
    return off >= 0 && off < totalDays ? off : null;
  }, [rangeStart, totalDays]);

  const projects = useMemo((): Project[] => {
    const names = [...new Set(tasks.map(t => t.project))];
    return names.map(name => ({
      name,
      color: colorMap[name],
      tasks: tasks.filter(t => t.project === name),
    }));
  }, [tasks, colorMap]);

  const isVisible = (task: Task): boolean =>
    !selectedAssignees ||
    task.assignees.some(a => selectedAssignees.has(a));

  const timelineMinW = totalDays * DAY_W;
  const effectiveDayW = containerWidth > 0
    ? Math.max(DAY_W, (containerWidth - LABEL_W) / totalDays)
    : DAY_W;

  const weekGrid = {
    backgroundImage: `
      repeating-linear-gradient(
        90deg,
        ${theme.weekLineAlpha} 0px,
        ${theme.weekLineAlpha} 1px,
        transparent 1px,
        transparent ${7 * effectiveDayW}px
      ),
      repeating-linear-gradient(
        90deg,
        ${theme.weekBandAlpha} 0px,
        ${theme.weekBandAlpha} ${7 * effectiveDayW}px,
        transparent ${7 * effectiveDayW}px,
        transparent ${14 * effectiveDayW}px
      )
    `,
    backgroundPosition: `
      ${firstMondayOffset * effectiveDayW}px 0,
      ${firstMondayOffset * effectiveDayW}px 0
    `,
  };

  const handleMouseMove = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const xInTimeline = e.clientX - rect.left - LABEL_W + container.scrollLeft;
    if (xInTimeline < 0) { setHoverOffset(null); return; }
    const off = Math.floor(xInTimeline / effectiveDayW);
    setHoverOffset(off >= 0 && off < totalDays ? off : null);
  };

  const hoverDate = hoverOffset !== null
    ? new Date(rangeStart.getTime() + hoverOffset * 86_400_000)
      .toLocaleString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const Crosshair = ({ height }: { height: number }) => hoverOffset === null ? null : (
    <>
      <div style={{
        position: 'absolute', left: hoverOffset * effectiveDayW, top: 0,
        width: effectiveDayW, height,
        background: 'rgba(79,142,247,0.06)',
        zIndex: 1, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', left: hoverOffset * effectiveDayW, top: 0,
        width: 1, height,
        background: 'rgba(79,142,247,0.22)',
        zIndex: 3, pointerEvents: 'none',
      }} />
    </>
  );

  const TodayLine = ({ height }: { height: number }) => todayOffset === null ? null : (
    <div style={{
      position: 'absolute', left: todayOffset * effectiveDayW, top: 0,
      width: 2, height,
      background: `linear-gradient(180deg, ${ACCENT}, rgba(79,142,247,0.6))`,
      boxShadow: `0 0 14px rgba(79,142,247,0.5), 0 0 4px rgba(79,142,247,0.8)`,
      zIndex: 4, pointerEvents: 'none',
    }} />
  );

  const tlCell = (extra: JSX.CSSProperties = {}): JSX.CSSProperties => ({
    flex: 1,
    minWidth: timelineMinW,
    position: 'relative',
    ...extra,
  });

  const labelCell = (extra: JSX.CSSProperties = {}): JSX.CSSProperties => ({
    width: LABEL_W,
    flexShrink: 0,
    position: 'sticky',
    left: 0,
    zIndex: 20,
    ...extra,
  });

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'auto', background: theme.surface }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverOffset(null)}
      onScroll={() => setOpenTask(null)}
    >

      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', height: HDR_H,
        background: `linear-gradient(180deg, ${theme.headerBg} 0%, ${theme.surface} 100%)`,
        borderBottom: `1px solid ${theme.border}`,
      }}>
        {/* Corner */}
        <div style={{
          ...labelCell(),
          zIndex: 31,
          background: `linear-gradient(180deg, ${theme.headerBg} 0%, ${theme.surface} 100%)`,
          borderRight: `1px solid ${theme.border}`,
        }} />

        {/* Month + day header */}
        <div style={tlCell()}>

          {/* Month row */}
          <div style={{ position: 'relative', height: 30, borderBottom: `1px solid ${theme.borderInner}` }}>
            {months.map((m, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: m.offset * effectiveDayW, width: m.width * effectiveDayW, height: 30,
                display: 'flex', alignItems: 'center', paddingLeft: 12,
                fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: theme.monthLabel,
                fontFamily: "'JetBrains Mono', monospace",
                overflow: 'hidden',
                borderLeft: i > 0 ? `1px solid ${theme.borderInner}` : 'none',
              }}>
                {m.label}
              </div>
            ))}
          </div>

          {/* Day row */}
          <div style={{ position: 'relative', height: 38, overflow: 'visible' }}>
            {dayTicks.map((d) => (
              <div key={d.offset} style={{
                position: 'absolute',
                left: d.offset * effectiveDayW, width: effectiveDayW, height: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                color: d.isWeekend ? theme.dayWeekend : d.isMonday ? theme.dayMonday : theme.monthLabel,
                fontWeight: d.isMonday ? 600 : 400,
                opacity: d.offset === hoverOffset ? 0 : 1,
              }}>
                {d.dayNum}
              </div>
            ))}

            {/* Hover column highlight in header */}
            {hoverOffset !== null && (
              <div style={{
                position: 'absolute',
                left: hoverOffset * effectiveDayW, top: 0,
                width: effectiveDayW, height: 38,
                background: 'rgba(79,142,247,0.08)',
                borderRadius: 2, zIndex: 2, pointerEvents: 'none',
              }} />
            )}

            {/* Hover date badge */}
            {hoverDate && (
              <div style={{
                position: 'absolute',
                left: hoverOffset! * effectiveDayW + effectiveDayW / 2,
                top: '50%', transform: 'translate(-50%, -50%)',
                background: ACCENT, color: '#ffffff',
                fontSize: 13, lineHeight: 1,
                padding: '5px 9px', borderRadius: 5,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.02em', whiteSpace: 'nowrap',
                zIndex: 6, pointerEvents: 'none',
                boxShadow: '0 4px 16px rgba(79,142,247,0.5), 0 0 0 1px rgba(79,142,247,0.3)',
              }}>
                {hoverDate}
              </div>
            )}

            <TodayLine height={38} />
            {todayOffset !== null && (
              <div style={{
                position: 'absolute',
                left: todayOffset * effectiveDayW - 5, top: 13,
                width: 10, height: 10, borderRadius: '50%',
                background: ACCENT,
                boxShadow: `0 0 12px rgba(79,142,247,0.9), 0 0 4px rgba(79,142,247,1)`,
                zIndex: 5,
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Project sections */}
      {projects.map(proj => {
        const rgb = hexRgb(proj.color);
        const visibleTasks = proj.tasks.filter(isVisible);
        if (visibleTasks.length === 0) return null;

        return (
          <div key={proj.name}>

            {/* Project header row */}
            <div style={{ display: 'flex', height: PROJ_H }}>
              <div style={{
                ...labelCell({
                  backgroundColor: theme.surface,
                  backgroundImage: `linear-gradient(90deg, rgba(${rgb},0.06) 0%, rgba(${rgb},0) 100%)`,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 16, paddingRight: 16,
                  borderLeft: `3px solid ${proj.color}`,
                  borderRight: `1px solid ${theme.border}`,
                  borderTop: `1px solid ${theme.border}`,
                  borderBottom: `1px solid ${theme.border}`,
                }),
              }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: proj.color,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {proj.name}
                </span>
              </div>
              <div style={tlCell({
                background: `rgba(${rgb},0.04)`,
                borderTop: `1px solid ${theme.border}`,
                borderBottom: `1px solid ${theme.border}`,
                ...weekGrid,
              })}>
                <Crosshair height={PROJ_H} />
                <TodayLine height={PROJ_H} />
              </div>
            </div>

            {/* Task rows */}
            {visibleTasks.map(task => {
              const startOff = daysBetween(rangeStart, parseDay(task.start));
              const endOff = daysBetween(rangeStart, parseDay(task.end));
              const barLeft = startOff * effectiveDayW;
              const barW = Math.max((endOff - startOff + 1) * effectiveDayW, 8);
              const hasBaseline = !!task.originallyPlannedStart && !!task.originallyPlannedEnd;
              const baseStartOff = hasBaseline ? daysBetween(rangeStart, parseDay(task.originallyPlannedStart!)) : 0;
              const baseEndOff = hasBaseline ? daysBetween(rangeStart, parseDay(task.originallyPlannedEnd!)) : 0;
              const ghostLeft = baseStartOff * effectiveDayW;
              const ghostW = hasBaseline ? Math.max((baseEndOff - baseStartOff + 1) * effectiveDayW, 8) : 0;
              const isHl = !!selectedAssignees && task.assignees.some(a => selectedAssignees.has(a));

              const approxChipW =
                task.assignees.reduce((s, a) => s + a.length * 6.2 + 12, 0) +
                Math.max(0, task.assignees.length - 1) * 3;
              const chipAtRight = barLeft + barW + 6;
              const chipX =
                chipAtRight + approxChipW > totalDays * effectiveDayW - 4 && barLeft > approxChipW + 8
                  ? barLeft - approxChipW - 6
                  : chipAtRight;

              return (
                <div key={task.name} style={{ display: 'flex', height: ROW_H }}>
                  <div style={{
                    ...labelCell({
                      background: theme.surface,
                      display: 'flex', alignItems: 'center',
                      paddingLeft: 22, paddingRight: 10,
                      borderRight: `1px solid ${theme.borderInner}`,
                      borderBottom: `1px solid ${theme.borderSubtle}`,
                    }),
                  }}>
                    <span title={task.name} style={{
                      flex: 1, minWidth: 0,
                      fontSize: 15, color: theme.taskText,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 500,
                    }}>
                      {task.name}
                    </span>
                    <button
                      aria-label="Task details"
                      style={{
                        flexShrink: 0, marginLeft: 8,
                        width: 18, height: 18, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, lineHeight: 1, cursor: 'pointer',
                        fontFamily: "'JetBrains Mono', monospace",
                        border: `1px solid ${theme.chipBorder}`,
                        background: theme.chipBg,
                        color: theme.chipText,
                        padding: 0,
                        transition: 'color 0.12s, border-color 0.12s, background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        const b = e.currentTarget as HTMLButtonElement;
                        b.style.color = theme.accent;
                        b.style.borderColor = theme.accent;
                        b.style.background = `rgba(${hexRgb(theme.accent)},0.14)`;
                        openPopover(task, b.getBoundingClientRect());
                      }}
                      onMouseLeave={(e) => {
                        const b = e.currentTarget as HTMLButtonElement;
                        b.style.color = theme.chipText;
                        b.style.borderColor = theme.chipBorder;
                        b.style.background = theme.chipBg;
                        schedulePopoverClose();
                      }}
                      onFocus={(e) => openPopover(task, (e.currentTarget as HTMLButtonElement).getBoundingClientRect())}
                      onBlur={schedulePopoverClose}
                    >
                      ?
                    </button>
                  </div>

                  <div style={tlCell({
                    borderBottom: `1px solid ${theme.borderSubtle}`,
                    ...weekGrid,
                  })}>
                    <Crosshair height={ROW_H} />
                    <TodayLine height={ROW_H} />

                    {/* Baseline ghost (original plan). The live bar overshooting this
                        outline — or sitting right of it — is what communicates the slip. */}
                    {hasBaseline && (
                      <div style={{
                        position: 'absolute',
                        left: ghostLeft, top: '50%', transform: 'translateY(-50%)',
                        width: ghostW, height: 26, // taller than the live bar so the ghost frames it above/below
                        borderRadius: 6,
                        background: theme.ghostFill,
                        border: `1.5px dashed ${theme.ghostBorder}`,
                        opacity: selectedAssignees && !isHl ? 0.15 : 1,
                        transition: 'opacity 0.2s ease',
                        zIndex: 1, pointerEvents: 'none',
                      }} />
                    )}

                    {/* Live bar */}
                    <div style={{
                      position: 'absolute',
                      left: barLeft, top: '50%', transform: 'translateY(-50%)',
                      width: barW, height: 18, borderRadius: 5,
                      background: `linear-gradient(180deg, ${proj.color} 0%, ${proj.color}cc 100%)`,
                      boxShadow: `0 2px 8px rgba(${rgb},0.3), 0 0 0 0.5px rgba(${rgb},0.2)`,
                      opacity: selectedAssignees && !isHl ? 0.15 : 1,
                      transition: 'opacity 0.2s ease',
                      zIndex: 2,
                    }} />

                    {/* Assignee chips */}
                    {task.assignees.length > 0 && (
                      <div style={{
                        position: 'absolute', left: chipX,
                        top: '50%', transform: 'translateY(-50%)',
                        display: 'flex', gap: 3,
                        zIndex: 3, pointerEvents: 'none',
                        opacity: selectedAssignees && !isHl ? 0.2 : 1,
                        transition: 'opacity 0.2s ease',
                      }}>
                        {task.assignees.map(a => (
                          <span key={a} style={{
                            fontSize: 13, padding: '3px 8px', borderRadius: 4,
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: '0.02em', whiteSpace: 'nowrap',
                            background: isHl ? `rgba(${rgb},0.18)` : theme.chipBg,
                            color: isHl ? proj.color : theme.chipText,
                            border: `0.5px solid ${isHl ? `rgba(${rgb},0.4)` : theme.chipBorder}`,
                          }}>
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div style={{ height: 24 }} />

      {openTask && (
        <TaskInfoPopover
          task={openTask.task}
          anchorRect={openTask.anchorRect}
          theme={theme}
          onClose={() => setOpenTask(null)}
          onHoverEnter={cancelPopoverClose}
          onHoverLeave={schedulePopoverClose}
        />
      )}
    </div>
  );
}

interface TaskInfoPopoverProps {
  task: Task;
  anchorRect: DOMRect;
  theme: Theme;
  onClose: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}

interface PopoverPos {
  top: number;
  left: number;
  caretLeft: number;
  placement: 'above' | 'below';
}

function TaskInfoPopover({ task, anchorRect, theme, onClose, onHoverEnter, onHoverLeave }: TaskInfoPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;

    let left = anchorCenterX - POPOVER_W / 2;
    left = Math.max(POP_MARGIN, Math.min(left, window.innerWidth - POPOVER_W - POP_MARGIN));

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    let placement: 'above' | 'below';
    let top: number;
    if (spaceBelow >= h + POP_GAP + POP_MARGIN) {
      placement = 'below';
      top = anchorRect.bottom + POP_GAP;
    } else if (anchorRect.top >= h + POP_GAP + POP_MARGIN) {
      placement = 'above';
      top = anchorRect.top - POP_GAP - h;
    } else {
      placement = 'below';
      top = Math.max(POP_MARGIN, window.innerHeight - h - POP_MARGIN);
    }

    let caretLeft = anchorCenterX - left;
    caretLeft = Math.max(16, Math.min(caretLeft, POPOVER_W - 16));

    setPos({ top, left, caretLeft, placement });
  }, [anchorRect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose]);

  const isDark = theme.colorScheme === 'dark';

  return createPortal(
    <div
      ref={ref}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        position: 'fixed',
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        width: POPOVER_W,
        visibility: pos ? 'visible' : 'hidden',
        background: theme.raised,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        boxShadow: isDark
          ? '0 8px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)'
          : '0 8px 28px rgba(0,0,0,0.12)',
        padding: '14px 16px',
        zIndex: 1000,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {pos && (
        <div style={{
          position: 'absolute',
          left: pos.caretLeft - POP_CARET,
          ...(pos.placement === 'below' ? { top: -POP_CARET } : { bottom: -POP_CARET }),
          width: POP_CARET * 2,
          height: POP_CARET * 2,
          background: theme.raised,
          borderLeft: `1px solid ${theme.border}`,
          borderTop: `1px solid ${theme.border}`,
          transform: pos.placement === 'below' ? 'rotate(45deg)' : 'rotate(225deg)',
        }} />
      )}

      <div style={{
        fontSize: 15,
        fontWeight: 700,
        color: theme.text,
        marginBottom: 8,
        lineHeight: 1.3,
      }}>
        {task.name}
      </div>

      {task.description ? (
        <div
          style={{ fontSize: 14, color: theme.text, lineHeight: 1.5, wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: task.description }}
        />
      ) : (
        <div style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic', lineHeight: 1.5 }}>
          No description yet. Add a <code>description:</code> field to this task in your YAML.
        </div>
      )}
    </div>,
    document.body,
  );
}
