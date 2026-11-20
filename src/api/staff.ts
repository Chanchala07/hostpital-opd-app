// Staff management: a doctor can add doctors and assistants to their facility.

import { apiRequest } from './client';

export type StaffFormOptions = {
  facility: { id: number; name: string; facilityCode: string };
  departments: { id: number; name: string }[];
  /** e.g. ["Desk 1", "Desk 2", "Desk 3"] */
  desks: string[];
  /** The facility's doctors, for assigning an assistant. */
  doctors: {
    id: number;
    fullName: string;
    departmentName: string | null;
    opdRoom: string | null;
  }[];
  suggestedEmployeeId: string;
  /** Next free token letter(s) in the facility, e.g. "C". */
  suggestedTokenPrefix: string;
  defaultSchedule: {
    startTime: string;
    endTime: string;
    slotMinutes: number;
    /** 0 = Sunday … 6 = Saturday */
    weekdays: number[];
  };
};

export type OpdSession = {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

type Person = { fullName: string; phone: string; email: string };

export type NewStaff =
  | (Person & {
      role: 'doctor';
      doctor: {
        specialization: string;
        qualification: string;
        registrationNo: string;
        departmentId: number;
        opdRoom: string;
        tokenPrefix: string;
        consultationFee: number;
        schedule: OpdSession[];
      };
    })
  | (Person & {
      role: 'assistant';
      assistant: { desk: string; doctorIds: number[] };
    });

export type CreatedStaff = {
  staff: { id: number; fullName: string; role: string };
  invite: {
    channels: ('sms' | 'email')[];
    expiresAt: string;
    devLink?: string;
  };
};

export const getStaffFormOptions = () =>
  apiRequest<StaffFormOptions>('/staff/form-options');

/** Creates the account (status "invited") and sends a set-password link. */
export const createStaff = (input: NewStaff) =>
  apiRequest<CreatedStaff>('/staff', { method: 'POST', body: input });
