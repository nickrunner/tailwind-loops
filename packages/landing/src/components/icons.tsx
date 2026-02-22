/**
 * Inline SVG icons for the landing page.
 * Based on Material Design line art style — clean, minimal, consistent stroke width.
 */

interface IconProps {
  className?: string;
}

/** Brain / AI understanding — stylized neural network */
export function BrainIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2a5 5 0 0 1 4.9 4.1A4.5 4.5 0 0 1 19.5 11a4.5 4.5 0 0 1-2.6 4.1A5 5 0 0 1 12 22a5 5 0 0 1-4.9-6.9A4.5 4.5 0 0 1 4.5 11a4.5 4.5 0 0 1 2.6-4.9A5 5 0 0 1 12 2z" />
      <path d="M12 2v20" />
      <path d="M4.5 11h15" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Map / Corridor intelligence — route through landscape */
export function CorridorIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" />
      <path d="M9 4v13" />
      <path d="M15 7v13" />
    </svg>
  );
}

/** Flow / Loop — infinity-inspired continuous path */
export function FlowIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 12c0-3.5 2.5-6 6-6s6 2.5 6 6-2.5 6-6 6-6-2.5-6-6z" />
      <path d="M12 12c0 3.5-2.5 6-6 6s-6-2.5-6-6 2.5-6 6-6 6 2.5 6 6z" />
    </svg>
  );
}

/** Chat bubble with sparkle — AI conversation */
export function AiChatIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
      <path d="M12 8l.5-1.5L14 6l-1.5-.5L12 4l-.5 1.5L10 6l1.5.5L12 8z" fill="currentColor" stroke="none" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

/** Route / Path — winding road */
export function RouteIcon({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M6 17C6 12 12 12 12 7" />
      <path d="M12 7C12 12 18 12 18 7" />
    </svg>
  );
}
