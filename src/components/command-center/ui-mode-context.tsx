"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type UIMode = "business" | "technology";

type UIModeContextValue = {
  mode: UIMode;
  setMode: (mode: UIMode) => void;
};

const UIModeContext = createContext<UIModeContextValue | undefined>(undefined);

type UIModeProviderProps = {
  children: ReactNode;
  initialMode?: UIMode;
};

export function UIModeProvider({ children, initialMode = "technology" }: UIModeProviderProps) {
  const [mode, setMode] = useState<UIMode>(initialMode);

  const value = useMemo(() => ({ mode, setMode }), [mode]);

  return <UIModeContext.Provider value={value}>{children}</UIModeContext.Provider>;
}

export function useUIMode() {
  const context = useContext(UIModeContext);

  if (!context) {
    throw new Error("useUIMode must be used within a UIModeProvider");
  }

  return context;
}
