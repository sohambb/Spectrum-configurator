import React, { useMemo } from 'react';
import { RgbConfig } from '../types/config';

/*
 * Top-down drawing of a honeycomb-shell mouse. The lighting preview shows
 * through the holes of the shell, the way the Spectrum's RGB does.
 * Original artwork; not traced from any product photo.
 */

const BODY =
  'M100 14 C150 14 176 54 178 112 L180 212 C182 272 146 310 100 310 C54 310 18 272 20 212 L22 112 C24 54 50 14 100 14 Z';

// Pointy-top hexagon centres on a staggered grid, kept inside the palm area.
function hexPoints(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 90) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export const MouseArt: React.FC<{ rgb: RgbConfig }> = ({ rgb }) => {
  const holes = useMemo(() => {
    const list: string[] = [];
    const r = 8.6;
    const dx = r * Math.sqrt(3) + 2.2;
    const dy = r * 1.5 + 1.9;
    for (let row = 0; row < 16; row++) {
      const y = 152 + row * dy;
      const offset = row % 2 ? dx / 2 : 0;
      for (let col = -1; col < 12; col++) {
        const x = 14 + col * dx + offset;
        list.push(hexPoints(x, y, r - 1.6));
      }
    }
    return list;
  }, []);

  const lit = rgb.enabled && rgb.effect !== 'off';
  const glow = rgb.effect === 'rainbow' || rgb.effect === 'wave' ? 'url(#spectrum-sweep)' : rgb.color;
  const opacity = lit ? 0.25 + (rgb.brightness / 100) * 0.75 : 0;
  // Speed 1..5 maps to a slower or faster preview animation.
  const duration = `${(7 - rgb.speed) * 1.4}s`;

  return (
    <svg
      className={`mouse-art effect-${lit ? rgb.effect : 'off'}`}
      viewBox="0 0 200 324"
      role="img"
      aria-label={lit ? `Mouse preview, ${rgb.effect} lighting` : 'Mouse preview, lighting off'}
      style={{ '--anim': duration } as React.CSSProperties}
    >
      <defs>
        <clipPath id="palm">
          <path d={BODY} />
        </clipPath>
        <linearGradient id="spectrum-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3d6e" />
          <stop offset="0.25" stopColor="#ffb13d" />
          <stop offset="0.5" stopColor="#3dffa0" />
          <stop offset="0.75" stopColor="#3da8ff" />
          <stop offset="1" stopColor="#b33dff" />
        </linearGradient>
        <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Light spilling onto the desk under the mouse */}
      <path d={BODY} className="mouse-spill" fill={glow} opacity={opacity * 0.55} filter="url(#soft-glow)" />

      <path d={BODY} className="mouse-shell" />

      <g clipPath="url(#palm)">
        <g className="mouse-holes" fill={lit ? glow : 'var(--hole-off)'} opacity={lit ? opacity : 1}>
          {holes.map((p, i) => (
            <polygon key={i} points={p} />
          ))}
        </g>
        {/* Solid band where the buttons sit */}
        <path d="M0 0 H200 V128 Q100 150 0 128 Z" className="mouse-buttons" />
      </g>

      <path d="M100 16 V134" className="mouse-seam" />
      <path d="M22 128 Q100 150 178 128" className="mouse-seam" fill="none" />
      <rect x="92" y="44" width="16" height="42" rx="8" className="mouse-wheel" />
      {/* DPI stage indicator sits just below the wheel */}
      <circle cx="100" cy="104" r="4" fill={rgb.color} className="mouse-stage-led" />
      <path d={BODY} className="mouse-outline" fill="none" />
    </svg>
  );
};
