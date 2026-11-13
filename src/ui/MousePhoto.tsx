import React, { useState } from 'react';
import { RgbConfig } from '../types/config';
import { previewLook } from '../protocol/lighting';
import { MouseArt } from './MouseArt';

/*
 * The real mouse photo with live lighting. Three layers share one size:
 * the edge glow (public/mouse-glow.png as a mask), the mouse itself
 * (public/mouse.png) and the logo light (public/mouse-logo.png as a mask).
 * Both light layers use the same animated fill, so they move together.
 */
const SPEED_SECONDS = [6, 4.5, 3, 2.1, 1.4];

export const MousePhoto: React.FC<{ rgb: RgbConfig }> = ({ rgb }) => {
  const [missing, setMissing] = useState(false);
  const look = previewLook(rgb);
  const solidColor = rgb.color;
  const style = {
    '--glow': solidColor,
    '--alpha': look === 'off' ? 0 : look === 'dim' ? 0.35 : 0.35 + (rgb.brightness / 100) * 0.65,
    '--dur': `${SPEED_SECONDS[Math.max(1, Math.min(5, rgb.speed)) - 1]}s`,
    '--dir': rgb.direction === 'counter-clockwise' ? 'reverse' : rgb.direction === 'two-way' ? 'alternate' : 'normal',
  } as React.CSSProperties;

  if (missing) {
    return (
      <div className="photo">
        <div className="photo-art"><MouseArt rgb={rgb} /></div>
      </div>
    );
  }

  return (
    <div className={`photo look-${look}`} style={style}>
      <div className="light light-edge" aria-hidden="true"><div className="light-fill" /></div>
      <img className="photo-img" src="/mouse.png" alt="Cosmic Byte Spectrum mouse" draggable={false} onError={() => setMissing(true)} />
      <div className="light light-logo" aria-hidden="true"><div className="light-fill" /></div>
    </div>
  );
};
