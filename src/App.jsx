import React, { useState, useMemo, useEffect } from 'react';
import { parseYaml } from './parseYaml.js';
import GanttChart from './GanttChart.jsx';
import { DARK, LIGHT } from './themes.js';

function getInitialTheme() {
  const stored = localStorage.getItem('theme');
  if (stored === 'light') return LIGHT;
  if (stored === 'dark') return DARK;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
}

export default function App() {
  const [tasks, setTasks] = useState(null);
  const [selectedAssignees, setSelectedAssignees] = useState(null);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const [filename, setFilename] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('file') || null;
  });

  useEffect(() => {
    document.documentElement.style.colorScheme = theme.colorScheme;
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === DARK ? LIGHT : DARK;
    setTheme(next);
    localStorage.setItem('theme', next === LIGHT ? 'light' : 'dark');
    document.documentElement.style.colorScheme = next.colorScheme;
  };

  const loadYaml = (text, name) => {
    try {
      setTasks(parseYaml(text));
      setSelectedAssignees(null);
      setError(null);
      if (name) setFilename(name);
    } catch (err) {
      setError(`Failed to parse YAML: ${err.message}`);
    }
  };

  useEffect(() => {
    const fetchYaml = () =>
      fetch('/api/yaml')
        .then((r) => {
          if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return;
          return r.text();
        })
        .then((text) => text && loadYaml(text))
        .catch(() => { });

    fetchYaml();
    const events = new EventSource('/api/events');
    events.onmessage = () => fetchYaml();
    return () => events.close();
  }, []);

  const allAssignees = useMemo(() => {
    if (!tasks) return [];
    return [...new Set(tasks.flatMap((t) => t.assignees))].sort();
  }, [tasks]);

  const reset = () => {
    setTasks(null);
    setFilename(null);
    setSelectedAssignees(null);
    setError(null);
  };

  const toggleAssignee = (name) => {
    setSelectedAssignees((prev) => {
      if (prev === null) return new Set([name]);
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next.size === 0 || next.size === allAssignees.length ? null : next;
    });
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
      {/* Card */}
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
        {/* Top bar */}
        <div style={{
          flexShrink: 0,
          background: `linear-gradient(180deg, rgba(255,255,255,${isDark ? '0.02' : '0.5'}) 0%, transparent 100%), ${theme.surface}`,
          borderBottom: `1px solid ${theme.border}`,
          padding: '16px 24px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {/* Row 1: title + file controls */}
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

            {error && (
              <span style={{ fontSize: 12, color: theme.error }}>{error}</span>
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
                e.currentTarget.style.color = theme.text;
                e.currentTarget.style.borderColor = theme.borderHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.textMuted;
                e.currentTarget.style.borderColor = theme.border;
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
              onMouseEnter={(e) => { e.currentTarget.style.color = theme.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = theme.textMuted; }}
            >
              {isDark ? '☀' : '🌙'}
            </button>
          </div>

          {/* Row 2: assignee filter pills */}
          {allAssignees.length > 0 && (
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
                  onClick={() => toggleAssignee(name)}
                >
                  {name}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* Chart / empty state */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
          {!tasks
            ? <EmptyState theme={theme} onLoad={loadYaml} />
            : <GanttChart tasks={tasks} selectedAssignees={selectedAssignees} theme={theme} />}
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

function EmptyState({ onLoad, theme }) {
  const [dragging, setDragging] = React.useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onLoad(ev.target.result, file.name.replace(/\.(yaml|yml)$/, ''));
    reader.readAsText(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
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
      {/* Ghost gantt illustration */}
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

      {/* Text */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 14,
          fontWeight: 500,
          color: dragging ? theme.accent : theme.textFaint,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          transition: 'color 0.15s',
        }}>
          {dragging ? 'Drop to load' : 'Drop a YAML file to begin'}
        </span>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children, theme }) {
  const [hovered, setHovered] = React.useState(false);
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
