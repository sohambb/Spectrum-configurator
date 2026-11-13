import { nearestSupportedDpi } from '../protocol/dpiSend';

/** One of the mouse's six DPI stages. The mouse has one value per stage (no separate X/Y, no on/off). */
export interface DpiStage {
  id: number;
  dpi: number;
}

export type PollingRate = 125 | 250 | 500 | 1000;

export type RgbEffect = 'static' | 'breathing' | 'rainbow' | 'wave' | 'off';
export type RgbDirection = 'clockwise' | 'counter-clockwise' | 'two-way';

export interface RgbConfig {
  enabled: boolean;
  effect: RgbEffect;
  brightness: number; // 0 to 100%
  speed: number;      // 1 to 5
  color: string;      // #RRGGBB, used for the on-screen preview only
  direction: RgbDirection;
  /** The mouse's own effect number (0..12, see protocol/lighting.ts). Unset = not chosen yet. */
  mode?: number;
}

export interface MouseConfig {
  schema_version: number;
  profile_id: string;
  name: string;
  active_dpi_stage: number; // 0-indexed into dpi_stages
  dpi_stages: DpiStage[];
  polling_rate: PollingRate;
  rgb: RgbConfig;
  last_modified: string;
}

export const MIN_DPI = 200;
export const MAX_DPI = 12800;
export const STAGE_COUNT = 6;
/** The mouse's real factory stages. */
export const FACTORY_DPI = [800, 1600, 3200, 6400, 10400, 12800];

export function validateConfig(raw: unknown): MouseConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Config must be a valid JSON object');
  }
  const obj = raw as Partial<MouseConfig>;

  // Always exactly six stages, each a value the mouse has (nearest one if not).
  const given = Array.isArray(obj.dpi_stages) ? obj.dpi_stages.slice(0, STAGE_COUNT) : [];
  const stages: DpiStage[] = FACTORY_DPI.map((factory, i) => ({
    id: i + 1,
    dpi: nearestSupportedDpi(typeof given[i]?.dpi === 'number' ? given[i].dpi : factory),
  }));

  const validPolling: PollingRate[] = [125, 250, 500, 1000];
  const polling: PollingRate = validPolling.includes(obj.polling_rate as PollingRate)
    ? (obj.polling_rate as PollingRate)
    : 1000;

  const validEffects: RgbEffect[] = ['static', 'breathing', 'rainbow', 'wave', 'off'];
  const rgbEffect: RgbEffect = validEffects.includes(obj.rgb?.effect as RgbEffect)
    ? (obj.rgb?.effect as RgbEffect)
    : 'rainbow';

  return {
    schema_version: 1,
    profile_id: typeof obj.profile_id === 'string' ? obj.profile_id : 'default',
    name: typeof obj.name === 'string' ? obj.name : 'Default Profile',
    active_dpi_stage: Math.max(0, Math.min(stages.length - 1, obj.active_dpi_stage ?? 0)),
    dpi_stages: stages,
    polling_rate: polling,
    rgb: {
      enabled: obj.rgb?.enabled ?? true,
      effect: rgbEffect,
      brightness: Math.max(0, Math.min(100, obj.rgb?.brightness ?? 80)),
      speed: Math.max(1, Math.min(5, obj.rgb?.speed ?? 3)),
      color: typeof obj.rgb?.color === 'string' && obj.rgb.color.startsWith('#') ? obj.rgb.color : '#6366F1',
      direction: obj.rgb?.direction === 'counter-clockwise' || obj.rgb?.direction === 'two-way' ? obj.rgb.direction : 'clockwise',
      ...(Number.isInteger(obj.rgb?.mode) && (obj.rgb?.mode as number) >= 0 && (obj.rgb?.mode as number) <= 12
        ? { mode: obj.rgb?.mode as number }
        : {}),
    },
    last_modified: new Date().toISOString(),
  };
}
