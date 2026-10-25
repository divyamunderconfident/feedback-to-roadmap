// Brand mark: three feedback dots on the left, turned into three ranked bars of decreasing length.
// Kept in sync with app/icon.svg (the favicon).
import { useId } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <circle cx="8.5" cy="10" r="1.75" fill="#fff" opacity="0.55" />
      <circle cx="8.5" cy="16" r="1.75" fill="#fff" opacity="0.55" />
      <circle cx="8.5" cy="22" r="1.75" fill="#fff" opacity="0.55" />
      <rect x="13" y="8.5" width="12.5" height="3" rx="1.5" fill="#fff" />
      <rect x="13" y="14.5" width="9" height="3" rx="1.5" fill="#fff" opacity="0.85" />
      <rect x="13" y="20.5" width="5.5" height="3" rx="1.5" fill="#fff" opacity="0.7" />
    </svg>
  );
}
