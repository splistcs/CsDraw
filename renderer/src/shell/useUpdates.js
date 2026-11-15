import { useEffect, useState } from 'react';
import { api } from '../shared/api/api.js';

export function useUpdates() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    api.updates.state().then((current) => alive && setState((previous) => previous ?? current)).catch(() => {});
    const off = api.updates.onState(setState);
    return () => { alive = false; off(); };
  }, []);
  return state;
}
