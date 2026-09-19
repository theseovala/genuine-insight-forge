import { createContext, useContext, useState, type ReactNode } from "react";
import { roles, locations, type Role, type Location } from "./mock-data";

interface AppState {
  role: Role;
  setRole: (id: string) => void;
  location: Location;
  setLocation: (id: string) => void;
  can: (routeId: string) => boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(roles[1]!);
  const [location, setLocationState] = useState<Location>(locations[0]!);
  const value: AppState = {
    role,
    setRole: (id) => setRoleState(roles.find((r) => r.id === id) ?? roles[1]!),
    location,
    setLocation: (id) => setLocationState(locations.find((l) => l.id === id) ?? locations[0]!),
    can: (routeId) => role.nav.includes("all") || role.nav.includes(routeId),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
