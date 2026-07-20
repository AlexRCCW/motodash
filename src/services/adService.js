import { Platform } from 'react-native';
import { isNoAdsActive } from './subscriptionService';
import {
  InterstitialAd,
  RewardedAd,
  RewardedInterstitialAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const IOS_IDS = {
  interstitial:         'ca-app-pub-5477937042308573/5922906900',
  rewarded:             'ca-app-pub-5477937042308573/8165926865',
  rewardedInterstitial: 'ca-app-pub-5477937042308573/3895509360',
};
const ANDROID_IDS = {
  interstitial:         'ca-app-pub-5477937042308573/1635609316',
  rewarded:             'ca-app-pub-5477937042308573/4153961444',
  rewardedInterstitial: 'ca-app-pub-5477937042308573/2913600184',
};

const AD_LOAD_TIMEOUT_MS = 8000;

function unitId(type) {
  if (__DEV__) {
    if (type === 'interstitial')         return TestIds.INTERSTITIAL;
    if (type === 'rewarded')             return TestIds.REWARDED;
    if (type === 'rewardedInterstitial') return TestIds.REWARDED_INTERSTITIAL;
  }
  return (Platform.OS === 'ios' ? IOS_IDS : ANDROID_IDS)[type];
}

function testId(type) {
  if (type === 'interstitial')         return TestIds.INTERSTITIAL;
  if (type === 'rewarded')             return TestIds.REWARDED;
  if (type === 'rewardedInterstitial') return TestIds.REWARDED_INTERSTITIAL;
}

// Tries to load an interstitial ad. Falls back to test ad if real one times out.
// Resolves when ad closes, or if fallback also fails — never hangs.
export async function showInterstitial() {
  if (await isNoAdsActive()) return;
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };

    function loadAd(id, isFallback) {
      const ad = InterstitialAd.createForAdRequest(id);
      const timer = setTimeout(() => {
        if (isFallback) { done(); } else { loadAd(testId('interstitial'), true); }
      }, AD_LOAD_TIMEOUT_MS);
      ad.addAdEventListener(AdEventType.ERROR, () => {
        clearTimeout(timer);
        if (isFallback) { done(); } else { loadAd(testId('interstitial'), true); }
      });
      ad.addAdEventListener(AdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.addAdEventListener(AdEventType.CLOSED, done);
        ad.show();
      });
      ad.load();
    }

    loadAd(unitId('interstitial'), false);
  });
}

// Rewarded video — falls back to test ad if real one times out.
export async function showRewarded() {
  if (await isNoAdsActive()) return;
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };

    function loadAd(id, isFallback) {
      const ad = RewardedAd.createForAdRequest(id);
      const timer = setTimeout(() => {
        if (isFallback) { done(); } else { loadAd(testId('rewarded'), true); }
      }, AD_LOAD_TIMEOUT_MS);
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.addAdEventListener(AdEventType.CLOSED, done);
        ad.show();
      });
      ad.load();
    }

    loadAd(unitId('rewarded'), false);
  });
}

// Playable (rewarded interstitial) — falls back to test ad if real one times out.
export async function showPlayable() {
  if (await isNoAdsActive()) return;
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };

    function loadAd(id, isFallback) {
      const ad = RewardedInterstitialAd.createForAdRequest(id);
      const timer = setTimeout(() => {
        if (isFallback) { done(); } else { loadAd(testId('rewardedInterstitial'), true); }
      }, AD_LOAD_TIMEOUT_MS);
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.addAdEventListener(AdEventType.CLOSED, done);
        ad.show();
      });
      ad.load();
    }

    loadAd(unitId('rewardedInterstitial'), false);
  });
}
