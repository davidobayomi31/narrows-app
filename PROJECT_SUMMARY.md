# Narrows App — Project Summary

> Last updated: June 15, 2026  
> Platform: React Native / Expo SDK 54 (blank-typescript template)  
> Developer: David Obayomi

---

## 1. What Is Narrows?

A marina and waterway navigation social app for **Simcoe County, Ontario**. Users can check live conditions, discover marinas, log trips and catches, and see activity from other boaters in their region.

**Monetization plan:** Ads served using data collected at signup (boat ownership, region, experience level). Data is collected progressively — minimal signup form first, personalization questions after account creation (onboarding flow).

---

## 2. Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| Expo | ~54.0.34 | Build toolchain, dev server |
| React Native | 0.81.5 | UI framework |
| TypeScript | ~5.9.2 | Language (`.tsx` files) |
| `@react-navigation/native` | ^7.3.3 | Navigation container |
| `@react-navigation/native-stack` | ^7.17.5 | Stack navigation (auth flow) |
| `@react-navigation/bottom-tabs` | ^7.18.2 | Bottom tab bar (installed, not yet wired up) |
| `expo-local-authentication` | ~17.0.8 | Face ID / Touch ID / fingerprint |
| `react-native-safe-area-context` | ~5.6.0 | iPhone notch/status bar handling |
| `react-native-screens` | ~4.16.0 | Native screen optimization |

**Do not upgrade Expo SDK** — phone runs Expo Go 54.0.2 and must stay on SDK 54.

---

## 3. Project File Structure

```
narrows-app/
├── App.tsx                     # Navigation hub (stack navigator)
├── index.ts                    # Entry point
├── app.json                    # Expo config (NSFaceIDUsageDescription added)
├── package.json
├── tsconfig.json
├── constants/
│   └── colors.ts               # Brand color tokens
├── screens/
│   ├── SplashScreen.tsx        # COMPLETE
│   ├── LoginScreen.tsx         # COMPLETE
│   ├── SignupScreen.tsx        # COMPLETE
│   ├── OnboardingScreen.tsx    # COMPLETE (minor typo — see known issues)
│   └── Homepage.tsx            # PLACEHOLDER — not yet built
└── assets/
    ├── narrows-logo-clear.png  # Transparent background logo (active)
    ├── narrows-logo.png
    ├── narrows-logo-black.png
    └── narrows-logo-transparent.png
```

---

## 4. Design System

### Brand Colors (`constants/colors.ts`)

| Name | Hex | Usage |
|---|---|---|
| `background` | `#000000` | All screen backgrounds |
| `navy` | `#1B2A3B` | Accent (currently unused in screens) |
| `cream` | `#F5F0E8` | Primary text, headings |
| `gold` | `#C9A84C` | CTA buttons, active states, links, progress dots |
| `white` | `#FFFFFF` | Apple/Google sign-in buttons |
| `black` | `#000000` | Text on light buttons |

### Supporting Colors (used inline, not in Colors token)

| Hex | Usage |
|---|---|
| `#1A1A1A` | Input field background |
| `#333333` | Input border (default) |
| `#2E4057` | Dividers, or-lines |
| `#8899AA` | Placeholder text, secondary text, muted labels |
| `#FF4444` | Validation error text and border |
| `#1A1200` | Selected option background (very dark gold tint) |

### Typography

- Headings: `fontWeight: 'bold'`, `letterSpacing: 8` (NARROWS title)
- Body: `fontSize: 16`, `color: Colors.cream`
- Muted / labels: `fontSize: 14`, `color: '#8899AA'`
- Error text: `fontSize: 12`, `color: '#FF4444'`

### Shared UI Patterns

- **Inputs**: `backgroundColor: '#1A1A1A'`, `borderColor: '#333333'`, `borderRadius: 12`, `padding: 16`, cream text
- **Primary button**: gold background, black text, `borderRadius: 12`, `padding: 16`, `fontWeight: '700'`
- **Error state**: input border turns `#FF4444`, error message appears below field
- **Password toggle icon**: ⚓ (hidden) / 🔓 (visible) — anchor/water theme
- **Screen wrapper pattern**: `SafeAreaView` → `KeyboardAvoidingView` → `ScrollView` (handles keyboard + notch on every input screen)

---

## 5. Screens — Status & Details

### SplashScreen.tsx — COMPLETE
- Shows logo centered on black background for 2 seconds
- Then checks login status (placeholder booleans for now):
  - `isLoggedIn = false` → navigate to Login
  - `hasCredentials = false` → trigger biometric auth → navigate to Home or Login
  - Neither → navigate to Login
