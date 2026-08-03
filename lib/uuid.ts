// Math.random()-based UUID v4. React Native's Hermes engine has no global
// `crypto` object — crypto.randomUUID() throws "Property 'crypto' doesn't
// exist" at runtime, crashing any screen that mounts a component calling it
// (this crashed MarinaProfileScreen for every marina, since RentalBookingModal
// generates its id unconditionally on mount). Adding a real polyfill
// (expo-crypto / react-native-get-random-values) needs a native rebuild;
// this is a plain client-side identifier used before a booking row exists
// yet (see lib/uploadBookingDocument.ts), not security-sensitive, so
// Math.random() is fine.
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
