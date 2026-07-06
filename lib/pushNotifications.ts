import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

// EAS project id (stable — from app.json extra.eas.projectId). Required by
// getExpoPushTokenAsync to mint a token tied to this project.
const PROJECT_ID = '747b40d4-7c6e-416a-9be2-e4cd125daea7';

// How notifications behave while the app is in the FOREGROUND.
// (When backgrounded, iOS shows them automatically.)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Asks permission, gets this device's Expo push token, and saves it for the
// signed-in user so the backend can target them. Safe to call repeatedly.
export async function registerForPushNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // not logged in — nothing to attach the token to

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return; // user declined — no push for them

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
    await supabase
      .from('push_tokens')
      .upsert({ user_id: user.id, token, updated_at: new Date().toISOString() });
  } catch {
    // token fetch can fail on simulators / no network — push just won't work here
  }
}
