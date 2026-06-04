# MotoDash — Project Brief & Decision Log

## Overview
A ride-sharing and grocery delivery app for the Dominican Republic. Drivers use motorcycles. Three user-facing account types (Driver, Client, Store) in a single mobile app, plus an admin web portal. Revenue model is ads-only — no payment processing in-app.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native (Expo SDK 55) |
| Admin portal | Vite + React |
| Backend / Database | Supabase (Postgres) |
| Push notifications | Firebase Cloud Messaging (FCM) — free |
| Language | JavaScript throughout |

---

## Repository Structure
```
motodash/          ← React Native mobile app (this repo)
```
Admin portal and backend Edge Functions to be added as separate repos or monorepo folders.

---

## Account Types

| Type | Description | Ads shown |
|---|---|---|
| Driver | Provides rides and deliveries | Yes |
| Client | Requests rides and places orders | Yes |
| Store | Manages inventory and orders | No |
| Admin | Web-only portal for user management | N/A |

---

## Job Types

### Ride job
Client requests a pickup. Driver accepts, navigates to client, marks complete.

**Key fields:** client_id, client_lat/lng, client_notes, driver_id, driver_lat/lng (snapshotted at accept), initial_distance_km, status, client_complete, driver_complete

### Delivery job
Client orders from a store. Store prepares. Driver picks up and delivers. Driver returns to store with cash payment.

**Key fields:** all ride fields + store_id, store_lat/lng (snapshotted), items (jsonb), order_total, order_notes, store_paid

**Delivery statuses:** pending → accepted → out_for_delivery → delivered → canceled / returned

---

## Radius & Geofence Rules

All stored in `app_config` table — never hardcoded.

| Context | Radius | Applied |
|---|---|---|
| Ride dispatch | 2 km from client | Server-side Haversine at query time |
| Delivery general pool | 1 km from store | Server-side Haversine at query time |
| Store visibility for clients | 3 km from client | Server-side Haversine at query time |
| Completion geofence | 6.1 m (20 ft) | On-device, no network call |
| Preferred drivers | No radius restriction | Bypass — trusted relationship |

Future: all radii expandable for rural areas via `app_config` values.

---

## Location Strategy
- All locations stored as lat/lng decimal pairs
- Driver location written **once** when driver taps "mark ready" — never polled live
- Store location written **once** at registration via device GPS
- Job lat/lng snapshotted at creation/accept — never updated live
- On-device Haversine for geofence check (every 3–5 seconds locally, no network call)

---

## Driver Assignment Flow

