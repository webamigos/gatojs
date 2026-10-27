"use client";

import { createContext, useContext, useMemo } from "react";

export interface ServiceModeState {
  active: boolean;
  organizationId: string;
  organizationName: string;
}

const INACTIVE_SERVICE_MODE: ServiceModeState = {
  active: false,
  organizationId: "",
  organizationName: "",
};

const ServiceModeContext = createContext<ServiceModeState>(
  INACTIVE_SERVICE_MODE,
);

interface ServiceModeProviderProps extends ServiceModeState {
  children: React.ReactNode;
}

export function ServiceModeProvider({
  active,
  organizationId,
  organizationName,
  children,
}: ServiceModeProviderProps) {
  const value = useMemo(
    () => ({ active, organizationId, organizationName }),
    [active, organizationId, organizationName],
  );
  return (
    <ServiceModeContext.Provider value={value}>
      {children}
    </ServiceModeContext.Provider>
  );
}

export function useServiceMode(): ServiceModeState {
  return useContext(ServiceModeContext);
}
