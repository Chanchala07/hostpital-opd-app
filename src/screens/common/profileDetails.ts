// Turns GET /auth/me into the rows the profile screen shows, per role.

import {
  isPatientMe,
  type MeResponse,
  type OpdSessionDto,
  type PatientMe,
  type StaffMe,
} from '../../api/profile';
import { dateParts, formatSlotTime } from '../../utils/format';
import { WEEKDAYS } from '../doctor/addStaffForm';
import { ageLabel } from './addPatientForm';

export type ProfileRow = {
  label: string;
  value: string;
  /** "alert" shows the value in red (e.g. allergies). */
  tone?: 'alert';
};

export type ProfileSection = { title: string; rows: ProfileRow[] };

export type ProfileDetails = {
  name: string;
  /** Shown under the name, e.g. "General Medicine · Room 103". */
  headline: string;
  sections: ProfileSection[];
};

const EMPTY = '—';
const orEmpty = (value: string | null | undefined) => value?.trim() || EMPTY;

/** "+919876506543" → "+91 98765 06543" */
export function formatMobile(phone: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  return digits.length === 10
    ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
    : EMPTY;
}

/** "1992-03-14" → "14 Mar 1992 · 34 yrs" */
export function birthdayLabel(isoDate: string, today: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const [, yyyy, mm, dd] = match;
  const { day, month } = dateParts(
    new Date(Number(yyyy), Number(mm) - 1, Number(dd)),
  );
  const age = ageLabel(`${dd}/${mm}/${yyyy}`, today);
  return `${day} ${month} ${yyyy}${age ? ` · ${age}` : ''}`;
}

/**
 * Weekly OPD sessions as rows, with neighbouring days that have the same
 * hours grouped: "Mon–Fri" → "09:00 AM – 01:00 PM · 15 min".
 */
export function scheduleRows(schedule: OpdSessionDto[]): ProfileRow[] {
  if (schedule.length === 0) {
    return [{ label: 'OPD days', value: 'Not set' }];
  }
  const byDay = new Map<number, string>();
  [...schedule]
    .sort(
      (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
    )
    .forEach(s => {
      const hours = `${formatSlotTime(s.startTime)} – ${formatSlotTime(
        s.endTime,
      )} · ${s.slotMinutes} min`;
      const sameDay = byDay.get(s.weekday);
      byDay.set(s.weekday, sameDay ? `${sameDay}, ${hours}` : hours);
    });

  const groups: { from: number; to: number; hours: string }[] = [];
  byDay.forEach((hours, weekday) => {
    const last = groups[groups.length - 1];
    if (last && last.to === weekday - 1 && last.hours === hours) {
      last.to = weekday;
    } else {
      groups.push({ from: weekday, to: weekday, hours });
    }
  });
  return groups.map(g => ({
    label:
      g.from === g.to
        ? WEEKDAYS[g.from]
        : `${WEEKDAYS[g.from]}–${WEEKDAYS[g.to]}`,
    value: g.hours,
  }));
}

const contact = (
  phone: string | null,
  email: string | null,
): ProfileSection => ({
  title: 'Contact',
  rows: [
    { label: 'Mobile', value: formatMobile(phone) },
    { label: 'Email', value: orEmpty(email) },
  ],
});

function staffDetails(me: StaffMe): ProfileDetails {
  const clinic = { label: 'Clinic', value: orEmpty(me.facility?.name) };
  const employeeId = { label: 'Employee ID', value: orEmpty(me.employeeId) };

  if (me.doctor) {
    const d = me.doctor;
    return {
      name: me.fullName,
      headline:
        [d.departmentName, d.opdRoom].filter(Boolean).join(' · ') || 'Doctor',
      sections: [
        {
          title: 'Work',
          rows: [
            { label: 'Specialisation', value: orEmpty(d.specialization) },
            { label: 'Qualification', value: orEmpty(d.qualification) },
            { label: 'Registration no.', value: orEmpty(d.registrationNo) },
            employeeId,
          ],
        },
        {
          title: 'OPD',
          rows: [
            clinic,
            { label: 'Room', value: orEmpty(d.opdRoom) },
            { label: 'Token prefix', value: orEmpty(d.tokenPrefix) },
            {
              label: 'Consultation fee',
              value:
                d.consultationFee == null ? 'Not set' : `₹${d.consultationFee}`,
            },
            ...scheduleRows(d.schedule),
          ],
        },
        contact(me.phone, me.email),
      ],
    };
  }

  if (me.assistant) {
    const a = me.assistant;
    return {
      name: me.fullName,
      headline: ['Front desk', a.desk].filter(Boolean).join(' · '),
      sections: [
        {
          title: 'Work',
          rows: [
            employeeId,
            clinic,
            { label: 'Desk', value: orEmpty(a.desk) },
            {
              label: 'Doctors',
              value: a.doctors.map(doc => doc.fullName).join(', ') || EMPTY,
            },
          ],
        },
        contact(me.phone, me.email),
      ],
    };
  }

  return {
    name: me.fullName,
    headline: me.facility?.name ?? '',
    sections: [
      { title: 'Work', rows: [employeeId, clinic] },
      contact(me.phone, me.email),
    ],
  };
}

const GENDERS = { female: 'Female', male: 'Male', other: 'Other' };

/** The account holder's own record; the rest are family on the same number. */
export const selfProfile = (me: PatientMe) =>
  me.profiles.find(
    p => p.fullName.toLowerCase() === me.user.fullName.toLowerCase(),
  ) ?? me.profiles[0];

function patientDetails(me: PatientMe, today: Date): ProfileDetails {
  const self = selfProfile(me);
  const family = me.profiles.filter(p => p !== self);
  const sections: ProfileSection[] = [];

  if (self) {
    sections.push(
      {
        title: 'Personal',
        rows: [
          { label: 'Patient ID', value: self.patientCode },
          {
            label: 'Date of birth',
            value: birthdayLabel(self.dateOfBirth, today),
          },
          { label: 'Gender', value: GENDERS[self.gender] ?? EMPTY },
        ],
      },
      {
        title: 'Health',
        rows: [
          self.allergies.length
            ? {
                label: 'Allergies',
                value: self.allergies.join(', '),
                tone: 'alert',
              }
            : { label: 'Allergies', value: 'None known' },
          {
            label: 'Existing conditions',
            value: self.conditions.join(', ') || 'None',
          },
        ],
      },
    );
  }
  if (family.length) {
    sections.push({
      title: 'Family members',
      rows: family.map(p => ({
        label: p.fullName,
        value: `${p.patientCode} · ${p.age} yrs`,
      })),
    });
  }
  sections.push(contact(me.user.phone, me.user.email));

  return {
    name: self?.fullName ?? me.user.fullName,
    headline: self
      ? `Patient ID ${self.patientCode}`
      : 'No patient profile yet',
    sections,
  };
}

export function toProfileDetails(
  me: MeResponse,
  today: Date = new Date(),
): ProfileDetails {
  return isPatientMe(me) ? patientDetails(me, today) : staffDetails(me);
}
