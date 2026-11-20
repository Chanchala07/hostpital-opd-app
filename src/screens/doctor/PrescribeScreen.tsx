import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';
import { getVisitId } from '../../api/queue';
import {
  getVisit,
  savePrescription,
  type ConsultationVisit,
  type MedicineInput,
} from '../../api/visits';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import MedicineSheet from './MedicineSheet';
import {
  MAX_MEDICINES,
  asInput,
  medicineTitle,
  scheduleText,
} from './prescriptionForm';

type Props = NativeStackScreenProps<RootStackParamList, 'Prescribe'>;

type Medicine = MedicineInput & { key: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; visitId: number; visit: ConsultationVisit };

let keys = 0;
const keyed = (m: MedicineInput): Medicine => ({
  ...asInput(m),
  key: `medicine-${++keys}`,
});

/**
 * Doctor, during the consultation: write the patient's medicines. Each change
 * is saved to the visit's draft prescription; "Visit complete" finalises it.
 */
export default function PrescribeScreen({ navigation, route }: Props) {
  const { appointmentId, visitId: knownVisitId } = route.params;
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({
    state: 'idle',
  });
  /** Sheet open: null = adding, a number = editing that medicine. */
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const saveState = useRef<SaveState>('idle');
  /** Saves run one after another, so the server ends with the last list. */
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));
  const lastSave = useRef(0);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const fetchVisit = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const visitId = knownVisitId ?? (await getVisitId(appointmentId));
      if (visitId == null) {
        setLoad({
          status: 'error',
          message: 'Start the consultation before writing the prescription.',
        });
        return;
      }
      const visit = await getVisit(visitId);
      if (!mounted.current) {
        return;
      }
      if (visit.status !== 'in_progress') {
        setLoad({
          status: 'error',
          message: 'This visit is already completed.',
        });
        return;
      }
      setMedicines((visit.prescription?.items ?? []).map(keyed));
      setLoad({ status: 'ready', visitId, visit });
    } catch (e) {
      if (mounted.current) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not open this visit.'),
        });
      }
    }
  }, [appointmentId, knownVisitId]);

  useEffect(() => {
    fetchVisit();
  }, [fetchVisit]);

  // Leaving with the last change unsaved: ask first.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', e => {
        if (saveState.current !== 'error') {
          return;
        }
        e.preventDefault();
        Alert.alert(
          'Prescription not saved',
          'Your last change to the medicines was not saved.',
          [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Leave anyway',
              style: 'destructive',
              onPress: () => navigation.dispatch(e.data.action),
            },
          ],
        );
      }),
    [navigation],
  );

  const persist = (visitId: number, next: Medicine[]) => {
    setMedicines(next);
    const request = ++lastSave.current;
    const show = (state: SaveState, message?: string) => {
      if (request !== lastSave.current) {
        return; // a newer change is on its way
      }
      saveState.current = state;
      if (mounted.current) {
        setSave({ state, message });
      }
    };
    show('saving');
    const items = next.map(asInput);
    saving.current = saving.current.then(() =>
      savePrescription(visitId, items).then(
        () => {
          show('saved');
          return true;
        },
        e => {
          show('error', userMessage(e, 'Could not save the prescription.'));
          return false;
        },
      ),
    );
  };

  const done = async () => {
    setLeaving(true);
    await saving.current;
    if (mounted.current) {
      setLeaving(false);
      navigation.goBack();
    }
  };

  const ready = load.status === 'ready' ? load : null;
  const visit = ready?.visit;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          testID="back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Prescription</Text>
          {visit ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[visit.token, visit.patient.fullName, visit.patient.ageGender]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>
        {ready ? <SaveStatus state={save.state} /> : null}
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Opening the visit…" testID="rx-loading" />
      ) : load.status === 'error' ? (
        <ErrorView
          message={load.message}
          onRetry={fetchVisit}
          testID="rx-error"
        />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {save.state === 'error' ? (
              <View style={styles.saveError} testID="save-error">
                <Text style={styles.saveErrorText}>{save.message}</Text>
                <Pressable
                  testID="save-retry"
                  onPress={() => persist(load.visitId, medicines)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.saveRetry}>Try again</Text>
                </Pressable>
              </View>
            ) : null}

            <PatientNotes visit={load.visit} />

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Medicines</Text>
              <View style={styles.countPill}>
                <Text style={styles.countText} testID="medicine-count">
                  {medicines.length}
                </Text>
              </View>
            </View>

            {medicines.length === 0 ? (
              <View style={styles.empty} testID="no-medicines">
                <Text style={styles.emptyTitle}>No medicines yet</Text>
                <Text style={styles.emptyText}>
                  Add what the patient should take, with doses and days.
                </Text>
              </View>
            ) : (
              medicines.map((m, index) => (
                <MedicineCard
                  key={m.key}
                  index={index}
                  medicine={m}
                  onEdit={() => setEditing(index)}
                  onRemove={() =>
                    Alert.alert(`Remove ${medicineTitle(m)}?`, undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () =>
                          persist(
                            load.visitId,
                            medicines.filter((_, i) => i !== index),
                          ),
                      },
                    ])
                  }
                />
              ))
            )}

            {medicines.length < MAX_MEDICINES ? (
              <Pressable
                testID="add-medicine"
                onPress={() => setEditing(null)}
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Plus size={18} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.addText}>Add medicine</Text>
              </Pressable>
            ) : (
              <Text style={styles.mutedSmall}>
                {`A prescription can have up to ${MAX_MEDICINES} medicines.`}
              </Text>
            )}

            <Text style={styles.mutedSmall}>
              Saved as you write. "Visit complete" finalises the prescription
              and sends it to the patient.
            </Text>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              testID="rx-done"
              onPress={done}
              disabled={leaving}
              style={({ pressed }) => [
                styles.doneButton,
                (pressed || leaving) && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              {leaving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.doneText}>
                  {medicines.length === 0
                    ? 'Done'
                    : `Done · ${medicines.length} ${
                        medicines.length === 1 ? 'medicine' : 'medicines'
                      }`}
                </Text>
              )}
            </Pressable>
          </View>

          <MedicineSheet
            visible={editing !== undefined}
            initial={
              editing === null || editing === undefined
                ? null
                : medicines[editing] ?? null
            }
            allergies={load.visit.patient.allergies}
            onClose={() => setEditing(undefined)}
            onSubmit={medicine => {
              const next =
                editing === null || editing === undefined
                  ? [...medicines, keyed(medicine)]
                  : medicines.map((m, i) =>
                      i === editing ? { ...medicine, key: m.key } : m,
                    );
              setEditing(undefined);
              persist(load.visitId, next);
            }}
          />
        </>
      )}
    </View>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return (
      <View style={styles.status} testID="save-status">
        <ActivityIndicator size="small" color={colors.muted} />
        <Text style={styles.statusText}>Saving…</Text>
      </View>
    );
  }
  if (state === 'saved') {
    return (
      <View style={styles.status} testID="save-status">
        <Check size={16} color={colors.success} strokeWidth={2.5} />
        <Text style={[styles.statusText, styles.statusSaved]}>Saved</Text>
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={styles.status} testID="save-status">
        <Text style={[styles.statusText, styles.statusError]}>Not saved</Text>
      </View>
    );
  }
  return null;
}

