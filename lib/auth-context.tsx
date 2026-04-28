'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDocFromServer, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  photoURL?: string;
  phone?: string;
  birthDate?: string;
  function?: string;
  address?: string;
  addressNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  permissions?: Record<string, boolean>;
  lastOnline?: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isAuthorized: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isAuthorized: false,
  hasPermission: () => false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
      }
    });

    // Validate connection to Firestore
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error?.message?.includes('offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setProfile(doc.data() as UserProfile);
      }
      setLoading(false);
    }, (error) => {
      console.error("Profile onSnapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribeProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Initial check-in
    updateDoc(doc(db, 'users', user.uid), {
      lastOnline: serverTimestamp()
    }).catch(e => console.error("Heartbeat error:", e));

    // Periodic heartbeat
    const interval = setInterval(() => {
      updateDoc(doc(db, 'users', user.uid), {
        lastOnline: serverTimestamp()
      }).catch(e => console.error("Heartbeat interval error:", e));
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [user]);

  const isAdmin = profile?.role === 'admin';

  const isAuthorized = isAdmin || (profile?.permissions !== undefined && profile?.permissions !== null && Object.values(profile.permissions).some(v => v === true));

  const hasPermission = (permission: string) => {
    if (isAdmin) return true;
    return profile?.permissions?.[permission] === true;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isAuthorized, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
