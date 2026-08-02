// Shared per-listing-type display config for the generalized booking flow.
// A marina profile shows a "Book X" button only for the listing types that
// marina actually has active rows for in marina_listings — a marina without
// seadoo rentals never shows a rental button, because the row simply isn't
// there. No per-marina feature flags needed.
//
// 'winterization' keeps its own dedicated modal (boat-location/tow questions);
// 'rental' is deliberately NOT bookable yet — it's the instant-book time-slot
// flow (Phase A2). 'fuel' is a point-of-sale thing, not a dated booking.

import { Ionicons } from '@expo/vector-icons';

export type ListingType = 'slip' | 'day_slip' | 'mooring' | 'winterization' | 'rental' | 'fuel' | 'storage' | 'haul_out';

type BookingTypeConfig = {
  label: string;                                    // "Slip"
  buttonText: string;                               // "Book a Slip"
  icon: keyof typeof Ionicons.glyphMap;
  // true = books via the generalized request modal (dates + boat + notes).
  // winterization/rental/fuel are false — each has (or will have) its own flow.
  requestFlow: boolean;
  // whether the request needs a departure date too (slip stay: yes;
  // storage drop-off: yes; both use the half-open hotel date model).
  needsEndDate: boolean;
};

// slip/day_slip/storage/haul_out now have real multi-step wizards
// (BookingRequestModal, WizardModal-based) with proper researched question
// sets — re-enabled 2026-08-01. mooring/rental/fuel stay disabled: mooring
// has no wizard built, rental is the instant-book time-slot flow (Phase A4),
// fuel is pay-at-pump, never a dated booking. winterization keeps its own
// dedicated button/modal (WinterizeRequestModal), not this generic path.
export const BOOKING_TYPES: Record<ListingType, BookingTypeConfig> = {
  slip:          { label: 'Slip',          buttonText: 'Book a Slip',        icon: 'boat',          requestFlow: true,  needsEndDate: true },
  day_slip:      { label: 'Day Slip',      buttonText: 'Book a Day Slip',    icon: 'boat',          requestFlow: true,  needsEndDate: true },
  mooring:       { label: 'Mooring',       buttonText: 'Book a Mooring',     icon: 'locate',        requestFlow: false, needsEndDate: true },
  storage:       { label: 'Storage',       buttonText: 'Book Storage',       icon: 'cube',          requestFlow: true,  needsEndDate: true },
  haul_out:      { label: 'Haul-Out',      buttonText: 'Book a Haul-Out',    icon: 'construct',     requestFlow: true,  needsEndDate: false },
  winterization: { label: 'Winterization', buttonText: 'Winterize My Boat',  icon: 'snow',          requestFlow: false, needsEndDate: false },
  rental:        { label: 'Rental',        buttonText: 'Rent a Seadoo',      icon: 'speedometer',   requestFlow: false, needsEndDate: false },
  fuel:          { label: 'Fuel',          buttonText: 'Fuel Dock',          icon: 'water',         requestFlow: false, needsEndDate: false },
};

export function typeLabel(t: string | undefined | null): string {
  return BOOKING_TYPES[t as ListingType]?.label ?? 'Booking';
}
