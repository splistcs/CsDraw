import { useEffect, useRef, useState } from 'react';

/** Estado do playback para componentes de React, atualizado no maximo `hz` vezes por segundo. */
export function usePlaybackSnapshot(playback, hz = 12) {
  const [snapshot, setSnapshot] = useState(() => playback.snapshot());
  const lastRef = useRef({ stamp: 0, snapshot });

  useEffect(() => {
    setSnapshot(playback.snapshot());
    return playback.subscribe(() => {
      const next = playback.snapshot();
      const prev = lastRef.current.snapshot;
      const structural = prev.playing !== next.playing || prev.speed !== next.speed || prev.duration !== next.duration;
      const now = performance.now();
      if (!structural && now - lastRef.current.stamp < 1000 / hz) return;
      lastRef.current = { stamp: now, snapshot: next };
      setSnapshot(next);
    });
  }, [playback, hz]);

  return snapshot;
}
