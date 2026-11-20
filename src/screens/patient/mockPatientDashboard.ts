// Sample data for the parts of the patient home that have no API yet
// (medicine reminders, last prescription, health tiles). Today's visit and
// upcoming appointments come from the API (usePatientVisits).

export type MedicineReminder = {
  id: string;
  name: string;
  time: string;
};

export type Prescription = {
  id: string;
  diagnosis: string;
  date: string;
  doctorName: string;
  medicines: string[];
};

export type HealthSummary = {
  bloodGroup: string;
  weightKg: number;
  allergies: string[];
};

export type PatientDashboardData = {
  /** Today's remaining doses, in time order. */
  medicines: MedicineReminder[];
  lastPrescription: Prescription | null;
  health: HealthSummary;
};

export function getPatientDashboard(): PatientDashboardData {
  return {
    medicines: [
      { id: 'med-1', name: 'Fluticasone nasal spray', time: '2:00 PM' },
      { id: 'med-2', name: 'Cetirizine 10 mg', time: '9:00 PM' },
    ],
    lastPrescription: {
      id: 'RX-3381',
      diagnosis: 'Viral fever',
      date: '12 Aug 2026',
      doctorName: 'Dr. Sarah Johnson',
      medicines: ['Paracetamol 650', 'Cetirizine 10', 'ORS sachets'],
    },
    health: { bloodGroup: 'O+', weightKg: 72, allergies: ['Penicillin'] },
  };
}
