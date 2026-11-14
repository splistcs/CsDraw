import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NavigationContext = createContext(null);

/** Navegacao entre abas: um modulo pede "abra a aba X com estes parametros" sem conhecer os outros. */
export function NavigationProvider({ initialTab, children }) {
  const [state, setState] = useState({ activeTab: initialTab, params: null, nonce: 0 });
  const navigate = useCallback((tab, params = null) => setState((s) => ({ activeTab: tab, params, nonce: s.nonce + 1 })), []);
  const value = useMemo(() => ({ ...state, navigate }), [state, navigate]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export const useNavigation = () => useContext(NavigationContext);
