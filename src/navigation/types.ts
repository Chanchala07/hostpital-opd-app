import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Login: undefined;
  DoctorApp: NavigatorScreenParams<DoctorTabParamList> | undefined;
  PatientApp: undefined;
  AssistantApp: NavigatorScreenParams<AssistantTabParamList> | undefined;
  /** Shared profile page, opened on top of any role's screens. */
  Profile: undefined;
  /** Patient only: full-screen booking flow (covers the tab bar). */
  BookAppointment: undefined;
  /** Patient only: live status of today's token. */
  TokenStatus: { appointmentId?: number } | undefined;
  /** Patient only: all my appointments (upcoming / past). */
  MyAppointments: { tab?: 'upcoming' | 'past' } | undefined;
  /** Doctor + assistant: register a new patient (covers the tab bar). */
  AddPatient: undefined;
  /** Doctor only: add a doctor or an assistant to the facility. */
  AddStaff: undefined;
  /** Doctor only: write the prescription during the consultation. */
  Prescribe: { appointmentId: number; visitId?: number };
  /** Doctor only: "Visit completed" summary, then call the next patient. */
  VisitDone: { visitId: number };
};

export type DoctorTabParamList = {
  Home: undefined;
  Patients: undefined;
  Schedule: undefined;
  Profile: undefined;
};

export type AssistantTabParamList = {
  Desk: undefined;
  Tokens: undefined;
  Bookings: undefined;
  Patients: undefined;
};

export type PatientTabParamList = {
  Home: undefined;
  Book: undefined;
  MyToken: undefined;
  Prescriptions: undefined;
};
