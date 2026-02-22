/**
 * Material Icons font wrapper for the landing page.
 * Uses the same approach as @staysco/icons — Google Fonts Material Icons.
 * Icon names: https://fonts.google.com/icons
 */

interface MaterialIconProps {
  name: string;
  className?: string;
  size?: number;
}

export function MaterialIcon({
  name,
  className = "",
  size = 28,
}: MaterialIconProps) {
  return (
    <i
      className={`material-icons ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden="true"
    >
      {name}
    </i>
  );
}
