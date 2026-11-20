/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from '../src/screens/auth/LoginScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderLogin() {
  const onSignIn = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <LoginScreen
          onSignIn={onSignIn}
          onForgotPassword={jest.fn()}
          onSignInWithOtp={jest.fn()}
          onCreateAccount={jest.fn()}
        />
      </SafeAreaProvider>,
    );
  });
  const byId = (id: string) => renderer.root.findAllByProps({ testID: id })[0];
  const text = () => JSON.stringify(renderer.toJSON());
  const act = (fn: () => void) =>
    ReactTestRenderer.act(async () => {
      fn();
    });
  return { onSignIn, byId, text, act };
}

test('has no role selector or "keep me signed in" option', async () => {
  const { text } = await renderLogin();
  expect(text()).not.toMatch(/Sign in as|Patient|Doctor|Assistant/);
  expect(text()).not.toContain('Keep me signed in');
});

test('asks for email, not a mobile number', async () => {
  const { byId, text } = await renderLogin();
  expect(byId('mobile-input')).toBeUndefined();
  expect(text()).not.toMatch(/Mobile number|\+91/);
  expect(text()).toContain('Email');
  expect(byId('email-input').props.keyboardType).toBe('email-address');
  expect(byId('email-input').props.autoCapitalize).toBe('none');
});

test('rejects an invalid email', async () => {
  const { onSignIn, byId, text, act } = await renderLogin();
  await act(() => byId('email-input').props.onChangeText('sarah@clinic'));
  await act(() => byId('password-input').props.onChangeText('secret'));
  await act(() => byId('sign-in-button').props.onPress());
  expect(onSignIn).not.toHaveBeenCalled();
  expect(text()).toContain('Enter a valid email address.');
});

test('signs in with a valid email and password', async () => {
  const { onSignIn, byId, act } = await renderLogin();
  await act(() =>
    byId('email-input').props.onChangeText('  Doctor@OPD.example '),
  );
  await act(() => byId('password-input').props.onChangeText('secret'));
  await act(() => byId('sign-in-button').props.onPress());
  expect(onSignIn).toHaveBeenCalledWith('doctor@opd.example', 'secret');
});
