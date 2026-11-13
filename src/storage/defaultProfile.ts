import { MouseConfig } from '../types/config';

export const DEFAULT_PROFILE: MouseConfig = {
  schema_version: 1,
  profile_id: 'default-factory',
  name: 'Default Factory Profile',
  active_dpi_stage: 0, // 800 DPI
  // The mouse's real factory stages.
  dpi_stages: [
    { id: 1, dpi: 800 },
    { id: 2, dpi: 1600 },
    { id: 3, dpi: 3200 },
    { id: 4, dpi: 6400 },
    { id: 5, dpi: 10400 },
    { id: 6, dpi: 12800 },
  ],
  polling_rate: 1000,
  rgb: {
    // The mouse's factory lighting: Ripple, full brightness.
    enabled: true,
    effect: 'wave',
    mode: 10,
    brightness: 100,
    speed: 3,
    color: '#6366F1',
    direction: 'clockwise',
  },
  last_modified: '2026-11-09T00:00:00.000Z',
};
