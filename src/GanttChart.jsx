import React, { useEffect, useMemo, useRef, useState } from 'react';

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

function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(',');
}

function parseDay(s) {
  return new Date(s + 'T00:00:00');
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86_400_000);
}

export default function GanttChart({ tasks, selectedAssignees, theme }) { // ← theme
  const containerRef = useRef(null);
  const [hoverOffset, setHoverOffset] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);

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
    const allDates = tasks.flatMap(t => [parseDay(t.start), parseDay(t.end)]);
    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

    const rangeStart = new Date(minDate);
    rangeStart.setDate(rangeStart.getDate() - RANGE_PAD);
    rangeStart.setHours(0, 0, 0, 0);

    const rangeEnd = new Date(maxDate);
    rangeEnd.setDate(rangeEnd.getDate() + RANGE_PAD + 2);

    const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

    const firstMonday = new Date(rangeStart);
    while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1);
    const firstMondayOffset = daysBetween(rangeStart, firstMonday);

    const months = [];
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      const mStart = new Date(Math.max(cursor.getTime(), rangeStart.getTime()));
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const mEnd = new Date(Math.min(nextMonth.getTime() - 1, rangeEnd.getTime()));
      months.push({
        label: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        offset: daysBetween(rangeStart, mStart),
        width: daysBetween(mStart, mEnd) + 1,
      });
      cursor = nextMonth;
    }

    return { rangeStart, totalDays, months, firstMondayOffset };
  }, [tasks]);

  const dayTicks = useMemo(() => {
    const ticks = [];
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
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const off = daysBetween(rangeStart, t);
    return off >= 0 && off < totalDays ? off : null;
  }, [rangeStart, totalDays]);

  const projects = useMemo(() => {
    const names = [...new Set(tasks.map(t => t.project))];
    return names.map(name => ({
      name,
      color: colorMap[name],
      tasks: tasks.filter(t => t.project === name),
    }));
  }, [tasks, colorMap]);

  const isVisible = (task) =>
    !selectedAssignees ||
    task.assignees.some(a => selectedAssignees.has(a));

  const timelineMinW = totalDays * DAY_W;
  const effectiveDayW = containerWidth > 0
    ? Math.max(DAY_W, (containerWidth - LABEL_W) / totalDays)
    : DAY_W;

  // ← theme: weekLineAlpha and weekBandAlpha replace hardcoded rgba values
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

  const handleMouseMove = (e) => {
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

  const Crosshair = ({ height }) => hoverOffset === null ? null : (
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

  const TodayLine = ({ height }) => todayOffset === null ? null : (
    <div style={{
      position: 'absolute', left: todayOffset * effectiveDayW, top: 0,
      width: 2, height,
      background: `linear-gradient(180deg, ${ACCENT}, rgba(79,142,247,0.6))`,
      boxShadow: `0 0 14px rgba(79,142,247,0.5), 0 0 4px rgba(79,142,247,0.8)`,
      zIndex: 4, pointerEvents: 'none',
    }} />
  );

  const tlCell = (extra = {}) => ({
    flex: 1,
    minWidth: timelineMinW,
    position: 'relative',
    ...extra,
  });

  const labelCell = (extra = {}) => ({
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
      style={{ flex: 1, overflow: 'auto', background: theme.surface }} // ← theme
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverOffset(null)}
    >

      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', height: HDR_H,
        background: `linear-gradient(180deg, ${theme.headerBg} 0%, ${theme.surface} 100%)`, // ← theme
        borderBottom: `1px solid ${theme.border}`, // ← theme
      }}>
        {/* Corner */}
        <div style={{
          ...labelCell(),
          zIndex: 31,
          background: `linear-gradient(180deg, ${theme.headerBg} 0%, ${theme.surface} 100%)`, // ← theme
          borderRight: `1px solid ${theme.border}`, // ← theme
        }} />

        {/* Month + day header */}
        <div style={tlCell()}>

          {/* Month row */}
          <div style={{ position: 'relative', height: 30, borderBottom: `1px solid ${theme.borderInner}` }}> {/* ← theme */}
            {months.map((m, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: m.offset * effectiveDayW, width: m.width * effectiveDayW, height: 30,
                display: 'flex', alignItems: 'center', paddingLeft: 12,
                fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: theme.monthLabel, // ← theme
                fontFamily: "'JetBrains Mono', monospace",
                overflow: 'hidden',
                borderLeft: i > 0 ? `1px solid ${theme.borderInner}` : 'none', // ← theme
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
                // ← theme: weekend/monday/regular day colors
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
                left: hoverOffset * effectiveDayW + effectiveDayW / 2,
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

      {/* ── Project sections ── */}
      {projects.map(proj => {
        const rgb = hexRgb(proj.color);
        const visibleTasks = proj.tasks.filter(isVisible);
        if (visibleTasks.length === 0) return null;

        return (
          <React.Fragment key={proj.name}>

            {/* Project header row */}
            <div style={{ display: 'flex', height: PROJ_H }}>
              <div style={{
                ...labelCell({
                  background: `linear-gradient(90deg, rgba(${rgb},0.06) 0%, ${theme.surface} 100%)`, // ← theme
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 16, paddingRight: 16,
                  borderLeft: `3px solid ${proj.color}`,
                  borderRight: `1px solid ${theme.border}`, // ← theme
                  borderTop: `1px solid ${theme.border}`, // ← theme
                  borderBottom: `1px solid ${theme.border}`, // ← theme
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
                borderTop: `1px solid ${theme.border}`, // ← theme
                borderBottom: `1px solid ${theme.border}`, // ← theme
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
                      background: theme.surface, // ← theme
                      display: 'flex', alignItems: 'center',
                      paddingLeft: 22, paddingRight: 10,
                      borderRight: `1px solid ${theme.borderInner}`, // ← theme
                      borderBottom: `1px solid ${theme.borderSubtle}`, // ← theme
                    }),
                  }}>
                    <span title={task.name} style={{
                      fontSize: 15, color: theme.taskText, // ← theme
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 500,
                    }}>
                      {task.name}
                    </span>
                  </div>

                  <div style={tlCell({
                    borderBottom: `1px solid ${theme.borderSubtle}`, // ← theme
                    ...weekGrid,
                  })}>
                    <Crosshair height={ROW_H} />
                    <TodayLine height={ROW_H} />

                    {/* Bar */}
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
                            // ← theme: chipBg/chipText/chipBorder for unselected; project color for selected
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
          </React.Fragment>
        );
      })}

      <div style={{ height: 24 }} />
    </div>
  );
}
