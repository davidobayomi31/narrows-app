//Translate raw Supabase / network errors into freindly text
type MaybeError = { message?: string } | null | undefined;
export function friendlyError(error: MaybeError): string {
  const raw = error?.message?.toLowerCase() ?? '';

  // --- Login ---
  if (raw.includes('invalid login credentials')) {
    return "That email and password don't match. Please try again.";
  }
  if (raw.includes('email not confirmed')) {
    return 'Please confirm your email before logging in. Check your inbox for the code.';
  }

  // --- Signup ---
  if (raw.includes('user already registered') || raw.includes('already been registered')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (raw.includes('password should be at least')) {
    return 'Your password is too short. Use at least 6 characters.';
  }

  // --- OTP / confirm email ---
  if (raw.includes('token has expired') || raw.includes('expired')) {
    return 'That code has expired. Request a new one and try again.';
  }
  if (raw.includes('invalid') && raw.includes('token')) {
    return "That code isn't right. Double-check the 8 digits and try again.";
  }

  // --- Rate limiting ---
  if (raw.includes('for security purposes') || raw.includes('rate limit') || raw.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }

  // --- Network ---
  if (raw.includes('network') || raw.includes('fetch')) {
    return 'Connection problem. Check your internet and try again.';
  }

  // --- Fallback: never show the raw message ---
  return 'Something went wrong. Please try again.';
}