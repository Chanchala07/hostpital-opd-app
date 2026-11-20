// Mock data for the patient's latest prescription. Replace getPrescription()
// with an API call once the backend exists; the screen only uses these types.

export type DoseTime = 'morning' | 'afternoon' | 'night';

export const DOSE_TIMES: { key: DoseTime; label: string; time: string }[] = [
  { key: 'morning', label: 'Morning', time: '8:00 AM' },
  { key: 'afternoon', label: 'Afternoon', time: '2:00 PM' },
  { key: 'night', label: 'Night', time: '9:00 PM' },
];

export type PrescribedMedicine = {
  id: string;
  name: string;
  /** Used where space is tight, e.g. "Paracetamol". */
  shortName: string;
  detail: string;
  days: number;
  instructions: string;
  /** Units to take at each time of day (0 = skip). */
  doses: Record<DoseTime, number>;
  tint: 'blue' | 'purple' | 'green';
};

export type Prescription = {
  id: string;
  doctorName: string;
  department: string;
  /** Epoch ms of the visit. */
  visitDate: number;
  token: string;
  diagnosis: string;
  temperature: string;
  bloodPressure: string;
  medicines: PrescribedMedicine[];
  advice: string[];
  warning: { lead: string; text: string };
  followUp: { date: number; note: string } | null;
};

/** Epoch ms `days` from today, moved off Sunday (OPD closed). */
function opdDayFromToday(days: number): number {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(10, 0, 0, 0);
  return d.getTime();
}

export function getPrescription(): Prescription {
  return {
    id: 'RX-3502',
    doctorName: 'Dr. Sarah Johnson',
    department: 'General Medicine',
    visitDate: Date.now(),
    token: 'A-12',
    diagnosis: 'Viral fever',
    temperature: '100.8°F',
    bloodPressure: '118/78',
    medicines: [
      {
        id: 'med-1',
        name: 'Paracetamol 650 mg',
        shortName: 'Paracetamol',
        detail: 'Tablet · for fever',
        days: 5,
        instructions: 'After food',
        doses: { morning: 1, afternoon: 0, night: 1 },
        tint: 'blue',
      },
      {
        id: 'med-2',
        name: 'Cetirizine 10 mg',
        shortName: 'Cetirizine',
        detail: 'Tablet · may cause drowsiness',
        days: 3,
        instructions: 'Bedtime',
        doses: { morning: 0, afternoon: 0, night: 1 },
        tint: 'purple',
      },
      {
        id: 'med-3',
        name: 'ORS',
        shortName: 'ORS',
        detail: '1 sachet in 1 litre water',
        days: 3,
        instructions: 'Sip often',
        doses: { morning: 1, afternoon: 1, night: 1 },
        tint: 'green',
      },
    ],
    advice: [
      'Drink 3 litres of fluids a day',
      'Rest at home for 3 days',
      'Check temperature twice a day',
    ],
    warning: {
      lead: 'Come back sooner',
      text: 'if fever goes above 103°F or you have trouble breathing.',
    },
    followUp: {
      date: opdDayFromToday(4),
      note: 'Only if fever continues after 3 days',
    },
  };
}
