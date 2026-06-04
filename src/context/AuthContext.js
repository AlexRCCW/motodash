import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [account, setAccount] = useState(null); // accounts table row
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount — restore session if one exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchAccount(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          fetchAccount(session.user.id);
        } else {
          setUser(null);
          setAccount(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchAccount(userId) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setAccount(data);
    }
    setLoading(false);
  }

  // Called after login to refresh account state
  async function refreshAccount() {
    if (user) await fetchAccount(user.id);
  }

  return (
    <AuthContext.Provider value={{ user, account, loading, refreshAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
