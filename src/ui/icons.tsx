import React from 'react';

// Small inline icons (24px grid, stroke-based) so the app needs no icon package.
type IconProps = { size?: number };
const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconDpi: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
);
export const IconPolling: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><path d="M3 12h3l2.5-6 4 12 3-9 1.8 3H21" /></svg>
);
export const IconLight: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></svg>
);
export const IconButtons: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><rect x="6" y="2.5" width="12" height="19" rx="6" /><path d="M12 2.5v7M6 9.5h12" /></svg>
);
export const IconMenu: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconChevronDown: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><path d="m7 10 5 5 5-5" /></svg>
);
export const IconCheck: React.FC<IconProps> = ({ size }) => (
  <svg {...base(size)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
