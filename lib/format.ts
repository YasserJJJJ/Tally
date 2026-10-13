import { parseDate } from '@/lib/journal';

const integer = new Intl.NumberFormat('en-US');

export const fmt = (n: number) => integer.format(n);
export const kg = (n: number | null | undefined, digits = 1) => n == null ? '—' : n.toFixed(digits);
export const whole = (n: number | null | undefined) => n == null ? '—' : fmt(Math.round(n));
export const signed = (n: number, digits = 2) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

export const shortDay = (date: string) => parseDate(date).toLocaleDateString('en-US', { weekday: 'short' });
export const dayOfMonth = (date: string) => parseDate(date).getDate();
export const monthDay = (date: string) => parseDate(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const longDate = (date: string) => parseDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** "12 – 18 October" or "28 September – 4 October". */
export function weekRange(start: string, end: string) {
  const a = parseDate(start), b = parseDate(end);
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}

/** ISO 8601 week number for a Monday-based week. */
export function isoWeek(date: string) {
  const d = parseDate(date);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

export const SPORTS = [
  { value: 'none', label: 'Rest day' },
  { value: 'strength', label: 'Strength training' },
  { value: 'endurance', label: 'Cardio' },
  { value: 'team', label: 'Team sport' },
  { value: 'other', label: 'Other' },
] as const;

export const sportLabel = (value: string | null | undefined) => SPORTS.find(s => s.value === value)?.label ?? null;
