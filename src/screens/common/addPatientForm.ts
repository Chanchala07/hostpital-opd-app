// Form state, options and validation for "Add new patient".
// Kept separate from the screen so the rules are easy to test and reuse.

import type { NewPatientRequest } from '../../api/patients';
import { isValidEmail } from '../../utils/validation';

export type Gender = 'female' | 'male' | 'other';

export type AddPatientForm = {
  // Step 1 · Personal details
  fullName: string;
  /** As typed, formatted to DD/MM/YYYY. */
  dob: string;
  gender: Gender | null;
  /** 10 digits, without +91. */
  mobile: string;
  email: string;
  // Step 2 · Medical information
  reason: string;
  allergies: string[];
  conditions: string[];
};

export type FormErrors = Partial<Record<keyof AddPatientForm, string>>;

/** Updates one field of the form. */
export type SetField = <K extends keyof AddPatientForm>(
  key: K,
  value: AddPatientForm[K],
) => void;

export const EMPTY_FORM: AddPatientForm = {
  fullName: '',
  dob: '',
  gender: null,
  mobile: '',
  email: '',
  reason: '',
  allergies: [],
  conditions: [],
};

export const GENDERS: {
  value: Gender;
  label: string;
  short: 'F' | 'M' | 'O';
}[] = [
  { value: 'female', label: 'Female', short: 'F' },
  { value: 'male', label: 'Male', short: 'M' },
  { value: 'other', label: 'Other', short: 'O' },
];

export const NO_ALLERGY = 'None known';
export const COMMON_ALLERGIES = [
  NO_ALLERGY,
  'Penicillin',
  'Sulfa drugs',
  'Aspirin',
  'Dust',
  'Peanuts',
];

export const NO_CONDITION = 'None';

/** The server accepts at most 255 characters. */
export const REASON_MAX_LENGTH = 255;
export const CONDITIONS = [
  'Diabetes',
  'Hypertension',
  'Asthma',
  'Thyroid',
  'Heart disease',
  NO_CONDITION,
];

// --- Input helpers ---------------------------------------------------------

export const digitsOnly = (text: string, max: number) =>
  text.replace(/\D/g, '').slice(0, max);

/** "15081987" → "15/08/1987"; slashes appear only once the next part starts. */
export function formatDobInput(text: string): string {
  const d = digitsOnly(text, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}

/** Valid DD/MM/YYYY → Date, otherwise null. */
export function parseDob(dob: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob);
  if (!match) {
    return null;
  }
  const [day, month, year] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

/** Whole years and leftover months between birth and today. */
export function ageOn(birth: Date, today: Date) {
  let months =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) {
    months -= 1;
  }
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** "38 yrs", "1 yr", "7 mo" — or null while the date is incomplete. */
export function ageLabel(dob: string, today: Date): string | null {
  const birth = parseDob(dob);
  if (!birth || birth > today) {
    return null;
  }
  const { years, months } = ageOn(birth, today);
  if (years >= 1) {
    return `${years} ${years === 1 ? 'yr' : 'yrs'}`;
  }
  return `${months} mo`;
}

/** "9812345455" → "+91 98••• ••455" */
export function maskMobile(mobile: string): string {
  if (mobile.length !== 10) {
    return `+91 ${mobile}`;
  }
  return `+91 ${mobile.slice(0, 2)}••• ••${mobile.slice(7)}`;
}

/** Picking "None …" clears the rest; picking anything else clears "None …". */
export function toggleExclusive(
  list: string[],
  item: string,
  noneValue: string,
): string[] {
  if (list.includes(item)) {
    return list.filter(x => x !== item);
  }
  if (item === noneValue) {
    return [noneValue];
  }
  return [...list.filter(x => x !== noneValue), item];
}

// --- Validation ------------------------------------------------------------

/** What's wrong with a DD/MM/YYYY date of birth, if anything. */
export function dobError(dob: string, today: Date): string | undefined {
  const birth = parseDob(dob);
  if (!dob) {
    return 'Enter date of birth.';
  }
  if (!birth) {
    return 'Use DD/MM/YYYY, e.g. 15/08/1987.';
  }
  if (birth > today) {
    return "Date of birth can't be in the future.";
  }
  if (ageOn(birth, today).years > 120) {
    return 'Check the year of birth.';
  }
  return undefined;
}

/** Errors for step 1, in on-screen order. */
export function validatePersonal(
  form: AddPatientForm,
  today: Date,
): FormErrors {
  const errors: FormErrors = {};
  if (form.fullName.trim().length < 2) {
    errors.fullName = "Enter the patient's full name.";
  }
  const dob = dobError(form.dob, today);
  if (dob) {
    errors.dob = dob;
  }
  if (!form.gender) {
    errors.gender = 'Choose a gender.';
  }
  if (!/^[6-9]\d{9}$/.test(form.mobile)) {
    errors.mobile = 'Enter a 10-digit mobile number.';
  }
  if (form.email.trim() && !isValidEmail(form.email)) {
    errors.email = 'Check the email address.';
  }
  return errors;
}

/** Errors for step 2. */
export function validateMedical(form: AddPatientForm): FormErrors {
  const errors: FormErrors = {};
  if (form.reason.trim().length < 3) {
    errors.reason = 'Tell the doctor why the patient came today.';
  }
  return errors;
}

// --- Submit ----------------------------------------------------------------

/** "15/08/1987" → "1987-08-15" */
export function dobToIso(dob: string): string {
  const [day, month, year] = dob.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * POST /patients for a validated form: registers the patient and puts them
 * in the doctor's queue today, checked in. (The server's patient record has
 * no email field, so the optional email isn't sent.)
 */
export function toNewPatient(
  form: AddPatientForm,
  doctorId: number,
): NewPatientRequest {
  return {
    fullName: form.fullName.trim().replace(/\s+/g, ' '),
    dateOfBirth: dobToIso(form.dob),
    gender: form.gender ?? 'other',
    phone: form.mobile,
    // "None known" / "None" mean nothing to record.
    allergies: form.allergies.filter(a => a !== NO_ALLERGY),
    conditions: form.conditions.filter(c => c !== NO_CONDITION),
    addToQueue: { doctorId, reason: form.reason.trim(), checkIn: true },
  };
}

// --- Draft -----------------------------------------------------------------
// Mock: kept in memory, so it survives closing the screen but not an app
// restart. Swap for AsyncStorage or the backend later.

let draft: AddPatientForm | null = null;

export const loadDraft = () => draft;
export const saveDraft = (form: AddPatientForm) => {
  draft = form;
};
export const clearDraft = () => {
  draft = null;
};
