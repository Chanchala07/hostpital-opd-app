/**
 * @format
 */

import {
  EMPTY_ACCOUNT,
  mobileInput,
  passwordStrength,
  toSignUp,
  validateCreateAccount,
  type CreateAccountForm,
} from '../src/screens/auth/createAccountForm';

const TODAY = new Date(2026, 10, 18, 10, 35);

const VALID: CreateAccountForm = {
  fullName: 'Ritu Sharma',
  mobile: '9876543210',
  dob: '15/08/1990',
  gender: 'female',
  email: '',
  password: 'Sunrise@2026',
  agreed: true,
};

test.each([
  ['', 0, ''],
  ['abc', 1, 'Weak · use at least 8 characters'],
  ['abcdefgh', 2, 'Medium · add a number and a symbol'],
  ['abcdefg1', 2, 'Medium · add a symbol and a capital letter'],
  ['Abcdefg1', 3, 'Good · add a symbol'],
  ['abcdef1!', 3, 'Good · add a capital letter'],
  ['Abcdef1!', 4, 'Strong'],
])('password strength of "%s"', (password, score, label) => {
  expect(passwordStrength(password)).toEqual({ score, label });
});

test.each([
  ['9876543210', '9876543210'],
  ['98765 43210', '9876543210'],
  ['+91 98765-43210', '9876543210'],
  ['919876543210', '9876543210'],
  ['98765432109', '9876543210'],
  ['98a76', '9876'],
])('mobile number "%s" → "%s"', (typed, kept) => {
  expect(mobileInput(typed)).toBe(kept);
});

test('a complete form has no errors', () => {
  expect(validateCreateAccount(VALID, TODAY)).toEqual({});
});

test('an empty form lists every required field, but not the email', () => {
  expect(validateCreateAccount(EMPTY_ACCOUNT, TODAY)).toEqual({
    fullName: 'Enter your full name.',
    mobile: 'Enter your 10-digit mobile number.',
    dob: 'Enter date of birth.',
    gender: 'Choose a gender.',
    password: 'Use at least 8 characters.',
    agreed: 'Please accept the Terms and Privacy Policy.',
  });
});

test('checks the date of birth, email, mobile and password length', () => {
  const errors = validateCreateAccount(
    {
      ...VALID,
      dob: '19/11/2026',
      email: 'ritu@gmail',
      mobile: '1234567890',
      password: 'x'.repeat(73),
    },
    TODAY,
  );
  expect(errors).toEqual({
    dob: "Date of birth can't be in the future.",
    email: 'Check the email address.',
    mobile: 'Enter your 10-digit mobile number.',
    password: 'Use 72 characters or fewer.',
  });
  expect(validateCreateAccount({ ...VALID, dob: '31/02/1990' }, TODAY)).toEqual(
    { dob: 'Use DD/MM/YYYY, e.g. 15/08/1987.' },
  );
});

test('what the server gets', () => {
  expect(
    toSignUp({
      ...VALID,
      fullName: '  Ritu   Sharma ',
      email: ' ritu@gmail.com ',
    }),
  ).toEqual({
    fullName: 'Ritu Sharma',
    phone: '9876543210',
    dateOfBirth: '1990-08-15',
    gender: 'female',
    email: 'ritu@gmail.com',
    password: 'Sunrise@2026',
  });
  expect(toSignUp(VALID).email).toBeNull();
});
