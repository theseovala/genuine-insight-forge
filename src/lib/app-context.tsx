import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocations, useBrandSettings } from "./seovale-db";
import { BRAND } from "./domain";

export const ALL_LOCATIONS = "All locations";

interface AppState {
  /** Selected location name, or "All locations". */
  location: string;
  setLocation: (name: string) => void;
  locationNames: string[];
  brandName: string;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<string>(ALL_LOCATIONS);
  const { data: locations } = useLocations();
  const { data: brand } = useBrandSettings();

  const value = useMemo<AppState>(
    () => ({
      location,
      setLocation,
      locationNames: [ALL_LOCATIONS, ...(locations ?? []).map((l) => l.name)],
      brandName: brand?.brand_name ?? BRAND.name,
    }),
    [location, locations, brand],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
