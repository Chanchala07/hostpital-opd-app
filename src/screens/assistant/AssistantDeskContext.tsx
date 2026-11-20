import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import type { ApiResult } from '../../api/client';
import { getMyProfile, isPatientMe } from '../../api/profile';
import * as queueApi from '../../api/queue';
import type { LateArrivalRule } from '../../api/queue';
import { userMessage } from '../../utils/errors';
import { toDoctorQueue, type DeskData } from './deskModel';
import { appInForeground } from '../../utils/appState';

/** How often the desk refetches the queues (the server moves late patients every minute). */
export const DESK_POLL_MS = 15 * 1000;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

export type DeskActions = {
  callNext: (doctorId: number) => Promise<void>;
  callPatient: (doctorId: number, appointmentId: number) => Promise<void>;
  recall: (doctorId: number, appointmentId: number) => Promise<void>;
  skip: (doctorId: number, appointmentId: number) => Promise<void>;
  checkIn: (doctorId: number, appointmentId: number) => Promise<void>;
  /** Late patient arrived: back into the line (clinic rule unless `position`). */
  reinsert: (
    doctorId: number,
    appointmentId: number,
    position?: LateArrivalRule,
  ) => Promise<void>;
  noShow: (doctorId: number, appointmentId: number) => Promise<void>;
};

type DeskContextValue = {
  load: LoadState;
  desk: DeskData;
  /** Last thing the desk did, from the server ("A-12 called to Room 103"). */
  lastAnnouncement: string | null;
  /** An action is running: disable the buttons. */
  busy: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  actions: DeskActions;
};

const EMPTY: DeskData = { deskName: '', doctors: [] };

const DeskContext = createContext<DeskContextValue | null>(null);

/** Live front desk (today's queues of my doctors), shared by the assistant's tabs. */
export function AssistantDeskProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [desk, setDesk] = useState<DeskData>(EMPTY);
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const doctorIds = useRef<number[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** My doctors (from my profile) and each one's queue. */
  const loadAll = useCallback(async () => {
    const me = await getMyProfile();
    if (isPatientMe(me)) {
      throw new Error('Not a staff account');
    }
    const doctors = me.assistant?.doctors ?? [];
    const queues = await Promise.all(doctors.map(d => queueApi.getQueue(d.id)));
    doctorIds.current = doctors.map(d => d.id);
    if (mounted.current) {
      setDesk({
        deskName: me.assistant?.desk ?? 'Front desk',
        doctors: queues.map(toDoctorQueue),
      });
      setLoad({ status: 'ready' });
    }
  }, []);

  const firstLoad = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      await loadAll();
    } catch (e) {
      if (mounted.current) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load the queue.'),
        });
      }
    }
  }, [loadAll]);

  /** Background / pull-to-refresh: keeps what's shown if it fails. */
  const refresh = useCallback(async () => {
    if (doctorIds.current.length === 0) {
      return firstLoad();
    }
    setRefreshing(true);
    try {
      await loadAll();
    } catch {
      // Offline for a moment: the next poll tries again.
    } finally {
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }, [firstLoad, loadAll]);

  const reloadDoctor = useCallback(async (doctorId: number) => {
    const queue = toDoctorQueue(await queueApi.getQueue(doctorId));
    if (mounted.current) {
      setDesk(d => ({
        ...d,
        doctors: d.doctors.map(x => (x.id === doctorId ? queue : x)),
      }));
    }
  }, []);

  useEffect(() => {
    firstLoad();
  }, [firstLoad]);

  // Keep the queues fresh while the app is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (appInForeground() && doctorIds.current.length) {
        refresh();
      }
    }, DESK_POLL_MS);
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        refresh();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  /** Runs one desk action, shows the server's message, refetches that doctor. */
  const run = useCallback(
    async (doctorId: number, action: () => Promise<ApiResult<unknown>>) => {
      setBusy(true);
      try {
        const { message } = await action();
        if (mounted.current) {
          setLastAnnouncement(message || null);
        }
      } catch (e) {
        Alert.alert(
          'Could not update the queue',
          userMessage(e, 'Please try again.'),
        );
      } finally {
        await reloadDoctor(doctorId).catch(() => undefined);
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [reloadDoctor],
  );

  const actions = useMemo<DeskActions>(
    () => ({
      callNext: doctorId => run(doctorId, () => queueApi.callNext(doctorId)),
      callPatient: (doctorId, id) =>
        run(doctorId, () => queueApi.callPatient(id)),
      recall: (doctorId, id) => run(doctorId, () => queueApi.recall(id)),
      skip: (doctorId, id) => run(doctorId, () => queueApi.skip(id)),
      checkIn: (doctorId, id) => run(doctorId, () => queueApi.checkIn(id)),
      reinsert: (doctorId, id, position) =>
        run(doctorId, () => queueApi.reinsert(id, position)),
      noShow: (doctorId, id) => run(doctorId, () => queueApi.markNoShow(id)),
    }),
    [run],
  );

  const value = useMemo(
    () => ({
      load,
      desk,
      lastAnnouncement,
      busy,
      refreshing,
      refresh,
      actions,
    }),
    [load, desk, lastAnnouncement, busy, refreshing, refresh, actions],
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useAssistantDesk(): DeskContextValue {
  const ctx = useContext(DeskContext);
  if (!ctx) {
    throw new Error(
      'useAssistantDesk must be used inside <AssistantDeskProvider>',
    );
  }
  return ctx;
}