1. Order marked ready → query `preferred_drivers` table (store's trusted list)
2. If preferred drivers available and ready → store sees list, taps to assign manually
3. If list empty → store sees "Post to general pool" button (explicit action)
4. General pool → FCM notification to active drivers within 1 km, first to accept wins (15-sec timer)
5. If no drivers → notify store to retry later

**`preferred_drivers` table:** store_id, driver_id, created_at — no radius restriction.

---

## Ad Strategy

| Placement | Ad type | Account |
|---|---|---|
| Driver taps "mark ready" | Playable (highest CPM) | Driver |
| After each job complete | Video interstitial | Driver |
| Weekly 2× boost opt-in | Rewarded video | Driver |
| While waiting for driver (once per session) | Video interstitial | Client |
| Client marks job complete | Video interstitial | Client |
| Any store action | None | Store |

**Ad enforcement:** ad must complete before API call fires. Ad fires → ad completes → API call → local storage update. Never skippable.

---

## Weekly 2× Distance Boost

- Available once per Mon–Sun week per driver
- Button on DriverStatsScreen — grayed out if used, shows days until Monday reset
- Driver watches rewarded video ad → server sets `distance_multiplier = 2.0` for that calendar day
- Applies to gamification distance milestones only — no earnings metric
- Resets to 1× at midnight of activation day
- Server resets `rewarded_used_week = false` every Monday
- FCM reminder sent Saturday OR Sunday to drivers who haven't used it

---

## Driver Stats & Gamification

Stats updated server-side via `update_driver_stats(driver_id, job_type, distance_km)` — called after every job complete API call. Client cannot trigger or skip it.

| Stat | How tracked |
|---|---|
| total_rides | Incremented on ride complete |
| total_deliveries | Incremented on delivery complete |
| distance_km | Job distance × multiplier added on complete |
| days_worked | Once per calendar day when driver taps "mark ready" |

**`days_worked` logic:** compare `last_worked_date` to today. Different date → increment + update. Same date → skip.

### Milestone awards (stored in `driver_awards` table)

| Key | Threshold |
|---|---|
| rides_1 / rides_10 / rides_100 / rides_1000 | Ride count |
| deliveries_1 / deliveries_10 / deliveries_100 / deliveries_1000 | Delivery count |
| distance_dr_ns | 280 km (DR north–south) |
| distance_dr_ew | 390 km (DR east–west) |
| distance_dr_miami | 1,700 km |
| distance_dr_nyc | 2,600 km |
| distance_moon | 384,400 km |

Distance tracked and displayed in **kilometers** throughout the app.

---

## Account Status

| Status | Behavior |
|---|---|
| active | Normal app access |
| hold | All options grayed out, hold reason shown, sign out available |
| blocked | Only blocked screen shown — no other UI |

Device ID stored with every account. Checked against `blocked_devices` table before registration. Fast lookup via index.

---

## Notifications (FCM — free)

All notifications via Firebase Cloud Messaging. No per-message cost.

| Notification | Recipient |
|---|---|
| Ride offer (15-sec timer, job_id in payload) | Driver |
| Delivery offer (15-sec timer) | Driver |
| Job assigned by store (preferred) | Driver |
| Account hold / blocked | Driver, Client, Store |
| Milestone / award unlock | Driver |
| Weekly 2× boost reminder (Sat or Sun) | Driver (if boost unused) |
| Ride accepted | Client |
| Order accepted / out for delivery / driver arrived | Client |
| New order / driver accepted / picked up / delivered | Store |

---

## Multilingual Support

Languages: English (en), Spanish (es), French (fr)

- Device language auto-detected on launch via `expo-localization`
- Falls back to English if unsupported language
- All UI strings in `src/i18n/en.js`, `es.js`, `fr.js`
- Import pattern: `import { t } from '../../i18n'` then `t('auth.signIn')`
- Runtime switching: `setLocale('es')` from settings screen
- Library: `i18n-js` + `expo-localization`

---

## Open Job Flag (local storage)

Prevents clients and drivers from skipping ads by force-closing the app.

On job accept/create:
```
AsyncStorage: open_job = 'true', open_job_type = 'ride'|'delivery', open_job_id = uuid
```

On app launch, ClientHomeScreen and DriverHomeScreen check this flag and restore the active job screen if found.

Cleared only after server confirms job complete.

---

## Native Patches Required

These patches are saved via `patch-package` and auto-applied on `npm install`:

| File | Fix |
|---|---|
| `expo-modules-core` SwiftUIHostingView.swift | Remove `@MainActor` retroactive conformance (Swift 5 language mode incompatibility) |
| `expo-modules-core` SwiftUIVirtualView.swift | Same fix |
| `expo-modules-core` ViewDefinition.swift | Same fix |
| `expo-notifications` DateComponentsSerializer.swift | Remove iOS 26 `isRepeatedDay` API reference not in SDK |

Root cause: Expo SDK 55 + Xcode 16.4 (Swift 6.1) — Swift 5 language mode used by ExpoModulesCore podspec rejects some Swift 5.5+ actor isolation syntax.

Podfile post_install additions required:
```ruby
installer.pods_project.targets.each do |target|
  target.build_configurations.each do |config|
    config.build_settings['SWIFT_VERSION'] = '5.9'
    config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
    config.build_settings['OTHER_SWIFT_FLAGS'] = '$(inherited) -strict-concurrency=minimal'
  end
end
```

---

## Database Tables

| Table | Purpose |
|---|---|
| app_config | Configurable values (radii, timeouts) |
| blocked_devices | Device IDs banned from registration |
| accounts | One row per user (extends Supabase auth.users) |
| driver_profiles | Driver fields + last known location |
| driver_stats | Ride/delivery counts, distance, days worked, rewarded ad state |
| driver_awards | One row per milestone unlocked |
| client_profiles | Client-specific fields |
| store_profiles | Store name, location, hours, tier |
| store_items | Inventory with count and availability |
| preferred_drivers | Store's trusted driver list |
| ride_jobs | All ride requests |
| delivery_jobs | All delivery orders with items (jsonb) |

---

## Store Tiers
- Free tier: item cap (50 items default, stored in `app_config`)
- Paid tier: higher/no cap
- No ads shown to store accounts

---

## What's Built

### Mobile app (React Native / Expo SDK 55)
- ✅ Supabase auth (email + password)
- ✅ Registration — all 3 account types, device ID capture, GPS for store
- ✅ Account status routing (active / hold / blocked)
- ✅ AppNavigator — routes by account type post-login
- ✅ Open job check on login (anti-ad-skip)
- ✅ All client screens (home, ride, stores, inventory, order)
- ✅ All driver screens (home, ride, delivery, stats + awards)
- ✅ Store screens (placeholder — to be built)
- ✅ Instructions screen (tabbed, all 3 account types)
- ✅ i18n (EN / ES / FR, device auto-detect)
- ✅ Location service (GPS, Haversine geofence)
- ✅ Job service (ride + delivery CRUD)
- ✅ Notification service (FCM token + listeners)
- ✅ Supabase schema (all tables, RLS, Haversine function, stats trigger)

### What's next
- [ ] Store screens (home, order detail, inventory management)
- [ ] Apply i18n t() to all screens (currently only LoginScreen done)
- [ ] Admin portal (Vite + React)
- [ ] Supabase Edge Functions (stats trigger, FCM dispatch, weekly reset)
- [ ] Ad SDK integration (replace placeholder modals)
- [ ] App icons and splash screen
- [ ] Android testing
- [ ] App Store / Play Store submission

---

## app_config Values

| Key | Value | Description |
|---|---|---|
| ride_dispatch_radius_km | 2 | Radius to find drivers for rides |
| delivery_dispatch_radius_km | 1 | Radius to find drivers for deliveries |
| store_visibility_radius_km | 3 | Radius to show stores to clients |
| ride_offer_timeout_seconds | 15 | Seconds to accept a ride offer |
| delivery_offer_timeout_seconds | 15 | Seconds to accept a delivery offer |
| driver_refusal_limit | 3 | Refusals before driver marked not ready |
| completion_geofence_meters | 6.1 | Meters to unlock complete button |

