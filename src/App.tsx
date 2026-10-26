import { useState, useMemo, useEffect, useRef } from 'preact/compat';
import type { JSX } from 'preact';
import { parseYaml } from './parseYaml';
import type { Roadmap, Task } from './parseYaml';
import GanttChart from './GanttChart';
import { DARK, LIGHT } from './themes';
import type { Theme } from './themes';
import { readUrlOptions } from './urlOptions';
import { hasChartableRange } from './timeline';
import { assigneesOf, toggleAssignee, pruneAssigneeFilter } from './assigneeFilter';
import { saveMove } from './saveMove';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'light') return LIGHT;
  if (stored === 'dark') return DARK;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
}

export default function App() {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  // The token of the last roadmap that *parsed*, not of the last fetch: one
  // from a file that failed to parse can match a later edit whose indices have
  // shifted under the stale chart, and the server would move the wrong task.
  // `null` whenever the chart is not showing the served file.
  const [version, setVersion] = useState<string | null>(null);
  // Mirrors `version` for `fetchYaml`, which the SSE handler captures once and
  // so would otherwise compare against the first render's `null` forever.
  const shownVersion = useRef<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Read on first render, not at module scope: touching `window` on import
  // throws outside a browser and makes this module unimportable in the tests.
  const [{ file, hideAssigneeFilter, hideEmptyProjects }] = useState(() => readUrlOptions(window.location.search));
  const [filename, setFilename] = useState<string | null>(file);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme.colorScheme;
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === DARK ? LIGHT : DARK;
    setTheme(next);
    localStorage.setItem('theme', next === LIGHT ? 'light' : 'dark');
    document.documentElement.style.colorScheme = next.colorScheme;
  };

  // `served` marks a reload of the watched file, which keeps the filter; a
  // dropped file is a different roadmap, so it starts from All.
  const loadYaml = (text: string, name?: string, served?: { version: string | null }): boolean => {
    try {
      const parsed = parseYaml(text);
      setRoadmap(parsed);
      if (served) {
        const all = assigneesOf(parsed.tasks);
        setSelectedAssignees((prev) => pruneAssigneeFilter(prev, all));
      } else {
        setSelectedAssignees(null);
      }
      shownVersion.current = served?.version ?? null;
      setVersion(shownVersion.current);
      setError(null);
      if (name) setFilename(name);
      return true;
    } catch (err) {
      setError(`Failed to parse YAML: ${(err as Error).message}`);
      return false;
    }
  };

  const fetchYaml = async (): Promise<boolean> => {
    try {
      const r = await fetch('/api/yaml');
      if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return false;
      // `?file=` is only a preference: it is gone whenever the page was opened
      // bare at the server root instead of through the URL the CLI prints, and
      // the response header is the same answer, always available.
      const servedPath = r.headers.get('X-Yaml-Path');
      const text = await r.text();
      if (!text) return false;
      const fetchedVersion = r.headers.get('X-Yaml-Version');
      // A save is followed by two reloads, its own and the SSE one, and the
      // second would hand `GanttChart` new `tasks` that cancel a drag begun in
      // between. Same bytes as on screen means there is nothing to redraw.
      if (fetchedVersion !== null && fetchedVersion === shownVersion.current) {
        setError(null);
        return true;
      }
      return loadYaml(text, file ?? (servedPath ? decodeURIComponent(servedPath) : undefined), {
        version: fetchedVersion,
      });
    } catch {
      // No server behind the page — the drop zone is still a way in.
      return false;
    }
  };

  const showNotice = (message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };

  const onMoveTask = version === null
    ? undefined
    : (task: Task, start: string, end: string) => saveMove(
        { version, project: task.project, index: task.index, start, end },
        { reload: fetchYaml, notify: showNotice },
      );

  useEffect(() => {
    fetchYaml();
    const events = new EventSource('/api/events');
    events.onmessage = () => fetchYaml();
    return () => events.close();
  }, []);

  const allAssignees = useMemo(() => {
    if (!roadmap) return [];
    return assigneesOf(roadmap.tasks);
  }, [roadmap]);

  const reset = () => {
    setRoadmap(null);
    setFilename(null);
    setSelectedAssignees(null);
    shownVersion.current = null;
    setVersion(null);
    setError(null);
    setNotice(null);
  };

  const displayName = filename;

  const isDark = theme.colorScheme === 'dark';

  return (
    <div style={{
      minHeight: '100vh',
      background: `
        radial-gradient(ellipse 80% 60% at 50% 40%, ${isDark ? 'rgba(79,142,247,0.04)' : 'rgba(79,142,247,0.06)'} 0%, transparent 70%),
        radial-gradient(ellipse 60% 50% at 80% 70%, ${isDark ? 'rgba(52,211,153,0.02)' : 'rgba(52,211,153,0.03)'} 0%, transparent 60%),
        ${theme.bg}
      `,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      color: theme.text,
      boxSizing: 'border-box',
    }}>
      <div style={{
        background: theme.surface,
        borderRadius: 16,
        border: `1px solid ${theme.border}`,
        boxShadow: isDark
          ? `
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 1px 0 rgba(255,255,255,0.05) inset,
            0 -1px 0 rgba(0,0,0,0.3) inset,
            0 8px 24px rgba(0,0,0,0.4),
            0 24px 60px rgba(0,0,0,0.35),
            0 0 80px rgba(79,142,247,0.03)
          `
          : `
            0 0 0 1px rgba(255,255,255,0.6) inset,
            0 1px 0 rgba(255,255,255,0.8) inset,
            0 8px 24px rgba(0,0,0,0.08),
            0 24px 60px rgba(0,0,0,0.06)
          `,
        width: 'fit-content',
        maxWidth: 'calc(100vw - 96px)',
        maxHeight: 'calc(100vh - 96px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          flexShrink: 0,
          background: `linear-gradient(180deg, rgba(255,255,255,${isDark ? '0.02' : '0.5'}) 0%, transparent 100%), ${theme.surface}`,
          borderBottom: `1px solid ${theme.border}`,
          padding: '16px 24px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: theme.accent,
              fontFamily: "'JetBrains Mono', monospace",
              flexShrink: 0,
            }}>
              yaml-to-gantt
            </span>

            <div style={{ width: 1, height: 16, background: theme.border, flexShrink: 0 }} />

            {displayName && (
              <span style={{
                fontSize: 14,
                color: theme.textMuted,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {displayName}
              </span>
            )}

            {/* `notice` can carry a server message, so it stays a text child. */}
            {(error ?? notice) && (
              <span style={{ fontSize: 12, color: theme.error }}>{error ?? notice}</span>
            )}

            <button
              onClick={reset}
              title="Reset to empty state"
              style={{
                fontSize: 14,
                color: theme.textMuted,
                cursor: 'pointer',
                padding: '5px 14px',
                border: `1px solid ${theme.border}`,
                borderRadius: 5,
                background: 'none',
                letterSpacing: '0.03em',
                transition: 'color 0.12s, border-color 0.12s',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                marginLeft: 'auto',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = theme.text;
                (e.currentTarget as HTMLButtonElement).style.borderColor = theme.borderHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted;
                (e.currentTarget as HTMLButtonElement).style.borderColor = theme.border;
              }}
            >
              New
            </button>

            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: 16,
                lineHeight: 1,
                color: theme.textMuted,
                transition: 'color 0.12s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = theme.text; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted; }}
            >
              {isDark ? '☀' : '🌙'}
            </button>
          </div>

          {!hideAssigneeFilter && allAssignees.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: theme.textMuted,
                fontFamily: "'JetBrains Mono', monospace",
                marginRight: 5,
              }}>
                Assignee
              </span>

              <Pill theme={theme} active={!selectedAssignees} onClick={() => setSelectedAssignees(null)}>
                All
              </Pill>

              {allAssignees.map((name) => (
                <Pill
                  key={name}
                  theme={theme}
                  active={selectedAssignees?.has(name) ?? false}
                  onClick={() => setSelectedAssignees((prev) => toggleAssignee(prev, name, allAssignees))}
                >
                  {name}
                </Pill>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
          {/* A zero-task array is a valid parse, but gives GanttChart no dates
              to build a range from — it would render NaN geometry. */}
          {!roadmap || !hasChartableRange(roadmap.tasks)
            ? <EmptyState
                theme={theme}
                onLoad={loadYaml}
                message={roadmap ? 'No tasks in this file yet — add one to see the chart' : undefined}
              />
            : <GanttChart
                tasks={roadmap.tasks}
                projects={roadmap.projects}
                periods={roadmap.periods}
                selectedAssignees={selectedAssignees}
                hideEmptyProjects={hideEmptyProjects}
                theme={theme}
                onMoveTask={onMoveTask}
              />}
        </div>
      </div>
    </div>
  );
}

const GHOST_BARS = [
  { offset: 0,   barW: 180, color: '#60a5fa' },
  { offset: 60,  barW: 130, color: '#34d399' },
  { offset: 24,  barW: 220, color: '#f472b6' },
  { offset: 120, barW: 100, color: '#fb923c' },
  { offset: 40,  barW: 160, color: '#a78bfa' },
  { offset: 80,  barW: 90,  color: '#fbbf24' },
];

interface EmptyStateProps {
  onLoad: (text: string, name?: string) => void;
  theme: Theme;
  message?: string;
}

function EmptyState({ onLoad, theme, message = 'Drop a YAML file to begin' }: EmptyStateProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onLoad(ev.target!.result as string, file.name.replace(/\.(yaml|yml)$/, ''));
    reader.readAsText(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={handleDrop}
      style={{
        flex: 1,
        minWidth: 680,
        minHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 44,
        padding: '40px 56px',
        borderRadius: 12,
        margin: 8,
        border: `1.5px dashed ${dragging ? 'rgba(79,142,247,0.5)' : 'transparent'}`,
        background: dragging ? 'rgba(79,142,247,0.04)' : 'transparent',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, transition: 'opacity 0.15s', opacity: dragging ? 0.3 : 1 }}>
        {GHOST_BARS.map((bar, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 130, height: 10, background: theme.border, borderRadius: 3, flexShrink: 0 }} />
            <div style={{ width: 20, flexShrink: 0 }} />
            <div style={{ width: bar.offset, flexShrink: 0 }} />
            <div style={{
              width: bar.barW,
              height: 10,
              background: bar.color,
              borderRadius: 3,
              opacity: theme.colorScheme === 'dark' ? 0.15 : 0.28,
            }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 14,
          fontWeight: 500,
          color: dragging ? theme.accent : theme.textFaint,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          transition: 'color 0.15s',
        }}>
          {dragging ? 'Drop to load' : message}
        </span>
      </div>
    </div>
  );
}

interface PillProps {
  active: boolean;
  onClick: () => void;
  children: preact.ComponentChildren;
  theme: Theme;
}

function Pill({ active, onClick, children, theme }: PillProps) {
  const [hovered, setHovered] = useState(false);
  const isDark = theme.colorScheme === 'dark';
  const colors = isDark
    ? {
        activeBg: '#dde4f0', activeBorder: '#dde4f0', activeColor: theme.bg,
        activeShadow: '0 0 12px rgba(221,228,240,0.15)',
        hoveredBg: theme.raised, hoveredBorder: '#3a4e6a', hoveredColor: '#8aa4cc',
        defaultBorder: theme.border, defaultColor: theme.textMuted,
      }
    : {
        activeBg: '#1a2133', activeBorder: '#1a2133', activeColor: '#f0f4ff',
        activeShadow: '0 0 12px rgba(26,33,51,0.12)',
        hoveredBg: '#f0f2f5', hoveredBorder: '#ccd0da', hoveredColor: '#3a4a66',
        defaultBorder: theme.border, defaultColor: theme.textMuted,
      };
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 14,
        padding: '5px 14px',
        borderRadius: 20,
        border: '0.5px solid',
        cursor: 'pointer',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        transition: 'all 0.15s ease',
        transform: active ? 'scale(1)' : hovered ? 'scale(1.03)' : 'scale(1)',
        background: active ? colors.activeBg : hovered ? colors.hoveredBg : 'transparent',
        borderColor: active ? colors.activeBorder : hovered ? colors.hoveredBorder : colors.defaultBorder,
        color: active ? colors.activeColor : hovered ? colors.hoveredColor : colors.defaultColor,
        outline: 'none',
        fontWeight: active ? 600 : 400,
        boxShadow: active ? colors.activeShadow : 'none',
      }}
    >
      {children}
    </button>
  );
}
