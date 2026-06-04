import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
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

  const token = (await Notifications.getExpoPushTokenAsync()).data;

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
    const data = notification.request.content.data;
    if (data?.type === 'ride_offer' || data?.type === 'delivery_offer') {
      onJobOffer && onJobOffer(data);
    } else {
      onNotification && onNotification(notification);
    }
  });

  // Notification tapped (app in background)
  const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (data?.type === 'ride_offer' || data?.type === 'delivery_offer') {
      onJobOffer && onJobOffer(data);
    }
  });

  // Return cleanup function
  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}
