import { Platform } from 'react-native';

const RC_API_KEY_IOS     = 'appl_ZDEmDBEznvlBzqAyaTEcadLpKUL';
const RC_API_KEY_ANDROID = 'goog_XovABtwJjEaonOhdgbMVBfGytNT';
const ENTITLEMENT_ID = 'no_ads';

// Safe loader — returns null if the native module isn't compiled into this build yet
function getPurchases() {
  try {
    return require('react-native-purchases').default;
  } catch {
    return null;
  }
}

export function configureRevenueCat() {
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    const { LOG_LEVEL } = require('react-native-purchases');
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    const apiKey = Platform.OS === 'android' ? RC_API_KEY_ANDROID : RC_API_KEY_IOS;
    Purchases.configure({ apiKey });
  } catch {}
}

export async function isNoAdsActive() {
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    const { entitlements } = await Purchases.getCustomerInfo();
    return entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export async function getNoAdsPackage() {
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.monthly ?? null;
  } catch {
    return null;
  }
}

export async function purchaseNoAds() {
  const Purchases = getPurchases();
  if (!Purchases) return { success: false, error: 'Subscription not available in this version.' };
  try {
    const pkg = await getNoAdsPackage();
    if (!pkg) return { success: false, error: 'Product unavailable. Please try again later.' };
    await Purchases.purchasePackage(pkg);
    return { success: true };
  } catch (e) {
    if (e?.userCancelled) return { success: false, error: null };
    return { success: false, error: e?.message ?? 'Purchase failed. Please try again.' };
  }
}

export async function restorePurchases() {
  const Purchases = getPurchases();
  if (!Purchases) return { success: false, error: 'Subscription not available in this version.' };
  try {
    const info = await Purchases.restorePurchases();
    const active = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return { success: true, active };
  } catch (e) {
    return { success: false, error: e?.message ?? 'Restore failed. Please try again.' };
  }
}
