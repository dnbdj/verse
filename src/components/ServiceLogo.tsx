import type { ServiceId } from "../lib/services";

type Props = {
  id: ServiceId;
  size?: number;
  className?: string;
};

/**
 * Brand marks drawn inline. Inline SVG keeps the app offline-safe and sharp on every
 * scale factor — no remote logo files, no broken image boxes when a domain is blocked.
 * Cut-outs use `--mark-cut`, set to the tile colour by the caller.
 */
export function ServiceLogo({ id, size = 16, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    focusable: "false" as const,
    className,
  };

  switch (id) {
    case "spotify":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M12 1.6A10.4 10.4 0 1 0 22.4 12 10.41 10.41 0 0 0 12 1.6Zm4.79 15.02a.78.78 0 0 1-1.07.26c-2.93-1.79-6.62-2.19-10.97-1.2a.78.78 0 1 1-.35-1.52c4.75-1.09 8.83-.63 12.13 1.39a.78.78 0 0 1 .26 1.07Zm1.28-2.85a.98.98 0 0 1-1.34.32c-3.35-2.06-8.46-2.66-12.42-1.46a.98.98 0 1 1-.57-1.87c4.53-1.37 10.16-.71 14.01 1.66a.98.98 0 0 1 .32 1.35Zm.11-2.97C14.53 8.85 7.9 8.62 4.08 9.78a1.17 1.17 0 1 1-.68-2.24C7.78 6.17 15.1 6.44 19.31 8.94a1.17 1.17 0 1 1-1.13 1.86Z"
          />
        </svg>
      );

    case "ytmusic":
      return (
        <svg {...common}>
          <rect x="1.6" y="4.4" width="20.8" height="15.2" rx="4.4" fill="currentColor" />
          <path d="M9.8 8.7v6.6l5.9-3.3Z" fill="var(--mark-cut, #ff0033)" />
        </svg>
      );

    case "soundcloud":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M2 15.1a2.55 2.55 0 0 1 2.55-2.55c.2 0 .4.02.59.07a6.1 6.1 0 0 1 11.6-1.42 4.33 4.33 0 1 1 .86 8.58H4.9A2.9 2.9 0 0 1 2 16.88v-1.78Z"
          />
          <path
            fill="currentColor"
            d="M7.1 7.9v9.2M8.9 6.9v10.2M10.7 6.5v10.6"
            stroke="currentColor"
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.35"
          />
        </svg>
      );

    case "deezer":
      return (
        <svg {...common}>
          {[10, 16, 22, 13, 19, 22].map((height, index) => (
            <rect
              key={index}
              x={1.4 + index * 3.6}
              y={22.2 - height}
              width="2.5"
              height={height}
              rx="1.2"
              fill="currentColor"
            />
          ))}
        </svg>
      );

    case "amazon":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10.2" fill="currentColor" />
          <path
            d="M6.6 14.8c3.6 2.2 7.4 2.2 10.6 0"
            stroke="var(--mark-cut, #25d1da)"
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M14.2 7.2v5.3a2.15 2.15 0 1 1-1.55-2.06"
            stroke="var(--mark-cut, #25d1da)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );

    case "tidal":
      return (
        <svg {...common}>
          {[
            [6, 7],
            [12, 7],
            [18, 7],
            [12, 13],
          ].map(([x, y]) => (
            <path
              key={`${x}-${y}`}
              d={`M${x} ${y - 3.1} L${x + 3.1} ${y} L${x} ${y + 3.1} L${x - 3.1} ${y}Z`}
              fill="currentColor"
            />
          ))}
        </svg>
      );

    case "apple":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10.2" fill="currentColor" />
          <path
            d="M15.35 6.55v7.9a2.35 2.35 0 1 1-1.5-2.19V9.15l-4.1 1v6.05a2.35 2.35 0 1 1-1.5-2.19V8.35l7.1-1.8Z"
            fill="var(--mark-cut, #fa2d48)"
          />
        </svg>
      );

    case "bandcamp":
      return (
        <svg {...common}>
          <path d="M16.9 18.6H3.4L7.1 5.4h13.5Z" fill="currentColor" />
        </svg>
      );

    default:
      return null;
  }
}
