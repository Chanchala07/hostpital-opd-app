import { Alert } from 'react-native';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "October" */
export function monthName(date: Date): string {
  return MONTHS_LONG[date.getMonth()];
}

/** "09:30" (24h) → "09:30 AM"; pass `withPeriod: false` for "09:30". */
export function formatSlotTime(time: string, withPeriod = true): string {
  const [h, m] = time.split(':').map(Number);
  const hh = String(h % 12 || 12).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return withPeriod ? `${hh}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${hh}:${mm}`;
}

/** "Thu, 15 Oct" */
export function formatShortDate(date: Date): string {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** { weekday: 'Mon', day: 19, month: 'Oct' } */
export function dateParts(date: Date) {
  return {
    weekday: DAYS[date.getDay()],
    day: date.getDate(),
    month: MONTHS[date.getMonth()],
  };
}

/** "10:15 AM"; pass `withPeriod: false` for "10:15". */
export function formatTime(date: Date, withPeriod = true): string {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const time = `${h % 12 || 12}:${m}`;
  return withPeriod ? `${time} ${h < 12 ? 'AM' : 'PM'}` : time;
}

/** "14 Oct, 9:02 PM" */
export function formatDayTime(date: Date): string {
  const { day, month } = dateParts(date);
  return `${day} ${month}, ${formatTime(date)}`;
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** "Dr. Sarah Johnson" → "SJ" */
export function initialsOf(name: string): string {
  const parts = name
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Placeholder for actions that aren't wired to a backend yet. */
export function comingSoon(feature: string) {
  Alert.alert(feature, 'This will be connected in a later step.');
}
