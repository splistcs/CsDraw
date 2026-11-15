import { createContext, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const ShellContext = createContext(null);

export function ShellProvider({ children }) {
  const [headerSlot, setHeaderSlot] = useState(null);
  const value = useMemo(() => ({ headerSlot, setHeaderSlot }), [headerSlot]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function HeaderSlot() {
  const { setHeaderSlot } = useContext(ShellContext);
  return <div className="header-center" ref={setHeaderSlot} />;
}

export function HeaderPortal({ active, children }) {
  const { headerSlot } = useContext(ShellContext);
  return active && headerSlot ? createPortal(children, headerSlot) : null;
}
