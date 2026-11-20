const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Loose check for "name@domain.tld"; the server does the real check. */
export const isValidEmail = (email: string) => EMAIL.test(email.trim());
