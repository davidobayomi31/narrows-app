import { supabase } from './supabase';

// Fires an actual OS-level push via the send-push Edge Function. Best-effort
// -- failures here should never block the action that triggered them (e.g. a
// marina approving a booking shouldn't fail just because a push didn't send).
// The in-app `notifications` row is the source of truth; this is on top of it.
export async function sendPush(
  recipientId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { recipient_id: recipientId, title, body, data },
    });
  } catch {
    // swallow -- push is a nice-to-have, the in-app notification already exists
  }
}
