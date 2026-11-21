type IconProps = { size?: number };

function frame(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
}

export function PlayIcon({ size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} fill="currentColor" stroke="none">
      <path d="M8 5.4v13.2L19 12 8 5.4Z" />
    </svg>
  );
}

export function PauseIcon({ size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} fill="currentColor" stroke="none">
      <rect x="7" y="5.5" width="3.6" height="13" rx="1.1" />
      <rect x="13.4" y="5.5" width="3.6" height="13" rx="1.1" />
    </svg>
  );
}

export function NextIcon({ size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} fill="currentColor" stroke="none">
      <path d="M6 6.2v11.6L15 12 6 6.2Z" />
      <rect x="16.4" y="6" width="2.4" height="12" rx="1" />
    </svg>
  );
}

export function PrevIcon({ size = 18 }: IconProps) {
  return (
    <svg {...frame(size)} fill="currentColor" stroke="none">
      <path d="M18 6.2v11.6L9 12l9-5.8Z" />
      <rect x="5.2" y="6" width="2.4" height="12" rx="1" />
    </svg>
  );
}

export function ShuffleIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M16 4h4v4M20 4l-6.2 6.2M4 20l5.4-5.4M16 20h4v-4M20 20l-5.4-5.4M4 4l4.6 4.6" />
    </svg>
  );
}

export function RepeatIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M17 3l3 3-3 3" />
      <path d="M20 6H8a4 4 0 0 0-4 4v1" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M4 18h12a4 4 0 0 0 4-4v-1" />
    </svg>
  );
}

export function RepeatOneIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M17 3l3 3-3 3" />
      <path d="M20 6H8a4 4 0 0 0-4 4v1" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M4 18h12a4 4 0 0 0 4-4v-1" />
      <path d="M11.4 10.4 13 9.6V14" />
    </svg>
  );
}

export function VolumeIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function ExpandIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />
    </svg>
  );
}

export function PlusIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ size = 18 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function FolderIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l1.8 2h8A2 2 0 0 1 20.5 9.5v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z" />
    </svg>
  );
}

export function MusicIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M9 18V6.6l9-1.8v11" />
      <circle cx="6.6" cy="18" r="2.6" />
      <circle cx="15.6" cy="15.8" r="2.6" />
    </svg>
  );
}

export function QueueIcon({ size = 17 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4 7h11M4 12h11M4 17h7" />
      <path d="M18.5 10.5v6.2" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4.5 7h15M9.5 7V5.2h5V7M6.5 7l.9 12.2h9.2L17.5 7" />
    </svg>
  );
}