- Uses `expo-local-authentication` for Face ID / Touch ID / fingerprint
- Biometric prompt message: `"Welcome back to Narrows"`

### LoginScreen.tsx — COMPLETE
- Black background, transparent compass logo, "NARROWS" title, gold tagline
- Email field with `@` validation
- Password field with ⚓/🔓 toggle, 6-char minimum validation
- "Forgot password?" link (gold, not yet wired)
- Gold "Log In" CTA button
- "or" divider
- White "Continue with Apple" button (black text)
- White "Continue with Google" button (black text)
- "Don't have an account? Sign up" → navigates to Signup
- `handlesBiometricLogin()` function defined but currently outside the component — needs to move inside later
- Apple/Google auth not yet wired (frontend only)

### SignupScreen.tsx — COMPLETE
- Same visual style as LoginScreen (black, cream text, gold accents)
- Fields: Full Name, Email, Password, Confirm Password
- All four fields have individual error states
- Password and Confirm Password both have ⚓/🔓 toggle
- "Create Account" gold button → validates → navigates to Onboarding
- "Already have an account? Log in" → navigates to Login
- **Deferred**: Privacy policy checkbox (add before launch)

### OnboardingScreen.tsx — COMPLETE (one known typo)
- 3-step progressive personalization flow
- Progress dots at top: active dot is gold and wider (`width: 24`)
- Step 0: "Do you own a boat?" — Yes / No / I have access to one
- Step 1: "Where do you boat?" — Simcoe County, Georgian Bay, Lake Ontario, Lake Erie, Other
- Step 2: "What's your experience on the water?" — Beginner, Intermediate, Experienced, Professional
- Selected option: dark gold tint background + gold border
- "Next" / "Get Started" (last step) gold button
- "Skip for now" ghost link on every step
- Navigates to Home on completion or skip
- **Known issue**: Line 22 may have a stray character `2` in `handleNext` closing brace — check and remove if present

### Homepage.tsx — PLACEHOLDER (not yet built)
- Currently contains an old stub named `SignupScreen` — function name needs updating to `Homepage`
- See Section 7 for the planned layout

---

## 6. Navigation Architecture

### Current (Stack Only)

```
App.tsx
└── NavigationContainer
    └── Stack.Navigator (initialRoute: 'Splash')
        ├── Splash → SplashScreen
        ├── Login  → LoginScreen
        ├── Signup → SignupScreen
        ├── Onboarding → OnboardingScreen
        └── Home → Homepage (placeholder)
```

### Planned (Stack + Bottom Tabs)

```
App.tsx
└── NavigationContainer
    └── Stack.Navigator (initialRoute: 'Splash', headerShown: false)
        ├── Splash → SplashScreen
        ├── Login  → LoginScreen
        ├── Signup → SignupScreen
        ├── Onboarding → OnboardingScreen
        └── Main → MainTabs (bottom tab navigator)

navigation/MainTabs.tsx
└── Tab.Navigator
    ├── Home     → Homepage
    ├── Feed     → FeedScreen
    ├── Map      → MapScreen
    ├── Explore  → ExploreScreen
    └── Profile  → ProfileScreen
```

**Bottom tab order (confirmed):** Home → Feed → Map → Explore → Profile

**Package needed:** `@react-navigation/bottom-tabs` — already installed in package.json.

---

## 7. Homepage Layout Plan

Based on the Aftly MVP reference design, adapted to Narrows brand (black theme, gold accents).

```
┌─────────────────────────────────────┐
│  NARROWS           [Marina ▼]       │  ← Header row
├─────────────────────────────────────┤
│  ⚠ Low water levels near Narrows   │  ← Yellow alert banner
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ ⭐ Featured                   │  │
│  │ Blue Beacon Marina            │  │  ← Featured marina card
│  │ 🚤 Lake Couchiching          │  │
│  │ 📍 693 Atherley Rd, Orillia  │  │
│  │ 📞 705-325-2526              │  │
│  │ [Gas] [Pump-Out] [Hydro]     │  │
│  │ [Mechanic]                   │  │
│  │ [🧭 Get Directions]          │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ Live Conditions               │  │
│  │  12 km/h    18°C             │  │  ← 2x2 conditions grid
│  │  Wind       Water Temp       │  │
│  │  Rising     6:02 AM          │  │
│  │  Tide       Sunrise          │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ This Week at the Dock         │  │
│  │ [Mon] [Tue] [Wed] [Thu] [Fri]│  │  ← Horizontal scroll, daily cards
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         Bottom Tab Bar
    Home  Feed  Map  Explore  Profile
```

