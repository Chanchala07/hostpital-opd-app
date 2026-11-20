// The doctor's consultation (visit): GET /visits/{id} and the prescription
// draft. The draft is saved while the doctor writes it (PUT replaces the whole
// list); "Visit complete" (POST /visits/{id}/complete) finalises it and gives
// it an RX number.

import { apiRequest } from './client';

/** One medicine as the doctor writes it (the server's request shape). */
export type MedicineInput = {
  medicineName: string;
  /** "Tablet", "Syrup"… */
  form: string | null;
  /** "650 mg" */
  strength: string | null;
  /** Morning-afternoon-night doses, e.g. "1-0-1" or "0.5-0-0.5". */
  frequency: string;
  durationDays: number;
  /** "After food", "Bedtime"… */
  timing: string | null;
  instructions: string | null;
};

/** A saved medicine (the server adds an id and "Paracetamol 650 mg"). */
export type PrescriptionItem = MedicineInput & {
  id: number;
  displayName: string;
};

export type ConsultationVisit = {
  id: number;
  appointmentId: number | null;
  status: 'in_progress' | 'completed';
  complaint: string | null;
  diagnosis: string | null;
  /** "A-11" */
  token: string | null;
  patient: {
    id: number;
    patientCode: string;
    fullName: string;
    /** "34 M" */
    ageGender: string;
    allergies: string[];
    conditions: string[];
    currentMedicines: { name: string; dose: string | null }[];
  };
  /** Latest reading for this visit, if the desk took one. */
  vitals: {
    temperatureF: number | null;
    /** "118/78" */
    bp: string | null;
    pulse: number | null;
    spo2: number | null;
    weightKg: number | null;
    /** Temperature ≥ 100.4 °F */
    hasFever: boolean;
  } | null;
  /** Null until the first medicine is saved. */
  prescription: {
    id: number;
    rxCode: string | null;
    status: 'draft' | 'final';
    items: PrescriptionItem[];
  } | null;
};

/** Doctor (treating doctor only): the visit with its draft prescription. */
export const getVisit = (visitId: number) =>
  apiRequest<ConsultationVisit>(`/visits/${visitId}`);

/** Replaces every medicine on the draft (at most 30). */
export const savePrescription = (visitId: number, items: MedicineInput[]) =>
  apiRequest<ConsultationVisit>(`/visits/${visitId}/prescription`, {
    method: 'PUT',
    body: { items },
  });
