export type Role = 'doctor' | 'patient' | 'assistant';

export type User = {
  id: string;
  name: string;
  /** Sign-in email, always lower-case. */
  email: string;
  /** 10 digits, without +91. Shown on the profile. */
  mobile: string;
  role: Role;
};
