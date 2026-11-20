import React from 'react';
import type { LateArrivalRule } from '../../api/queue';
import SelectSheet, { type SelectOption } from '../../components/SelectSheet';
import { LATE_RULE_LABELS, type DeskPatient } from './deskModel';

export type LateChoice = LateArrivalRule | 'no_show';

const HINTS: Record<LateArrivalRule, string> = {
  next_free_slot: 'First open slot from now',
  after_current: 'Goes in as soon as the room is free',
  end_of_queue: 'After everyone who is waiting',
};

/** A late patient has arrived: where do they go back in the queue? */
export default function LateArrivalSheet({
  patient,
  clinicRule,
  onPick,
  onClose,
}: {
  /** null = hidden */
  patient: DeskPatient | null;
  clinicRule: LateArrivalRule;
  onPick: (choice: LateChoice) => void;
  onClose: () => void;
}) {
  const rules = (Object.keys(LATE_RULE_LABELS) as LateArrivalRule[]).sort(
    (a, b) => Number(b === clinicRule) - Number(a === clinicRule),
  );
  const options: SelectOption<LateChoice>[] = [
    ...rules.map(rule => ({
      value: rule,
      label: LATE_RULE_LABELS[rule],
      hint: rule === clinicRule ? `Clinic rule · ${HINTS[rule]}` : HINTS[rule],
    })),
    {
      value: 'no_show' as const,
      label: 'Mark no-show',
      hint: 'Not coming today; frees the token',
    },
  ];

  return (
    <SelectSheet
      visible={patient !== null}
      title={
        patient
          ? `${patient.token} · ${patient.name}: put back in the queue`
          : ''
      }
      options={options}
      value={null}
      onPick={choice => {
        onClose();
        onPick(choice);
      }}
      onClose={onClose}
      testIDPrefix="late"
    />
  );
}
