import { useState } from 'react';

export function GrenadeIcon({ grenade }) {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed) return <span className="grenade-emoji">{grenade.emoji}</span>;
  return <img src={grenade.imageUrl} alt="" draggable={false} onError={() => setHasFailed(true)} />;
}
