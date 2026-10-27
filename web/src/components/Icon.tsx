import type { CSSProperties } from 'react';

const PATHS = {
  overview: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  requests: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  globe: <><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19" /></>,
  map: <path d="M9 3.5 3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6 9 3.5ZM9 3.5V18M15 6v14.5" />,
  settings: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5" />,
  chevDown: <path d="m6 9 6 6 6-6" />,
  chevRight: <path d="m9 6 6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  searchMinus: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 11h5" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
  refresh: <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M3 21v-5h5" />,
  wifiOff: <path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5M12 20h.01" />,
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 4.5l12 7.5-12 7.5z" />,
  ip: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h.01M7 15h.01M11 9h6M11 15h6" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'ic', style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {PATHS[name]}
    </svg>
  );
}
