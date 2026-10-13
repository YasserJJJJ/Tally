'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { type Entry, type Profile, addDays, average, parseDate } from '@/lib/journal';
import { kg, monthDay, shortDay } from '@/lib/format';

type Point = { date: string; weight: number | null; trend: number | null };

const HEIGHT = 240;

function paceText(gap: number) {
  if (Math.abs(gap) < 0.05) return 'on goal pace';
  return `${Math.abs(gap).toFixed(1)} kg ${gap > 0 ? 'above' : 'below'} goal pace`;
}
const PAD = { top: 14, right: 46, bottom: 30, left: 4 };

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Daily weigh-ins, a trailing 7-day average, and the pace implied by the profile goal. */
export function WeightChart({ entries, today, profile, days = 56, interactive = true }: {
  entries: Entry[]; today: string; profile: Pick<Profile, 'goal' | 'pace'>; days?: number; interactive?: boolean;
}) {
  const [frameRef, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const start = addDays(today, -(days - 1));

  const points: Point[] = useMemo(() => {
    const weights = new Map(entries.filter(e => e.weight != null).map(e => [e.date, e.weight as number]));
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(start, i);
      const window = Array.from({ length: 7 }, (_, k) => weights.get(addDays(date, -k))).filter((w): w is number => w != null);
      return { date, weight: weights.get(date) ?? null, trend: window.length >= 3 ? average(window) : null };
    });
  }, [entries, start, days]);

  const logged = points.filter(p => p.weight != null).length;
  // The measured wrapper is always rendered so the width is known once data arrives.
  return <div ref={frameRef} className="chart-wrap">
    {logged < 2
      ? <div className="chart-empty"><p>Your weight curve appears here after a few weigh-ins.</p></div>
      : <Plot points={points} width={width} days={days} profile={profile} hover={hover} setHover={interactive ? setHover : null} />}
  </div>;
}

function Plot({ points, width, days, profile, hover, setHover }: {
  points: Point[]; width: number; days: number; profile: Pick<Profile, 'goal' | 'pace'>;
  hover: number | null; setHover: ((i: number | null) => void) | null;
}) {
  const interactive = setHover !== null;

  // Goal pace starts from the first trend value (or first weigh-in) in the window.
  const anchorIndex = points.findIndex(p => p.trend != null || p.weight != null);
  const anchor = points[anchorIndex].trend ?? points[anchorIndex].weight!;
  const perDay = (profile.goal === 'maintain' ? 0 : profile.goal === 'gain' ? profile.pace : -profile.pace) / 7;
  const goalAt = (i: number) => anchor + perDay * (i - anchorIndex);

  const values = [
    ...points.flatMap(p => [p.weight, p.trend]).filter((v): v is number => v != null),
    goalAt(anchorIndex), goalAt(days - 1),
  ];
  let lo = Math.floor((Math.min(...values) - 0.2) * 2) / 2;
  let hi = Math.ceil((Math.max(...values) + 0.2) * 2) / 2;
  if (hi - lo < 1.5) { const mid = (hi + lo) / 2; lo = Math.floor((mid - 0.75) * 2) / 2; hi = lo + 1.5; }
  const step = hi - lo > 4 ? 1 : 0.5;
  // Whole-kilo steps need whole-kilo bounds, or every label would sit half a kilo off its line.
  if (step === 1) { lo = Math.floor(lo); hi = Math.ceil(hi); }
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

  const plotW = width - PAD.left - PAD.right, plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (days - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

  // Break the trend line where there is not enough data for an average.
  const trendPath = points.reduce((path, p, i) => {
    if (p.trend == null) return path;
    const command = i > 0 && points[i - 1].trend != null ? 'L' : 'M';
    return `${path}${command}${x(i).toFixed(1)},${y(p.trend).toFixed(1)}`;
  }, '');

  const mondays = points.map((p, i) => ({ p, i })).filter(({ p }) => parseDate(p.date).getDay() === 1);
  const minLabelGap = 54;
  const xLabels = mondays.reduce<typeof mondays>((kept, m) =>
    !kept.length || x(m.i) - x(kept[kept.length - 1].i) >= minLabelGap ? [...kept, m] : kept, []);

  const lastIndex = points.reduce((last, p, i) => (p.weight != null || p.trend != null ? i : last), -1);
  const focus = hover ?? lastIndex;
  const focused = points[focus];
  const firstTrend = points.find(p => p.trend != null)?.trend;
  const lastTrend = [...points].reverse().find(p => p.trend != null)?.trend;
  const summary = firstTrend != null && lastTrend != null
    ? `7-day average weight went from ${kg(firstTrend)} to ${kg(lastTrend)} kg over the last ${days / 7} weeks.`
    : `Weight over the last ${days / 7} weeks.`;

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const i = Math.round(((event.clientX - bounds.left - PAD.left) / plotW) * (days - 1));
    setHover?.(Math.max(0, Math.min(days - 1, i)));
  }

  return <figure className="chart">
    <figcaption className="chart-readout">
      <span className="readout-date">{shortDay(focused.date)} {monthDay(focused.date)}</span>
      <span>{focused.weight != null ? <><b>{kg(focused.weight)}</b> kg weighed</> : 'No weigh-in'}</span>
      {focused.trend != null ? <span><b>{kg(focused.trend)}</b> kg 7-day average</span> : null}
      {focused.trend != null ? <span className="readout-goal">{paceText(focused.trend - goalAt(focus))}</span> : null}
    </figcaption>
    <div className="chart-frame">
      <svg width={width} height={HEIGHT} role="img" aria-label={summary}
        onPointerMove={interactive ? onMove : undefined} onPointerLeave={interactive ? () => setHover?.(null) : undefined}>
        {ticks.map(t => <g key={t}>
          <line className="chart-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
          <text className="chart-tick" x={width - 4} y={y(t) + 4} textAnchor="end">{t.toFixed(step < 1 ? 1 : 0)}</text>
        </g>)}
        {xLabels.map(({ p, i }) => <text key={p.date} className="chart-tick" x={x(i)} y={HEIGHT - 8} textAnchor="start">{monthDay(p.date)}</text>)}
        {mondays.map(({ p, i }) => <line key={p.date} className="chart-week" x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + plotH} />)}
        <line className="chart-goal" x1={x(anchorIndex)} x2={x(days - 1)} y1={y(goalAt(anchorIndex))} y2={y(goalAt(days - 1))} />
        {points.map((p, i) => p.weight == null ? null
          : <circle key={p.date} className="chart-dot" cx={x(i)} cy={y(p.weight)} r={2.6} />)}
        <path className="chart-trend" d={trendPath} />
        {interactive ? <line className="chart-cursor" x1={x(focus)} x2={x(focus)} y1={PAD.top} y2={PAD.top + plotH} /> : null}
        {focused.trend != null ? <circle className="chart-focus" cx={x(focus)} cy={y(focused.trend)} r={4.5} /> : null}
      </svg>
    </div>
    <div className="chart-legend" aria-hidden="true">
      <span><i className="key-dot" />Daily weigh-in</span>
      <span><i className="key-trend" />7-day average</span>
      <span><i className="key-goal" />Goal pace</span>
    </div>
  </figure>;
}
