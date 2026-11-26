// Form state, password strength and validation for "Create your account"
// (a new patient signs up in one step). Kept apart from the screen so the
// rules are easy to test.

import type { PatientSignUp } from '../../api/auth';
import { isValidEmail } from '../../utils/validation';
import { dobError, dobToIso, type Gender } from '../common/addPatientForm';

export type CreateAccountForm = {
  fullName: string;
  /** 10 digits, without +91. */
  mobile: string;
  /** As typed, formatted to DD/MM/YYYY. */
  dob: string;
  gender: Gender | null;
  email: string;
  password: string;
  /** Terms and Privacy Policy accepted. */
  agreed: boolean;
};

export type CreateAccountErrors = Partial<
  Record<keyof CreateAccountForm, string>
>;

export const EMPTY_ACCOUNT: CreateAccountForm = {
  fullName: '',
  mobile: '',
  dob: '',
  gender: null,
  email: '',
  password: '',
  agreed: false,
};

/** On-screen order: the first field with an error is scrolled into view. */
export const FIELD_ORDER: (keyof CreateAccountForm)[] = [
  'fullName',
  'mobile',
  'dob',
  'gender',
  'email',
  'password',
  'agreed',
];

export const PASSWORD_MIN = 8;
/** bcrypt only uses the first 72 bytes; the server refuses longer ones. */
export const PASSWORD_MAX = 72;

/** "+91 98765-43210" (typed or pasted) → "9876543210", at most 10 digits. */
export function mobileInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  return (
    digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits
  ).slice(0, 10);
}

export type PasswordStrength = {
  /** Bars to fill, out of 4 (0 while empty). */
  score: 0 | 1 | 2 | 3 | 4;
  /** e.g. "Medium · add a number and a symbol" */
  label: string;
};

/** Weak (too short) · Medium · Good · Strong, and what would make it stronger. */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: '' };
  }
  if (password.length < PASSWORD_MIN) {
    return {
      score: 1,
      label: `Weak · use at least ${PASSWORD_MIN} characters`,
    };
  }
  const missing = [
    !/\d/.test(password) && 'a number',
    !/[^A-Za-z0-9]/.test(password) && 'a symbol',
    !(/[a-z]/.test(password) && /[A-Z]/.test(password)) && 'a capital letter',
  ].filter((x): x is string => typeof x === 'string');
  if (missing.length === 0) {
    return { score: 4, label: 'Strong' };
  }
  const add = ` · add ${missing.slice(0, 2).join(' and ')}`;
  return missing.length === 1
    ? { score: 3, label: `Good${add}` }
    : { score: 2, label: `Medium${add}` };
}

/** Every problem with the form, by field. Empty when it can be sent. */
export function validateCreateAccount(
  form: CreateAccountForm,
  today: Date,
): CreateAccountErrors {
  const errors: CreateAccountErrors = {};
  if (form.fullName.trim().length < 2) {
    errors.fullName = 'Enter your full name.';
  }
  if (!/^[6-9]\d{9}$/.test(form.mobile)) {
    errors.mobile = 'Enter your 10-digit mobile number.';
  }
  const dob = dobError(form.dob, today);
  if (dob) {
    errors.dob = dob;
  }
  if (!form.gender) {
    errors.gender = 'Choose a gender.';
  }
  if (form.email.trim() && !isValidEmail(form.email)) {
    errors.email = 'Check the email address.';
  }
  if (form.password.length < PASSWORD_MIN) {
    errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  } else if (form.password.length > PASSWORD_MAX) {
    errors.password = `Use ${PASSWORD_MAX} characters or fewer.`;
  }
  if (!form.agreed) {
    errors.agreed = 'Please accept the Terms and Privacy Policy.';
  }
  return errors;
}

/** What the server gets for a valid form. */
export function toSignUp(form: CreateAccountForm): PatientSignUp {
  return {
    fullName: form.fullName.trim().replace(/\s+/g, ' '),
    phone: form.mobile,
    dateOfBirth: dobToIso(form.dob),
    gender: form.gender ?? 'other',
    email: form.email.trim() || null,
    password: form.password,
  };
}

/**
 * POST /auth/patient/register conflicts (409) shown under a field instead of
 * above the button. Others (e.g. PROFILE_TAKEN) show the server's message.
 */
export const CONFLICT_FIELDS: Record<
  string,
  { field: keyof CreateAccountForm; message: string }
> = {
  ACCOUNT_EXISTS: {
    field: 'mobile',
    message: 'This number already has an account. Sign in instead.',
  },
  PHONE_RESERVED: {
    field: 'mobile',
    message: 'This number belongs to a staff account. Use another number.',
  },
  EMAIL_TAKEN: {
    field: 'email',
    message: 'This email is already used by another account.',
  },
};
