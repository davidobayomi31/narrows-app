// User-safety actions required by Apple App Store Guideline 1.2 (UGC apps):
// report objectionable content + block abusive users.
// Backed by the `reports` and `blocked_users` tables (see supabase/security_setup.sql).
import { supabase } from './supabase';

export type ReportableType = 'post' | 'comment';

// Shown to the user when they tap "Report". Keep labels short for the Alert buttons.
export const REPORT_REASONS = [
  'Spam or misleading',
  'Harassment or hate',
  'Nudity or sexual content',
  'Violence or threats',
  'Other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** File a report against a post or comment. Returns true on success. */
export async function reportContent(params: {
  contentType: ReportableType;
  contentId: string;
  contentOwnerId?: string | null;
  reason: ReportReason;
}): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    content_type: params.contentType,
    content_id: params.contentId,
    content_owner_id: params.contentOwnerId ?? null,
    reason: params.reason,
  });
  return !error;
}

/** Block another user. Returns true on success. */
export async function blockUser(blockedId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id === blockedId) return false;

  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: user.id, blocked_id: blockedId });
  // ignore duplicate-block errors (already blocked) — treat as success
  return !error || error.code === '23505';
}

/** Unblock a user. */
export async function unblockUser(blockedId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);
  return !error;
}

/**
 * Returns the set of user ids that should be hidden from the current user's
 * feeds — people they blocked AND people who blocked them (so blocking is
 * mutual: neither sees the other's content).
 */
export async function getHiddenUserIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('blocked_users')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

  const hidden = new Set<string>();
  for (const row of data || []) {
    hidden.add(row.blocker_id === user.id ? row.blocked_id : row.blocker_id);
  }
  return hidden;
}
