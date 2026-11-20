// Whose patients a staff member works with, from GET /auth/me: a doctor gets
// themselves, an assistant the doctors they are assigned to.

import { getMyProfile, isPatientMe } from './profile';

export type MyDoctor = { id: number; name: string; room: string | null };

export type MyDoctors = {
  doctors: MyDoctor[];
  /** The signed-in user is the (only) doctor. */
  self: boolean;
  /** The assistant's desk, e.g. "Desk 1". */
  desk: string | null;
};

export async function getMyDoctors(): Promise<MyDoctors> {
  const me = await getMyProfile();
  if (isPatientMe(me)) {
    throw new Error('Not a staff account');
  }
  if (me.doctor) {
    return {
      doctors: [{ id: me.id, name: me.fullName, room: me.doctor.opdRoom }],
      self: true,
      desk: null,
    };
  }
  return {
    doctors: (me.assistant?.doctors ?? []).map(d => ({
      id: d.id,
      name: d.fullName,
      room: null,
    })),
    self: false,
    desk: me.assistant?.desk ?? null,
  };
}
