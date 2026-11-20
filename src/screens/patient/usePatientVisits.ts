import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMyAppointment,
  listMyAppointments,
  type MyAppointment,
  type MyAppointmentDetail,
} from '../../api/myAppointments';
import { useNotifications } from '../../notifications/NotificationsContext';
import { userMessage } from '../../utils/errors';
import { toIsoDate } from './bookingHelpers';
import { pickCurrent } from './myTokenHelpers';
import { appInForeground } from '../../utils/appState';

/** How often the home screen refreshes today's visit while it is live. */
export const VISIT_POLL_MS = 30 * 1000;

export type PatientVisits =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      /** Today's appointment with its live queue status. */
      today: MyAppointmentDetail | null;
      /** Upcoming appointments other than today's. */
      upcoming: MyAppointment[];
    };

const LIVE = [
  'confirmed',
  'checked_in',
  'called',
  'in_consultation',
  'pending',
];

/**
 * The patient's visits for the home screen: today's (live) and the upcoming
 * ones. Refreshes on focus, on queue notifications, and every 30 s while
 * today's visit can still change.
 */
export function usePatientVisits(onFocus?: (cb: () => void) => () => void) {
  const [visits, setVisits] = useState<PatientVisits>({ status: 'loading' });
  const { latest } = useNotifications();
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) {
      setVisits({ status: 'loading' });
    }
    try {
      const todayIso = toIsoDate(new Date());
      const list = await listMyAppointments('upcoming');
      const current = pickCurrent(list, todayIso);
      const today =
        current && current.opdDate === todayIso
          ? await getMyAppointment(current.id)
          : null;
      if (mounted.current) {
        setVisits({
          status: 'ready',
          today,
          upcoming: list.filter(
            a => a.id !== today?.id && a.opdDate >= todayIso,
          ),
        });
      }
    } catch (e) {
      if (mounted.current && !quiet) {
        setVisits({
          status: 'error',
          message: userMessage(e, 'Could not load your visits.'),
        });
      }
    }
  }, []);

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => onFocus?.(refresh), [onFocus, refresh]);

  const latestId = latest?.id;
  useEffect(() => {
    if (latestId != null) {
      refresh();
    }
  }, [latestId, refresh]);

  const live =
    visits.status === 'ready' &&
    !!visits.today &&
    LIVE.includes(visits.today.status);
  useEffect(() => {
    if (!live) {
      return;
    }
    const timer = setInterval(() => {
      if (appInForeground()) {
        refresh();
      }
    }, VISIT_POLL_MS);
    return () => clearInterval(timer);
  }, [live, refresh]);

  return { visits, reload, refresh };
}
