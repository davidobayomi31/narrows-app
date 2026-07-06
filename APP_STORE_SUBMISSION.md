# Narrows — App Store Submission Checklist

Everything you need for the first iOS submission. Copy/paste sections marked **PASTE**.

---

## 1. App Review Notes  → **PASTE** into App Store Connect → your build → "Notes for Reviewer"

```
Narrows is a community app for recreational boaters and anglers.

TEST ACCOUNT
Email: <create a throwaway account and put it here>
Password: <...>
(Or the reviewer can sign up with Apple/Google — signup is free and instant.)

BACKGROUND LOCATION
Location "Always" is used ONLY during an active, user-initiated trip. The user
taps "Start Trip" on the Map tab; the app then totals distance and time on the
water, continuing if the phone is locked or the app is backgrounded, and STOPS
the moment the user taps "End Trip." A persistent location indicator is shown
the entire time. Location is never collected outside an active trip.

USER-GENERATED CONTENT MODERATION
- Every uploaded photo is automatically screened for nudity/graphic content
  before it can post (rejected if it fails).
- Every post has a report control (••• menu) and every comment can be reported
  via long-press.
- Users can block other users; blocked users' content is hidden both ways.
- Account deletion is available in Settings and removes all user data.
- Terms of Use (Apple Standard EULA) + Community Guidelines are shown at signup.

HOW TO TEST TRIP TRACKING
Map tab → "Start Trip" → grant location → (optionally lock the phone) →
"End Trip" → the tracked distance/time pre-fills a post.
```

---

## 2. App Privacy label  → **App Store Connect → App Privacy → "Get Started"**

Declare these data types as **Collected**:

| Data Type | Linked to user? | Used for | Notes |
|---|---|---|---|
| **Precise Location** | Yes | App Functionality | ✅ check "used even when the app is not in use" (trip tracking) |
| **Photos or Videos** | Yes | App Functionality | user posts |
| **Email Address** | Yes | App Functionality | account |
| **Name** | Yes | App Functionality | profile |
| **User ID** | Yes | App Functionality | account |
| **Device ID / Push Token** | Yes | App Functionality | notifications |

None used for Tracking. None used for Third-Party Advertising.

---

## 3. The production build + submit sequence (run in YOUR terminal)

These need interactive Apple login, so they can't be automated:

```bash
# 1. Create the App Store distribution build (answer YES to credential prompts;
#    log in with your Apple ID / Team YK5Q9B4A38 when asked)
eas build --profile production --platform ios

# 2. FIRST TIME ONLY: create the app record in App Store Connect
#    appstoreconnect.apple.com → Apps → (+) → New App
#    Platform: iOS | Name: Narrows | Bundle ID: site.narrows.app | SKU: narrows-app

# 3. Upload the build to App Store Connect
eas submit --profile production --platform ios
#    (choose the build you just made; log in with Apple ID when prompted)
```

Then in App Store Connect: add screenshots, description, the review notes above,
fill the App Privacy label, attach the build, and hit "Submit for Review."

---

## 4. Must-verify BEFORE you submit (only you can do these)

- [ ] **A normal photo actually posts** on the production build (confirms the
      moderation function + Google Vision key work). If it says "Could not check
      photo," the `GOOGLE_VISION_API_KEY` secret isn't set — see step 5.
- [ ] Trip tracking works locked/backgrounded on a real device.
- [ ] Report / block / delete-account all work on the production build.

## 5. Confirm the Google Vision secret is set (only you can do this)

```bash
supabase login                      # opens browser, your account
supabase link --project-ref pddfyikqpuuuzgqhwjgu
supabase secrets list               # look for GOOGLE_VISION_API_KEY
# if missing:
supabase secrets set GOOGLE_VISION_API_KEY=<your-key>
```
Also enable "Cloud Vision API" in Google Cloud Console for that key's project.
