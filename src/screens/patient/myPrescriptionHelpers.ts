// How a prescription reads in the patient app: its date, whether the
// medicines are still being taken, and a short list of them.

import type { MyPrescription } from '../../api/myPrescriptions';
import { MONTHS } from '../../utils/format';

/** "2026-11-18" → that day, local time. */
export function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "18 Nov 2026" */
export function longDate(iso: string): string {
  const d = dateOf(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The last day of the longest course: a visit on the 18th with 5 days of
 * medicine is taken 18th–22nd. null without medicines.
 */
export function lastDoseDay(rx: Pick<MyPrescription, 'date' | 'medicines'>) {
  const days = Math.max(0, ...rx.medicines.map(m => m.durationDays));
  if (days === 0) {
    return null;
  }
  const end = dateOf(rx.date);
  end.setDate(end.getDate() + days - 1);
  return end;
}

/** Still taking some of these medicines today. */
export function isOngoing(
  rx: Pick<MyPrescription, 'date' | 'medicines'>,
  now: Date,
): boolean {
  const end = lastDoseDay(rx);
  if (!end) {
    return false;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() >= today.getTime();
}

/** "Paracetamol 650 mg, Cetirizine 10 mg +1 more" */
export function medicinesPreview(
  rx: Pick<MyPrescription, 'medicines'>,
  shown = 2,
): string {
  if (rx.medicines.length === 0) {
    return 'No medicines';
  }
  const names = rx.medicines.slice(0, shown).map(m => m.displayName);
  const more = rx.medicines.length - names.length;
  return more > 0 ? `${names.join(', ')} +${more} more` : names.join(', ');
}

/** What the visit was about: the diagnosis, else the complaint. */
export const visitTitle = (
  rx: Pick<MyPrescription, 'diagnosis' | 'complaint'>,
) => rx.diagnosis || rx.complaint || 'Visit';
