import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// Job offer notifications are handled entirely in-app — suppress the banner
// so the driver sees the offer card without an OS alert on top.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    try {
      const type = notification?.request?.content?.data?.type;
      const isJobOffer = type === 'ride_offer' || type === 'delivery_offer';
      console.log('[notif] handleNotification type:', type);
      return {
        shouldShowBanner: !isJobOffer,
        shouldShowList:   !isJobOffer,
        shouldPlaySound:  true,
        shouldSetBadge:   false,
      };
    } catch (e) {
      console.error('[notif] handleNotification error:', e);
      return {
        shouldShowBanner: true,
        shouldShowList:   true,
        shouldPlaySound:  true,
        shouldSetBadge:   false,
      };
    }
  },
});

/**
 * Request notification permissions and register FCM token.
 * Saves token to accounts table for this user.
 */
export async function registerForPushNotifications(userId) {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission denied');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  let token;
  try {
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: 'ae6c312e-ba95-4cac-90ed-c489abd57454',
    })).data;
  } catch (e) {
    console.warn('[notif] getExpoPushTokenAsync failed:', e);
    return null;
  }

  // Save token to Supabase
  if (userId && token) {
    await supabase
      .from('accounts')
      .update({ fcm_token: token })
      .eq('id', userId);
  }

  return token;
}

/**
 * Set up notification listeners.
 * onJobOffer: called when a ride/delivery offer arrives with a 15-sec timer
 * onNotification: called for all other notifications
 */
export function setupNotificationListeners({ onJobOffer, onNotification }) {
  // Notification received while app is in foreground
  const foregroundSub = Notifications.addNotificationReceivedListener(notification => {
    try {
      const data = notification?.request?.content?.data;
      console.log('[notif] foreground received:', JSON.stringify(data));
      if (data?.type === 'ride_offer' || data?.type === 'delivery_offer') {
        onJobOffer && onJobOffer(data);
      } else {
        onNotification && onNotification(notification);
      }
    } catch (e) {
      console.error('[notif] foregroundSub error:', e);
    }
  });

  // Notification tapped (app in background)
  const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
    try {
      const data = response?.notification?.request?.content?.data;
      console.log('[notif] response tap received:', JSON.stringify(data));
      if (data?.type === 'ride_offer' || data?.type === 'delivery_offer') {
        onJobOffer && onJobOffer(data);
      }
    } catch (e) {
      console.error('[notif] responseSub error:', e);
    }
  });

  // Return cleanup function
  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}

/**
 * Check if the app was opened by tapping a job offer notification (cold launch).
 * Call this once on DriverHomeScreen mount after listeners are set up.
 */
export async function consumePendingJobOffer() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    const data = response.notification.request.content.data;
    if (data?.type === 'ride_offer' || data?.type === 'delivery_offer') {
      return data;
    }
    return null;
  } catch (e) {
    console.warn('[notif] consumePendingJobOffer error:', e);
    return null;
  }
}
