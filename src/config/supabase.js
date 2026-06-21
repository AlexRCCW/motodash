import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL     ?? 'https://vmkhkrbohgyneyptfdpq.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZta2hrcmJvaGd5bmV5cHRmZHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzg3MDAsImV4cCI6MjA5NTgxNDcwMH0.MuMXGSZQ4kGskTNmlKlMMNepNDe12gZz7QvgIQUWlo8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
