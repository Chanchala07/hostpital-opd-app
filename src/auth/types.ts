export type Role = 'doctor' | 'patient' | 'assistant';

export type User = {
  id: string;
  name: string;
  /** Optional (staff can be added without one). */
  email: string | null;
  /** 10 digits, without +91: the sign-in ID. Shown on the profile. */
  mobile: string;
  role: Role;
};
