/**
 * @format
 */

import React from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import CreateAccountScreen from '../src/screens/auth/CreateAccountScreen';
import { mount, pinDate, unmountAll } from '../test-utils/render';

beforeEach(() => pinDate(new Date(2026, 10, 18, 10, 35)));

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
});

async function renderScreen(onSubmit: jest.Mock = jest.fn()) {
  const props = {
    onSubmit,
    onBack: jest.fn(),
    onSignIn: jest.fn(),
    onOpenTerms: jest.fn(),
    onOpenPrivacy: jest.fn(),
  };
  const screen = await mount(<CreateAccountScreen {...props} />);
  const fill = async ({ agree = true } = {}) => {
    await screen.type('name-input', '  Ritu   Sharma ');
    await screen.type('mobile-input', '+91 98765-43210');
    await screen.type('dob-input', '15081990');
    await screen.press('gender-female');
    await screen.type('password-input', 'Sunrise@2026');
    if (agree) {
      await screen.press('agree');
    }
  };
  return { ...screen, ...props, fill };
}

test('one step: no "Step 1 of 2" and no OTP, just "Create account"', async () => {
  const { allText } = await renderScreen();
  const text = allText();
  expect(text).toContain('Create your account');
  expect(text).toContain(
    'Already registered at the hospital? Use the same mobile number.',
  );
  expect(text).toContain('Create account');
  expect(text).not.toMatch(/Step|OTP|verify/i);
  for (const label of [
    'Full name',
    'Mobile number',
    'Date of birth',
    'Gender',
    'Email',
    'Create password',
  ]) {
    expect(text).toContain(label);
  }
  expect(text).toContain(' (optional)');
});

test('shows what is missing and sends nothing', async () => {
  const { press, exists, textIn, onSubmit } = await renderScreen();
  await press('create-account');
  expect(textIn('error-fullName')).toBe('Enter your full name.');
  expect(textIn('error-mobile')).toBe('Enter your 10-digit mobile number.');
  expect(textIn('error-dob')).toBe('Enter date of birth.');
  expect(textIn('error-gender')).toBe('Choose a gender.');
  expect(textIn('error-password')).toBe('Use at least 8 characters.');
  expect(textIn('error-agreed')).toBe(
    'Please accept the Terms and Privacy Policy.',
  );
  expect(exists('error-email')).toBe(false); // optional
  expect(onSubmit).not.toHaveBeenCalled();
});

test('formats the mobile number and date of birth as they are typed', async () => {
  const { fill, byId } = await renderScreen();
  await fill();
  expect(byId('mobile-input').props.value).toBe('9876543210');
  expect(byId('dob-input').props.value).toBe('15/08/1990');
});

test('sends the whole account in one go', async () => {
  const { fill, press, onSubmit } = await renderScreen();
  await fill();
  await press('create-account');
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith({
    fullName: 'Ritu Sharma',
    phone: '9876543210',
    dateOfBirth: '1990-08-15',
    gender: 'female',
    email: null,
    password: 'Sunrise@2026',
  });
});

