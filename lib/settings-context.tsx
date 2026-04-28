'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface AppSettings {
  appName: string;
  logoUrl?: string;
  loginLogoUrl?: string;
  loginWelcomeTitle: string;
  loginWelcomeSubtitle: string;
}

interface SettingsContextType {
  settings: AppSettings;
  loading: boolean;
}

const defaultSettings: AppSettings = {
  appName: 'MarmoControl',
  loginWelcomeTitle: 'Entre na sua conta',
  loginWelcomeSubtitle: 'Sistema de gestão inteligente para marmorarias.',
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We use a single document 'global' for all app settings
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ ...defaultSettings, ...docSnap.data() } as AppSettings);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching settings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}
