// Feature flags for things that are built but not ready to show users yet.

// The marina-side Requests dashboard (MarinaRequestsScreen) and boater-facing
// booking flows (winterization, slip, day slip, storage, haul-out, rental —
// every "Book X" button, its request wizard, and the "My Requests" status
// tracker) are all live under this one flag. Flip to false to hold the whole
// requests feature back again.
export const BOOKING_REQUESTS_LIVE = true;
