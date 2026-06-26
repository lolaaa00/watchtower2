"use client";

import { createContext, useContext, useState, useSyncExternalStore, useCallback, type ReactNode } from "react";

interface ActiveProfileState {
  profileId: string | null;
  setProfileId: (id: string | null) => void;
}

const ActiveProfileContext = createContext<ActiveProfileState>({
  profileId: null,
  setProfileId: () => {},
});

const STORAGE_KEY = "watchtower_active_profile";

function getStoredProfile(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const storedId = useSyncExternalStore(subscribe, getStoredProfile, () => null);
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const profileId = overrideId ?? storedId;

  const setProfileId = useCallback((id: string | null) => {
    setOverrideId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ActiveProfileContext.Provider value={{ profileId, setProfileId }}>
      {children}
    </ActiveProfileContext.Provider>
  );
}

export function useActiveProfile() {
  return useContext(ActiveProfileContext);
}
