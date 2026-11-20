// Small helpers shared by the screen tests (react-test-renderer).

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Fake only Date (to pin "today"); keep real timers for React and async code. */
export function pinDate(now: Date) {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

/** Call from afterEach: unmounts everything (clears polling timers). */
export async function unmountAll() {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(r => r.unmount());
  });
}

const textOf = (node: ReactTestRenderer.ReactTestInstance) =>
  node
    .findAllByType(Text)
    .map(t =>
      ([] as unknown[])
        .concat(t.props.children)
        .filter(c => typeof c === 'string' || typeof c === 'number')
        .join(''),
    )
    .join('\n');

/** Lets pending promises (API mocks) settle inside act(). */
export const flush = () =>
  ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
  });

export async function mount(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>,
    );
  });
  mounted.push(renderer);
  await flush();

  const byId = (testID: string) =>
    renderer.root.findAll(
      n => n.props.testID === testID && typeof n.type !== 'string',
    )[0] ?? renderer.root.findAllByProps({ testID })[0];
  const exists = (testID: string) =>
    renderer.root.findAllByProps({ testID }).length > 0;
  const press = async (testID: string) => {
    const node = renderer.root.findAll(
      n => n.props.testID === testID && typeof n.props.onPress === 'function',
    )[0];
    if (!node) {
      throw new Error(`No element with testID "${testID}"`);
    }
    await ReactTestRenderer.act(async () => {
      node.props.onPress();
    });
    await flush();
  };
  const type = async (testID: string, text: string) => {
    await ReactTestRenderer.act(async () => {
      byId(testID).props.onChangeText(text);
    });
  };
  const textIn = (testID: string) => textOf(byId(testID));
  const allText = () => textOf(renderer.root);
  const isDisabled = (testID: string) =>
    !!byId(testID)?.props.accessibilityState?.disabled ||
    !!byId(testID)?.props.disabled;
  /** Screen elements whose testID matches, in on-screen order. */
  const ids = (pattern: RegExp) =>
    renderer.root
      .findAll(
        n =>
          typeof n.type === 'string' &&
          typeof n.props.testID === 'string' &&
          pattern.test(n.props.testID),
      )
      .map(n => n.props.testID as string);

  return {
    renderer,
    byId,
    exists,
    press,
    type,
    textIn,
    allText,
    isDisabled,
    ids,
  };
}
