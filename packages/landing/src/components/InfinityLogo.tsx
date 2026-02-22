export function InfinityLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="60%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#9333ea" />
        </linearGradient>
      </defs>
      {/* Infinity loop */}
      <path
        d="M60 30c0-10 8-20 20-20s20 10 20 20-8 20-20 20-20-10-20-20zm0 0c0 10-8 20-20 20S20 40 20 30s8-20 20-20 20 10 20 20z"
        stroke="url(#logo-gradient)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Wind streaks */}
      <line
        x1="15"
        y1="18"
        x2="35"
        y2="18"
        stroke="#93c5fd"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="10"
        y1="24"
        x2="25"
        y2="24"
        stroke="#93c5fd"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      <line
        x1="85"
        y1="36"
        x2="105"
        y2="36"
        stroke="#93c5fd"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="90"
        y1="42"
        x2="110"
        y2="42"
        stroke="#93c5fd"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}