/** What the doctor should keep in mind: allergies, complaint, vitals… */
function PatientNotes({ visit }: { visit: ConsultationVisit }) {
  const { patient, vitals } = visit;
  const vitalsText = vitals
    ? [
        vitals.temperatureF != null ? `${vitals.temperatureF} °F` : null,
        vitals.bp ? `BP ${vitals.bp}` : null,
        vitals.pulse != null ? `Pulse ${vitals.pulse}` : null,
        vitals.spo2 != null ? `SpO₂ ${vitals.spo2}%` : null,
        vitals.weightKg != null ? `${vitals.weightKg} kg` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const current = patient.currentMedicines
    .map(m => [m.name, m.dose].filter(Boolean).join(' '))
    .join(', ');
  const rows: { label: string; value: string; alert?: boolean }[] = [
    { label: 'Complaint', value: visit.complaint ?? '' },
    { label: 'Vitals', value: vitalsText, alert: vitals?.hasFever },
    { label: 'Conditions', value: patient.conditions.join(', ') },
    { label: 'Already taking', value: current },
  ].filter(r => r.value);

  return (
    <>
      {patient.allergies.length > 0 ? (
        <View style={styles.allergy} testID="allergies">
          <TriangleAlert size={18} color={colors.alertLabel} />
          <View style={styles.flex}>
            <Text style={styles.allergyLabel}>ALLERGIES</Text>
            <Text style={styles.allergyText}>
              {patient.allergies.join(', ')}
            </Text>
          </View>
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.card} testID="patient-notes">
          {rows.map(r => (
            <View key={r.label} style={styles.noteRow}>
              <Text style={styles.noteLabel}>{r.label}</Text>
              <Text style={[styles.noteValue, r.alert && styles.noteAlert]}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

function MedicineCard({
  index,
  medicine,
  onEdit,
  onRemove,
}: {
  index: number;
  medicine: Medicine;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <Pressable
      testID={`medicine-${index}`}
      onPress={onEdit}
      style={({ pressed }) => [styles.medicine, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityHint="Edit this medicine"
    >
      <View style={styles.number}>
        <Text style={styles.numberText}>{index + 1}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.medicineName}>
          {medicineTitle(medicine)}
          {medicine.form ? (
            <Text style={styles.medicineForm}>{`  ${medicine.form}`}</Text>
          ) : null}
        </Text>
        <Text style={styles.schedule}>{scheduleText(medicine)}</Text>
        {medicine.instructions ? (
          <Text style={styles.instructions}>{medicine.instructions}</Text>
        ) : null}
      </View>
      <View style={styles.medicineActions}>
        <Pencil size={17} color={colors.muted} />
        <Pressable
          testID={`remove-medicine-${index}`}
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${medicineTitle(medicine)}`}
        >
          <Trash2 size={18} color={colors.danger} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  mutedSmall: { fontSize: 13, lineHeight: 18, color: colors.muted },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 1, fontSize: 13, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  statusSaved: { color: colors.successText },
  statusError: { color: colors.error },

  content: { padding: 16, gap: 12, paddingBottom: 24 },

  saveError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.alertSoft,
    borderColor: colors.alertBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  saveErrorText: { flex: 1, fontSize: 13, color: colors.alertText },
  saveRetry: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Patient
  allergy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.alertSoft,
    borderColor: colors.alertBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  allergyLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.alertLabel,
  },
  allergyText: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.alertText,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  noteRow: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  noteLabel: { width: 104, fontSize: 13, color: colors.muted },
  noteValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  noteAlert: { color: colors.danger },

  // Medicines
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  countPill: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  countText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  empty: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  medicine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  medicineName: { fontSize: 16, fontWeight: '700', color: colors.text },
  medicineForm: { fontSize: 13, fontWeight: '500', color: colors.muted },
  schedule: { marginTop: 4, fontSize: 14, color: colors.navy },
  instructions: {
    marginTop: 4,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.muted,
  },
  medicineActions: { alignItems: 'center', gap: 16, paddingTop: 2 },
  addButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.selectedSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  // Footer
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  doneButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
