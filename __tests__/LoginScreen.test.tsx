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
  const onCreateAccount = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <LoginScreen
          onSignIn={onSignIn}
          onForgotPassword={jest.fn()}
          onSignInWithOtp={jest.fn()}
          onCreateAccount={onCreateAccount}
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
  return { onSignIn, onCreateAccount, byId, text, act };
}

test('shows the app name, with no role selector or "keep me signed in"', async () => {
  const { text } = await renderLogin();
  expect(text()).toContain('"Doctors Bookings"');
  expect(text()).not.toContain('SWAP INFOTECH');
  const withoutBrand = text().replace('Doctors Bookings', '');
  expect(withoutBrand).not.toMatch(/Sign in as|Patient|Doctor|Assistant/);
  expect(text()).not.toContain('Keep me signed in');
});

test('"New patient? Create account" opens sign-up', async () => {
  const { onCreateAccount, byId, text, act } = await renderLogin();
  expect(text()).toContain('New patient? ');
  expect(text()).toContain('Create account');
  await act(() => byId('create-account-link').props.onPress());
  expect(onCreateAccount).toHaveBeenCalledTimes(1);
});

test('asks for a mobile number, not an email', async () => {
  const { byId, text } = await renderLogin();
  expect(byId('email-input')).toBeUndefined();
  expect(text()).not.toContain('"Email"');
  expect(text()).toContain('Mobile number');
  expect(text()).toContain('+91');
  expect(byId('mobile-input').props.keyboardType).toBe('phone-pad');
});

test('rejects something that is not a mobile number', async () => {
  const { onSignIn, byId, text, act } = await renderLogin();
  await act(() => byId('password-input').props.onChangeText('secret'));
  for (const value of ['sarah@clinic.com', '98765', '1234567890']) {
    await act(() => byId('mobile-input').props.onChangeText(value));
    await act(() => byId('sign-in-button').props.onPress());
    expect(text()).toContain('Enter your 10-digit mobile number.');
  }
  expect(onSignIn).not.toHaveBeenCalled();
});

test('signs in with the 10-digit mobile number and password', async () => {
  const { onSignIn, byId, act } = await renderLogin();
  await act(() => byId('mobile-input').props.onChangeText(' +91 98765-06543 '));
  await act(() => byId('password-input').props.onChangeText('secret'));
  await act(() => byId('sign-in-button').props.onPress());
  expect(onSignIn).toHaveBeenCalledWith('9876506543', 'secret');
});
