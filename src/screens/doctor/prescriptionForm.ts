// The "Add medicine" form: what the doctor picks, the server's rules
// (name, "1-0-1" doses, 1–365 days), and how a medicine reads in the list.

import type { MedicineInput } from '../../api/visits';

/** The server keeps at most 30 medicines on one prescription. */
export const MAX_MEDICINES = 30;

export const FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Drops',
  'Ointment',
  'Injection',
];
export const TIMINGS = [
  'After food',
  'Before food',
  'Empty stomach',
  'Bedtime',
];
export const DURATIONS = [3, 5, 7, 10, 15];

/** Morning, afternoon, night. */
export type Doses = [number, number, number];
export const DOSE_SLOTS = ['Morning', 'Afternoon', 'Night'] as const;
export const DOSE_STEP = 0.5;
export const MAX_DOSE = 4;

export const FREQUENCY_PRESETS: { doses: Doses; hint: string }[] = [
  { doses: [1, 0, 0], hint: 'Morning' },
  { doses: [0, 0, 1], hint: 'Night' },
  { doses: [1, 0, 1], hint: 'Twice' },
  { doses: [1, 1, 1], hint: 'Thrice' },
];

export type MedicineForm = {
  medicineName: string;
  strength: string;
  form: string | null;
  doses: Doses;
  /** As typed. */
  durationDays: string;
  timing: string | null;
  instructions: string;
};

export type MedicineErrors = Partial<
  Record<'medicineName' | 'doses' | 'durationDays', string>
>;

/** Nothing chosen: the doctor picks the doses and days on purpose. */
export const emptyMedicineForm = (): MedicineForm => ({
  medicineName: '',
  strength: '',
  form: null,
  doses: [0, 0, 0],
  durationDays: '',
  timing: null,
  instructions: '',
});

/** "1-0-1" → [1, 0, 1]; anything else → no doses. */
export function parseFrequency(frequency: string): Doses {
  const parts = frequency.split('-').map(Number);
  return parts.length === 3 && parts.every(n => Number.isFinite(n) && n >= 0)
    ? [parts[0], parts[1], parts[2]]
    : [0, 0, 0];
}

/** [0.5, 0, 1] → "0.5-0-1" (the server's format). */
export const formatFrequency = (doses: Doses) => doses.map(String).join('-');

/** 0.5 → "½", 1.5 → "1½", 2 → "2" */
export function doseLabel(dose: number): string {
  const whole = Math.floor(dose);
  const half = dose - whole >= 0.5;
  if (!half) {
    return String(whole);
  }
  return whole === 0 ? '½' : `${whole}½`;
}

export const sameDoses = (a: Doses, b: Doses) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function fromInput(m: MedicineInput): MedicineForm {
  return {
    medicineName: m.medicineName,
    strength: m.strength ?? '',
    form: m.form,
    doses: parseFrequency(m.frequency),
    durationDays: String(m.durationDays),
    timing: m.timing,
    instructions: m.instructions ?? '',
  };
}

export function validateMedicine(f: MedicineForm): MedicineErrors {
  const errors: MedicineErrors = {};
  if (f.medicineName.trim().length === 0) {
    errors.medicineName = 'Enter the medicine name.';
  }
  if (f.doses.every(d => d === 0)) {
    errors.doses = 'Choose when to take it.';
  }
  const days = Number(f.durationDays.trim());
  if (!/^\d+$/.test(f.durationDays.trim()) || days < 1 || days > 365) {
    errors.durationDays = 'Enter the number of days (1–365).';
  }
  return errors;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** A valid form → the request's medicine. */
export function toInput(f: MedicineForm): MedicineInput {
  return {
    medicineName: f.medicineName.trim(),
    form: f.form,
    strength: orNull(f.strength),
    frequency: formatFrequency(f.doses),
    durationDays: Number(f.durationDays.trim()),
    timing: f.timing,
    instructions: orNull(f.instructions),
  };
}

/** Only the request's fields (drops the server's id / displayName). */
export const asInput = (m: MedicineInput): MedicineInput => ({
  medicineName: m.medicineName,
  form: m.form ?? null,
  strength: m.strength ?? null,
  frequency: m.frequency,
  durationDays: m.durationDays,
  timing: m.timing ?? null,
  instructions: m.instructions ?? null,
});

/** "Paracetamol 650 mg" */
export const medicineTitle = (m: MedicineInput) =>
  [m.medicineName, m.strength].filter(Boolean).join(' ');

/** "1-0-1 · Morning, night · 5 days · After food" */
export function scheduleText(m: MedicineInput): string {
  const doses = parseFrequency(m.frequency);
  const when = DOSE_SLOTS.map((slot, i) => {
    const name = slot.toLowerCase();
    return doses[i] === 0
      ? null
      : doses[i] === 1
      ? name
      : `${doseLabel(doses[i])} ${name}`;
  })
    .filter(Boolean)
    .join(', ');
  return [
    m.frequency,
    when ? when[0].toUpperCase() + when.slice(1) : null,
    m.durationDays === 1 ? '1 day' : `${m.durationDays} days`,
    m.timing,
  ]
    .filter(Boolean)
    .join(' · ');
}
