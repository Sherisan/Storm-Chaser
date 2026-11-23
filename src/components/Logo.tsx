/** The wordmark: a funnel dropping out of a cloud base, and STORM CHASER. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <svg viewBox="0 0 48 48" width={size * 1.35} height={size * 1.35} aria-hidden>
        <defs>
          <linearGradient id="logo-funnel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e8ece6" />
            <stop offset="1" stopColor="#ffc53a" />
          </linearGradient>
        </defs>
        <path d="M5 9 Q10 3 17 6 Q24 1 31 5 Q39 3 43 9 Z" fill="#c9d1cc" />
        <path d="M8 11h32l-3 4.5H11z M12 18h23l-2.6 4.2H15z M16 25h15l-2.2 4H18.4z M19.5 32h8.5l-1.8 3.8h-4.4z M22.3 38.6h3.6L24.6 44z" fill="url(#logo-funnel)" />
      </svg>
      <span className="logo-word">
        STORM<em>CHASER</em>
      </span>
    </span>
  );
}
