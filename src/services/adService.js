import { Platform } from 'react-native';
import {
  InterstitialAd,
  RewardedAd,
  RewardedInterstitialAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// ─── TODO: Replace with real Ad Unit IDs from AdMob console before release ───
const IOS_IDS = {
  interstitial:         'ca-app-pub-REPLACE_IOS_APP_ID/REPLACE_INTERSTITIAL_UNIT',
  rewarded:             'ca-app-pub-REPLACE_IOS_APP_ID/REPLACE_REWARDED_UNIT',
  rewardedInterstitial: 'ca-app-pub-REPLACE_IOS_APP_ID/REPLACE_REWARDED_INTERSTITIAL_UNIT',
};
const ANDROID_IDS = {
  interstitial:         'ca-app-pub-REPLACE_ANDROID_APP_ID/REPLACE_INTERSTITIAL_UNIT',
  rewarded:             'ca-app-pub-REPLACE_ANDROID_APP_ID/REPLACE_REWARDED_UNIT',
  rewardedInterstitial: 'ca-app-pub-REPLACE_ANDROID_APP_ID/REPLACE_REWARDED_INTERSTITIAL_UNIT',
};

function unitId(type) {
  if (__DEV__) {
    if (type === 'interstitial')         return TestIds.INTERSTITIAL;
    if (type === 'rewarded')             return TestIds.REWARDED;
    if (type === 'rewardedInterstitial') return TestIds.REWARDED_INTERSTITIAL;
  }
  return (Platform.OS === 'ios' ? IOS_IDS : ANDROID_IDS)[type];
}

// Resolves when the ad closes (or immediately if it fails to load).
// Never rejects — app flow must always continue.
export function showInterstitial() {
  return new Promise((resolve) => {
    const ad = InterstitialAd.createForAdRequest(unitId('interstitial'));
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      unsubError();
      resolve();
    });
    const unsubLoad = ad.addAdEventListener(AdEventType.LOADED, () => {
      unsubLoad();
      const unsubClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
        unsubClose();
        resolve();
      });
      ad.show();
    });
    ad.load();
  });
}

// Rewarded video — resolves on close regardless of whether reward was earned.
export function showRewarded() {
  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(unitId('rewarded'));
    const unsubLoad = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      unsubLoad();
      const unsubClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
        unsubClose();
        resolve();
      });
      ad.show();
    });
    ad.load();
  });
}

// Playable (rewarded interstitial) — used for driver mark-ready.
export function showPlayable() {
  return new Promise((resolve) => {
    const ad = RewardedInterstitialAd.createForAdRequest(unitId('rewardedInterstitial'));
    const unsubLoad = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      unsubLoad();
      const unsubClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
        unsubClose();
        resolve();
      });
      ad.show();
    });
    ad.load();
  });
}
