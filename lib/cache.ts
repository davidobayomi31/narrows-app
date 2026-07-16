import AsyncStorage from '@react-native-async-storage/async-storage';

// Persistent JSON cache so screens can show the LAST good data when the app is
// opened offline (no wifi / no service). Everything here fails silently — a
// cache miss or a write error should never break a screen, it just means we
// fall back to whatever we have (or an empty state).

const PREFIX = 'narrows.cache.';

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore — an unwritten cache just means next offline open has older data
  }
}

// Rejects if `promise` hasn't settled within `ms`. React Native's fetch has no
// timeout of its own, so a call made while connected-to-wifi-but-no-internet
// can hang for a very long time. Wrapping network calls in this keeps offline
// waits short and lets callers fall back to the cache quickly.
export function withTimeout<T>(promise: PromiseLike<T>, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