**Marina dropdown** at top right shows all marinas in Simcoe County area. Tapping a marina updates the featured card and conditions to that location.

---

## 8. Feed Screen Plan

- Filter tabs at top: **All / Trips / Catches / Check-ins** (active tab = gold pill)
- Activity cards showing:
  - User avatar (colored circle with initial)
  - Name, time ago, location
  - Activity type badge: **CHECK** / **TRIP** / **CATCH** (color-coded)
  - Activity description text
  - ⚓ Anchor button (like/save)
  - Photos if it's a catch post

---

## 9. Map Screen Plan

- Interactive map of Simcoe County waterways
- Pins for marinas, launch ramps, anchorages
- Tap a pin → show marina info card
- Community-reported hazards visible on map (shoals, low water, closures)
- Navigation layer (waterway routes)

---

## 10. Explore Screen Plan

Browse and discover — things you search, not things that are pushed to you:

- Browse all **marinas** in region (list with amenities, hours, contact)
- **Launch ramps** and public docks
- Community-submitted **fishing spots** and anchorages
- **Waterway guides** — routes and points of interest
- Local **events** — regattas, fishing tournaments, dock days
- **Hazard reports** — shoals, navigational warnings

---

## 11. Profile Screen Plan

Combines user profile + trip log (replaces separate "Log" tab):

- User stats: Trips this season, Distance, Time on Water, Catches
- "What are you logging?" — Trip / Catch / Check-in (post to feed)
- "How were the conditions?" — GREAT / MIXED / ROUGH
- "Post to Dock Feed" button
- User's past posts / trip history
- Settings / account management

---

## 12. Pending Development Tasks

### Immediate (next sessions)
- [ ] Fix `Homepage.tsx` — rename stub function from `SignupScreen` to `Homepage`
- [ ] Create `navigation/MainTabs.tsx` — bottom tab navigator with 5 placeholder screens
- [ ] Update `App.tsx` — add `Main` stack screen pointing to `MainTabs`
- [ ] Build `Homepage.tsx` — full card layout per Section 7
- [ ] Build `FeedScreen.tsx` — social feed per Section 8
- [ ] Build `MapScreen.tsx` — map placeholder (full map implementation later)
- [ ] Build `ExploreScreen.tsx` — marina browse list per Section 10
- [ ] Build `ProfileScreen.tsx` — stats + logging per Section 11

### Frontend Polish (after all screens are built)
- [ ] Light / dark theme toggle
- [ ] Custom tab bar icons (currently using text labels)
- [ ] Error screen / 404 state
- [ ] Loading states and skeleton screens
- [ ] Privacy policy checkbox on SignupScreen

### Backend / Auth (deferred — frontend first)
- [ ] Connect login to real auth (replace `console.log('Login pressed')`)
- [ ] Connect signup to real auth (replace `console.log('Signup pressed')`)
- [ ] Save onboarding answers to user profile
- [ ] Move `handlesBiometricLogin()` inside `LoginScreen` component
- [ ] Wire `isLoggedIn` and `hasCredentials` in `SplashScreen` to real session storage
- [ ] Apple Sign In integration
- [ ] Google Sign In integration
- [ ] Marina data API (live conditions, featured marina, weekly forecast)
- [ ] Feed data API (user posts, activity stream)

---

## 13. Key Technical Decisions Made

| Decision | Reasoning |
|---|---|
| Progressive onboarding (questions after signup) | Higher completion rates — industry standard pattern |
| Biometric auth in SplashScreen, not LoginScreen | Only triggers when user has an existing session and has logged out; not for first-time login |
| Transparent PNG logo (`narrows-logo-clear.png`) | Removed background using Preview's Instant Alpha tool so logo blends into black background |
| `SafeAreaView → KeyboardAvoidingView → ScrollView` pattern | Handles iPhone notch, keyboard overlap, and content overflow on all input screens |
| Black background (`#000000`) not navy | Pure black avoids logo box artifact visible with navy background |
| Semantic color naming (`Colors.background`) | Easier to update theme globally without hunting hex codes |
| `@react-navigation/bottom-tabs` already installed | Can proceed directly to `MainTabs.tsx` without another install step |

---

## 14. Known Issues

| File | Issue | Fix |
|---|---|---|
| `OnboardingScreen.tsx:22` | Possible stray `2` character in `handleNext` closing brace | Delete the `2` character |
| `Homepage.tsx:4` | Component function is still named `SignupScreen` (old placeholder) | Rename to `Homepage` |
| `LoginScreen.tsx:138` | `handlesBiometricLogin` is defined outside the component | Move inside the `LoginScreen` function before backend wiring |
