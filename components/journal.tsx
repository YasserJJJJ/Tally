'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type Entry, type Recommendation, addDays, monday, weekly } from '@/lib/journal';
import { dayOfMonth, fmt, isoWeek, kg, monthDay, shortDay, signed, sportLabel, weekRange, whole } from '@/lib/format';

type Week = ReturnType<typeof weekly>;

const targetStatus: Record<Recommendation['status'], string> = {
  baseline: 'Your starting target',
  collecting: 'Your starting target',
  uncertain: 'Starting target · pattern not clear yet',
  experimental: 'Adjusted from your logs',
};

export function WeekFigures({ current, previous, recommendation, onExplain }: {
  current: Week; previous: Week; recommendation: Recommendation; onExplain: () => void;
}) {
  const change = current.weight != null && previous.weight != null ? current.weight - previous.weight : null;
  return <dl className="figures">
    <div className="figure">
      <dt>Weight</dt>
      <dd><span className="figure-value">{kg(current.weight)}</span><span className="unit">kg</span></dd>
      <dd className="figure-note">{change != null ? <>{signed(change)} kg on last week</> : current.weights ? 'Average of this week' : 'No weigh-ins this week'}</dd>
    </div>
    <div className="figure">
      <dt>Calories</dt>
      <dd><span className="figure-value">{whole(current.calories)}</span><span className="unit">kcal / day</span></dd>
      <dd className="figure-note">{current.meals} of 7 days logged</dd>
    </div>
    <div className="figure figure-target">
      <dt>Target</dt>
      <dd><span className="figure-value">{fmt(recommendation.target)}</span><span className="unit">kcal / day</span></dd>
      <dd className="figure-note">{targetStatus[recommendation.status]} · <button type="button" className="text-link" onClick={onExplain}>How it’s set</button></dd>
    </div>
    <div className="figure">
      <dt>Steps</dt>
      <dd><span className="figure-value">{whole(current.steps)}</span><span className="unit">a day</span></dd>
      <dd className="figure-note">{current.step_logs ? `${current.step_logs} of 7 days logged` : 'No steps logged this week'}</dd>
    </div>
  </dl>;
}

function activity(entry: Entry | undefined) {
  if (!entry?.sport_type) return null;
  if (entry.sport_type === 'none') return 'Rest day';
  return `${sportLabel(entry.sport_type)} · ${entry.activity_minutes} min`;
}

/** One row per day of a week, plus the week's averages. */
export function DayRows({ start, entries, today, onEdit }: {
  start: string; entries: Entry[]; today: string; onEdit: (date: string) => void;
}) {
  const week = weekly(entries, start);
  return <div className="days">
    <div className="days-head" aria-hidden="true">
      <span>Day</span><span>Weight</span><span>Calories</span><span>Steps</span><span>Activity</span><span />
    </div>
    <ol className="day-list">
      {week.days.map((entry, i) => {
        const date = addDays(start, i), future = date > today, isToday = date === today;
        const empty = !entry || (entry.weight == null && entry.calories == null && entry.steps == null && !entry.sport_type);
        const label = `${shortDay(date)} ${monthDay(date)}: ${empty ? 'nothing logged' : `${kg(entry?.weight)} kg, ${whole(entry?.calories)} kcal, ${whole(entry?.steps)} steps`}`;
        return <li key={date}>
          <button type="button" className={`day-row${isToday ? ' is-today' : ''}${empty ? ' is-empty' : ''}`} disabled={future}
            onClick={() => onEdit(date)} aria-label={future ? `${shortDay(date)} ${monthDay(date)}` : `${empty ? 'Log' : 'Edit'} ${label}`}>
            <span className="d-day"><b>{shortDay(date)}</b> {dayOfMonth(date)}{isToday ? <em>Today</em> : null}</span>
            <span className="d-num d-weight">{kg(entry?.weight)}<small>kg</small></span>
            <span className="d-num d-cal">{whole(entry?.calories)}<small>kcal</small></span>
            <span className="d-num d-steps">{whole(entry?.steps)}<small>steps</small></span>
            <span className="d-activity">{activity(entry) ?? '—'}</span>
            <span className="d-action">{future ? '' : empty ? 'Log' : 'Edit'}</span>
          </button>
        </li>;
      })}
    </ol>
    <div className="day-average">
      <span className="d-day">Average</span>
      <span className="d-num d-weight">{kg(week.weight)}<small>kg</small></span>
      <span className="d-num d-cal">{whole(week.calories)}<small>kcal</small></span>
      <span className="d-num d-steps">{whole(week.steps)}<small>steps</small></span>
      <span className="d-activity">{week.activity_minutes ? `${fmt(week.activity_minutes)} min of sport` : '—'}</span>
      <span />
    </div>
  </div>;
}

const PAGE = 4;

/** Completed weeks, newest first, each expandable to its days. Always lists at least one page so recent days can be backfilled. */
export function EarlierWeeks({ entries, today, targetFor, onEdit }: {
  entries: Entry[]; today: string; targetFor: (start: string) => Recommendation; onEdit: (date: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const thisWeek = monday(today);
  const earliest = addDays(thisWeek, -7 * PAGE);
  const first = entries.length && monday(entries[0].date) < earliest ? monday(entries[0].date) : earliest;
  const weeks: string[] = [];
  for (let start = addDays(thisWeek, -7); start >= first; start = addDays(start, -7)) weeks.push(start);

  // The list can shrink (journal cleared), so never show a page past the end.
  const pages = Math.ceil(weeks.length / PAGE), current = Math.min(page, pages - 1);
  const shown = weeks.slice(current * PAGE, current * PAGE + PAGE);
  return <div className="weeks">
    <ul className="week-list">
      {shown.map(start => {
        const week = weekly(entries, start), expanded = open === start;
        return <li key={start} className={expanded ? 'is-open' : undefined}>
          <button type="button" className="week-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : start)}>
            <span className="w-name"><small>Week {isoWeek(start)}</small>{weekRange(start, addDays(start, 6))}</span>
            <span className="d-num d-weight">{kg(week.weight)}<small>kg</small></span>
            <span className="d-num d-cal">{whole(week.calories)}<small>kcal</small></span>
            <span className="d-num d-steps">{whole(week.steps)}<small>steps</small></span>
            <span className="w-meta">{week.weights} weigh-ins · target {fmt(targetFor(start).target)}</span>
            <ChevronDown className="w-chevron" size={16} aria-hidden="true" />
          </button>
          {expanded ? <DayRows start={start} entries={entries} today={today} onEdit={onEdit} /> : null}
        </li>;
      })}
    </ul>
    {pages > 1 ? <div className="pager">
      <button type="button" className="text-link" disabled={current === 0} onClick={() => { setPage(current - 1); setOpen(null); }}>Newer</button>
      <span>{current + 1} of {pages}</span>
      <button type="button" className="text-link" disabled={current === pages - 1} onClick={() => { setPage(current + 1); setOpen(null); }}>Older</button>
    </div> : null}
  </div>;
}
