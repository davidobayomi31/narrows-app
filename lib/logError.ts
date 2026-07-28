// Central place to record unexpected client errors so you can be alerted.
//
// Every caught crash / unhandled rejection is best-effort written to the
// `client_errors` table (see supabase/checklist_hardening.sql). A Supabase
// Database Webhook on that table then emails you — that's the "alert me if
// something breaks" piece. Logging is fire-and-forget: it must NEVER throw or
// block, or the error handler would itself become a source of errors.
import { Platform } from 'react-native';
import { supabase } from './supabase';
import Constants from 'expo-constants';

const appVersion =
  (Constants.expoConfig?.version as string | undefined) ?? 'unknown';

export async function logError(
  error: unknown,
  context?: { source?: string; extra?: Record<string, unknown> }
): Promise<void> {
  try {
    const err = error as { message?: string; stack?: string } | undefined;
    const message = err?.message ?? String(error);

    // Always surface it in dev/console so it isn't silently swallowed.
    // eslint-disable-next-line no-console
    console.error(`[Narrows] ${context?.source ?? 'error'}:`, error);

    // user_id is optional — a crash can happen before/without a session.
    const { data } = await supabase.auth.getUser();

    await supabase.from('client_errors').insert({
      user_id: data?.user?.id ?? null,
      source: context?.source ?? null,
      message: message.slice(0, 1000),
      stack: err?.stack?.slice(0, 4000) ?? null,
      platform: Platform.OS,
      app_version: appVersion,
      extra: context?.extra ?? null,
    });
  } catch {
    // swallow — logging failures must not cascade
  }
}
