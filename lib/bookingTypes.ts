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
  // one-line, boater-facing explanation shown under the label on
  // MarinaServicesScreen's service cards — same copy for every marina, since
  // it describes the service type, not anything marina-specific.
  description: string;
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
  slip:          { label: 'Slip',          buttonText: 'Book a Slip',        icon: 'boat',          requestFlow: true,  needsEndDate: true,
    description: 'Reserve a slip for the season and keep your boat docked here.' },
  day_slip:      { label: 'Day Slip',      buttonText: 'Book a Day Slip',    icon: 'boat',          requestFlow: true,  needsEndDate: true,
    description: 'Dock for the day when you’re just passing through.' },
  mooring:       { label: 'Mooring',       buttonText: 'Book a Mooring',     icon: 'locate',        requestFlow: false, needsEndDate: true,
    description: 'Reserve a mooring buoy to anchor your boat offshore.' },
  storage:       { label: 'Storage',       buttonText: 'Book Storage',       icon: 'cube',          requestFlow: true,  needsEndDate: true,
    description: 'Store your boat or trailer on land for the off-season.' },
  haul_out:      { label: 'Haul-Out',      buttonText: 'Book a Haul-Out',    icon: 'construct',     requestFlow: true,  needsEndDate: false,
    description: 'Get your boat lifted out of the water for repairs or storage.' },
  winterization: { label: 'Winterization', buttonText: 'Winterize My Boat',  icon: 'snow',          requestFlow: false, needsEndDate: false,
    description: 'Get your boat winterized and ready before the season ends.' },
  rental:        { label: 'Rental',        buttonText: 'Rent a Seadoo',      icon: 'speedometer',   requestFlow: false, needsEndDate: false,
    description: 'Book a seadoo instantly — pay now, no waiting for approval.' },
  fuel:          { label: 'Fuel',          buttonText: 'Fuel Dock',          icon: 'water',         requestFlow: false, needsEndDate: false,
    description: 'Fuel up at the dock — pay in person, no booking needed.' },
};

export function typeLabel(t: string | undefined | null): string {
  return BOOKING_TYPES[t as ListingType]?.label ?? 'Booking';
}
