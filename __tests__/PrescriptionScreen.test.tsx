/**
 * @format
 */

import React from 'react';
import { Share, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PrescriptionScreen from '../src/screens/patient/PrescriptionScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

afterEach(() => jest.restoreAllMocks());

async function renderPrescription() {
  const navigate = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <PrescriptionScreen
          navigation={{ navigate } as never}
          route={{ key: 'Prescriptions', name: 'Prescriptions' } as never}
        />
      </SafeAreaProvider>,
    );
  });
  const allText = () =>
    renderer.root
      .findAllByType(Text)
      .map(t =>
        ([] as unknown[])
          .concat(t.props.children)
          .filter(c => typeof c === 'string' || typeof c === 'number')
          .join(''),
      )
      .join('\n');
  const byId = (testID: string) => renderer.root.findAllByProps({ testID })[0];
  const press = (testID: string) =>
    ReactTestRenderer.act(async () => {
      await byId(testID).props.onPress();
    });
  return { navigate, allText, byId, press };
}

test('shows the doctor, vitals, medicines with dose times and advice', async () => {
  const { allText } = await renderPrescription();
  const text = allText();
  expect(text).toContain("Today's visit · RX-3502");
  expect(text).toMatch(
    /Dr\. Sarah Johnson\nGeneral Medicine · \d+ \w+ · Token A-12/,
  );
  expect(text).toMatch(/Diagnosis\nViral fever\nTemp\n100\.8°F\nBP\n118\/78/);
  expect(text).toContain('Medicines (3)');
  expect(text).toMatch(
    /Paracetamol 650 mg\nTablet · for fever\n5 days\nAfter food\nMorning\n1\nAfternoon\n—\nNight\n1/,
  );
  expect(text).toMatch(
    /Cetirizine 10 mg[\s\S]*Morning\n—\nAfternoon\n—\nNight\n1/,
  );
  expect(text).toContain('Drink 3 litres of fluids a day');
  expect(text).toContain('Come back sooner');
  expect(text).toContain('Follow-up visit');
});

test("today's doses can be ticked off", async () => {
  const { allText, press, byId } = await renderPrescription();
  expect(allText()).toContain('1 of 3 taken');
  expect(allText()).toMatch(/8:00 AM · Morning\nParacetamol 650 mg, ORS/);
  expect(allText()).toMatch(/9:00 PM · Night\nParacetamol, Cetirizine, ORS/);
  await press('dose-afternoon');
  expect(allText()).toContain('2 of 3 taken');
  expect(byId('dose-afternoon').props.accessibilityState).toEqual({
    checked: true,
  });
  await press('dose-morning');
  expect(allText()).toContain('1 of 3 taken');
});

test('reminders toggle, follow-up booking and sharing', async () => {
  const shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  const { press, byId, navigate } = await renderPrescription();

  expect(byId('reminders-toggle').props.accessibilityState).toEqual({
    checked: true,
  });
  await press('reminders-toggle');
  expect(byId('reminders-toggle').props.accessibilityState).toEqual({
    checked: false,
  });

  await press('book-follow-up');
  expect(navigate).toHaveBeenCalledWith('BookAppointment');

  await press('back');
  expect(navigate).toHaveBeenCalledWith('Home');

  await press('share');
  expect(shareSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining(
        '• Paracetamol 650 mg: 1-0-1, 5 days, after food',
      ),
    }),
  );
});
