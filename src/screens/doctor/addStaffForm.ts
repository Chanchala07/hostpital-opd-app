// Form state, options and validation for "Add staff member" (doctor or assistant).

import type { NewStaff, StaffFormOptions } from '../../api/staff';
import { isValidEmail } from '../../utils/validation';

export type StaffRole = 'doctor' | 'assistant';

export type DaySchedule = {
  open: boolean;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

export type AddStaffForm = {
  role: StaffRole;
  fullName: string;
  /** 10 digits, without +91. */
  phone: string;
  email: string;
  // Doctor
  specialization: string;
  qualification: string;
  registrationNo: string;
  departmentId: number | null;
  opdRoom: string;
  tokenPrefix: string;
  fee: string;
  /** Index = weekday: 0 = Sunday … 6 = Saturday. */
  schedule: DaySchedule[];
  // Assistant
  desk: string | null;
  doctorIds: number[];
};

/** Field keys, plus "schedule-<weekday>" for a day's times. */
export type StaffErrors = Partial<Record<string, string>>;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Slot lengths the backend accepts. */
export const SLOT_MINUTES = [5, 10, 15, 20, 30, 45, 60];

/** 6:00 AM … 10:00 PM in 30-minute steps, as "HH:mm". */
export const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hh}:${minutes % 60 === 0 ? '00' : '30'}`;
});

/** Blank form, with the facility's suggested token letter and timetable. */
export function initialForm(options: StaffFormOptions): AddStaffForm {
  const { startTime, endTime, slotMinutes, weekdays } = options.defaultSchedule;
  return {
    role: 'doctor',
    fullName: '',
    phone: '',
    email: '',
    specialization: '',
    qualification: '',
    registrationNo: '',
    departmentId: null,
    opdRoom: '',
    tokenPrefix: options.suggestedTokenPrefix ?? '',
    fee: '',
    schedule: WEEKDAYS.map((_, weekday) => ({
      open: weekdays.includes(weekday),
      startTime,
      endTime,
      slotMinutes,
    })),
    desk: null,
    doctorIds: [],
  };
}

const required = (
  value: string,
  message: string,
  errors: StaffErrors,
  key: string,
) => {
  if (!value.trim()) {
    errors[key] = message;
  }
};

/** Errors in on-screen order (the first one is scrolled to). */
export function validateStaff(form: AddStaffForm): StaffErrors {
  const errors: StaffErrors = {};
  if (form.fullName.trim().length < 2) {
    errors.fullName = 'Enter the full name.';
  }
  if (!/^[6-9]\d{9}$/.test(form.phone)) {
    errors.phone = 'Enter a 10-digit mobile number.';
  }
  // Optional: without an email the invite goes by SMS only (sign-in is by mobile number).
  if (form.email.trim() && !isValidEmail(form.email)) {
    errors.email = 'Check the email address, or leave it empty.';
  }

  if (form.role === 'doctor') {
    required(
      form.specialization,
      'Enter the specialisation.',
      errors,
      'specialization',
    );
    required(
      form.qualification,
      'Enter the qualification.',
      errors,
      'qualification',
    );
    required(
      form.registrationNo,
      'Enter the registration number.',
      errors,
      'registrationNo',
    );
    if (form.departmentId == null) {
      errors.departmentId = 'Choose a department.';
    }
    required(form.opdRoom, 'Enter the OPD room.', errors, 'opdRoom');
    if (!/^[A-Z]{1,3}$/.test(form.tokenPrefix)) {
      errors.tokenPrefix = '1–3 letters, e.g. C';
    }
    const fee = Number(form.fee);
    if (!form.fee || !(fee >= 0 && fee <= 100000)) {
      errors.fee = 'Enter the fee (₹0–1,00,000).';
    }
    if (!form.schedule.some(day => day.open)) {
      errors.schedule = 'Open at least one OPD day.';
    }
    form.schedule.forEach((day, weekday) => {
      if (day.open && day.endTime <= day.startTime) {
        errors[`schedule-${weekday}`] = 'End time must be after start time.';
      }
    });
  } else {
    if (!form.desk) {
      errors.desk = 'Choose a desk.';
    }
    if (form.doctorIds.length === 0) {
      errors.doctorIds = 'Assign at least one doctor.';
    }
  }
  return errors;
}

/** The POST /staff body for a valid form. */
export function toNewStaff(form: AddStaffForm): NewStaff {
  const person = {
    fullName: form.fullName.trim().replace(/\s+/g, ' '),
    phone: form.phone,
    ...(form.email.trim() ? { email: form.email.trim().toLowerCase() } : {}),
  };
  if (form.role === 'assistant') {
    return {
      ...person,
      role: 'assistant',
      assistant: { desk: form.desk ?? '', doctorIds: form.doctorIds },
    };
  }
  return {
    ...person,
    role: 'doctor',
    doctor: {
      specialization: form.specialization.trim(),
      qualification: form.qualification.trim(),
      registrationNo: form.registrationNo.trim(),
      departmentId: form.departmentId ?? 0,
      opdRoom: form.opdRoom.trim(),
      tokenPrefix: form.tokenPrefix,
      consultationFee: Number(form.fee),
      schedule: form.schedule.flatMap((day, weekday) =>
        day.open
          ? [
              {
                weekday,
                startTime: day.startTime,
                endTime: day.endTime,
                slotMinutes: day.slotMinutes,
              },
            ]
          : [],
      ),
    },
  };
}

/** Server conflicts that belong to one field. */
export const CONFLICT_FIELDS: Record<string, keyof AddStaffForm> = {
  EMAIL_TAKEN: 'email',
  PHONE_TAKEN: 'phone',
  TOKEN_PREFIX_TAKEN: 'tokenPrefix',
};