test('the Terms must be accepted; ticking the box clears the error', async () => {
  const { fill, press, exists, textIn, onSubmit } = await renderScreen();
  await fill({ agree: false });
  await press('create-account');
  expect(textIn('error-agreed')).toBe(
    'Please accept the Terms and Privacy Policy.',
  );
  expect(onSubmit).not.toHaveBeenCalled();

  await press('agree');
  expect(exists('error-agreed')).toBe(false);
  await press('create-account');
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test('the strength meter appears while typing a password', async () => {
  const { type, exists, textIn } = await renderScreen();
  expect(exists('password-strength')).toBe(false);
  await type('password-input', 'abcdefgh');
  expect(textIn('password-strength')).toBe(
    'Medium · add a number and a symbol',
  );
  await type('password-input', 'Abcdef1!');
  expect(textIn('password-strength')).toBe('Strong');
});

test('the eye shows and hides the password', async () => {
  const { byId, press } = await renderScreen();
  expect(byId('password-input').props.secureTextEntry).toBe(true);
  await press('toggle-password');
  expect(byId('password-input').props.secureTextEntry).toBe(false);
});

test.each([
  [
    'ACCOUNT_EXISTS',
    'error-mobile',
    'This number already has an account. Sign in instead.',
  ],
  [
    'PHONE_RESERVED',
    'error-mobile',
    'This number belongs to a staff account. Use another number.',
  ],
  [
    'EMAIL_TAKEN',
    'error-email',
    'This email is already used by another account.',
  ],
])('409 %s is shown under its field', async (code, errorId, message) => {
  const onSubmit = jest
    .fn()
    .mockRejectedValue(new ApiError('Server message', 409, code));
  const { fill, press, textIn, exists } = await renderScreen(onSubmit);
  await fill();
  await press('create-account');
  expect(textIn(errorId)).toBe(message);
  expect(exists('form-error')).toBe(false);
});

test("a 409 without a field (PROFILE_TAKEN) shows the server's message", async () => {
  const onSubmit = jest
    .fn()
    .mockRejectedValue(
      new ApiError(
        'This patient is already linked to another account',
        409,
        'PROFILE_TAKEN',
      ),
    );
  const { fill, press, textIn } = await renderScreen(onSubmit);
  await fill();
  await press('create-account');
  expect(textIn('form-error')).toBe(
    'This patient is already linked to another account',
  );
});

test('any other failure is shown above the button, and can be retried', async () => {
  const onSubmit = jest
    .fn()
    .mockRejectedValueOnce(
      new ApiError(
        "Creating an account isn't available yet. Please ask the hospital desk to register you.",
        404,
        'SIGN_UP_UNAVAILABLE',
      ),
    )
    .mockResolvedValueOnce(undefined);
  const { fill, press, textIn, exists } = await renderScreen(onSubmit);
  await fill();
  await press('create-account');
  expect(textIn('form-error')).toMatch(/ask the hospital desk/);

  await press('create-account');
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(exists('form-error')).toBe(false);
});

test('back, sign in, Terms and Privacy Policy', async () => {
  const s = await renderScreen();
  await s.press('back');
  expect(s.onBack).toHaveBeenCalledTimes(1);
  await s.press('go-sign-in');
  expect(s.onSignIn).toHaveBeenCalledTimes(1);
  await s.press('terms-link');
  expect(s.onOpenTerms).toHaveBeenCalledTimes(1);
  await s.press('privacy-link');
  expect(s.onOpenPrivacy).toHaveBeenCalledTimes(1);
});

describe('keyboard', () => {
  const act = (fn: () => void) =>
    ReactTestRenderer.act(async () => {
      fn();
    });
  const box = (y: number, height: number) => ({
    nativeEvent: { layout: { x: 0, y, width: 390, height } },
  });

  test('the form shrinks above the keyboard on Android too (edge-to-edge)', async () => {
    const { renderer } = await renderScreen();
    expect(renderer.root.findByType(KeyboardAvoidingView).props.behavior).toBe(
      'padding',
    );
  });

  test('the password field scrolls into view when the keyboard opens', async () => {
    const s = await renderScreen();
    const scroll = s.renderer.root.findByType(ScrollView);
    const scrollTo = scroll.instance.scrollTo as jest.Mock;
    // Full screen, not scrolled; the password field is low on the form.
    await act(() => scroll.props.onLayout(box(0, 800)));
    await act(() => s.byId('field-password').props.onLayout(box(600, 90)));
    scrollTo.mockClear();

    await act(() => s.byId('password-input').props.onFocus());
    expect(scrollTo).not.toHaveBeenCalled(); // still visible

    // The keyboard opens: 420 px are left above it. 600 + 90 + 16 - 420.
    await act(() => scroll.props.onLayout(box(0, 420)));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 286, animated: true });

    // Typing shows the strength meter: the field grows and stays in view.
    await act(() =>
      scroll.props.onScroll({
        nativeEvent: { contentOffset: { x: 0, y: 286 } },
      }),
    );
    await s.type('password-input', 'abcdefgh');
    await act(() => s.byId('field-password').props.onLayout(box(600, 130)));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 326, animated: true });

    // Done typing: the keyboard closing doesn't move the form.
    await act(() => s.byId('password-input').props.onBlur());
    scrollTo.mockClear();
    await act(() => scroll.props.onLayout(box(0, 800)));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('a field above the visible part scrolls down into view', async () => {
    const s = await renderScreen();
    const scroll = s.renderer.root.findByType(ScrollView);
    const scrollTo = scroll.instance.scrollTo as jest.Mock;
    await act(() => scroll.props.onLayout(box(0, 420)));
    await act(() => s.byId('field-fullName').props.onLayout(box(120, 80)));
    await act(() =>
      scroll.props.onScroll({
        nativeEvent: { contentOffset: { x: 0, y: 400 } },
      }),
    );
    scrollTo.mockClear();
    await act(() => s.byId('name-input').props.onFocus());
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 104, animated: true });
  });
});
