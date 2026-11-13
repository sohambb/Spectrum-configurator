// The mouse's own lighting effects and how app settings map to its bytes.
import type { RgbConfig, RgbEffect } from '../types/config';

export interface VendorEffect {
  id: number;
  name: string;
  speed: boolean;
  brightness: boolean;
  /** 0 = no direction, 2 = forward/reverse, 3 = also both ways. */
  directions: 0 | 2 | 3;
  /** Rough look for the on-screen preview only. */
  preview: RgbEffect;
}

export const VENDOR_EFFECTS: VendorEffect[] = [
  { id: 0, name: 'DPI breathing', speed: true, brightness: false, directions: 0, preview: 'breathing' },
  { id: 1, name: 'Cycle breathing', speed: true, brightness: false, directions: 0, preview: 'breathing' },
  { id: 2, name: 'Light on', speed: false, brightness: true, directions: 0, preview: 'static' },
  { id: 3, name: 'Flowing water', speed: true, brightness: true, directions: 3, preview: 'wave' },
  { id: 4, name: 'Mono water', speed: true, brightness: true, directions: 3, preview: 'wave' },
  { id: 5, name: 'Comet streak', speed: true, brightness: true, directions: 3, preview: 'wave' },
  { id: 6, name: 'Neon', speed: true, brightness: false, directions: 0, preview: 'rainbow' },
  { id: 7, name: 'Ambilight', speed: true, brightness: false, directions: 2, preview: 'rainbow' },
  { id: 8, name: 'Flicker', speed: true, brightness: false, directions: 0, preview: 'breathing' },
  { id: 9, name: 'Star trek', speed: false, brightness: false, directions: 0, preview: 'wave' },
  { id: 10, name: 'Ripple', speed: true, brightness: false, directions: 2, preview: 'wave' },
  { id: 11, name: 'Enraptured', speed: true, brightness: false, directions: 0, preview: 'rainbow' },
  { id: 12, name: 'Button response', speed: false, brightness: false, directions: 0, preview: 'static' },
];

export const LED_OFF = 13;

export interface VendorLighting {
  effect: number;
  speed: number;
  brightness: number;
  direction: number;
}

/** App speed 1..5 -> mouse speed 0..5 (1 = slowest 0, 5 = fastest 5). */
export const toVendorSpeed = (s: number) => Math.round((Math.max(1, Math.min(5, s)) - 1) * 5 / 4);
/** App brightness 0..100 % -> mouse level 0 (brightest)..7. */
export const toVendorBrightness = (pct: number) => 7 - Math.round((Math.max(0, Math.min(100, pct)) / 100) * 7);

/** What would be sent, or null when the user has not picked one of the mouse's effects. */
export function toVendorLighting(rgb: RgbConfig): VendorLighting | null {
  const speed = toVendorSpeed(rgb.speed);
  const brightness = toVendorBrightness(rgb.brightness);
  if (!rgb.enabled || rgb.effect === 'off') return { effect: LED_OFF, speed, brightness, direction: 0 };
  const fx = VENDOR_EFFECTS.find((e) => e.id === rgb.mode);
  if (!fx) return null;
  let direction = 0;
  if (fx.directions >= 2 && rgb.direction === 'counter-clockwise') direction = 1;
  if (fx.directions === 3 && rgb.direction === 'two-way') direction = 2;
  return { effect: fx.id, speed, brightness, direction };
}

/** How the on-screen mouse animates its light, for the preview only. */
export type PreviewLook =
  | 'off' | 'solid' | 'dim' | 'breathe' | 'breathe-cycle' | 'flow' | 'flow-mono'
  | 'comet' | 'neon' | 'flicker' | 'ripple';

const LOOK_BY_MODE: PreviewLook[] = [
  'breathe', 'breathe-cycle', 'solid', 'flow', 'flow-mono', 'comet', 'neon',
  'flow', 'flicker', 'comet', 'ripple', 'neon', 'dim',
];

export function previewLook(rgb: RgbConfig): PreviewLook {
  if (!rgb.enabled || rgb.effect === 'off') return 'off';
  if (rgb.mode !== undefined && LOOK_BY_MODE[rgb.mode]) return LOOK_BY_MODE[rgb.mode];
  return rgb.effect === 'static' ? 'solid' : rgb.effect === 'breathing' ? 'breathe' : rgb.effect === 'rainbow' ? 'neon' : 'flow';
}
