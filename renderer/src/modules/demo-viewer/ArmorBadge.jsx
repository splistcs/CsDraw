const SHIELD = 'M12 2.5l8.5 3.2v6.1c0 5.2-3.6 8.6-8.5 9.7-4.9-1.1-8.5-4.5-8.5-9.7V5.7z';
const HELMET = 'M5.5 15.5v-3.2a6.5 6.5 0 0 1 13 0v3.2l-2.4 3.2H7.9zM8.6 12.2h6.8v2.9H8.6z';

export function ArmorBadge({ armor, helmet, title, size = 16 }) {
  const vest = armor > 0;
  if (!vest && !helmet) return null;
  return (
    <svg className={`armor-badge${vest && helmet ? ' armor-both' : vest ? ' armor-vest' : ' armor-helmet'}`} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title}>
      <title>{title}</title>
      {vest && <path d={SHIELD} fill="currentColor" />}
      {helmet && (vest
        ? <path d={HELMET} transform="translate(12 12.4) scale(0.62) translate(-12 -12)" fill="#0a0e11" fillRule="evenodd" />
        : <path d={HELMET} fill="currentColor" fillRule="evenodd" />)}
    </svg>
  );
}
