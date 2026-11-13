import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, MIN_DPI, MAX_DPI } from '../src/types/config.ts';

test('validateConfig - handles null or non-object safely', () => {
  assert.throws(() => validateConfig(null), /valid JSON object/);
  assert.throws(() => validateConfig('string'), /valid JSON object/);
});

test('validateConfig - applies defaults and sanitizes stages', () => {
  const result = validateConfig({});
  assert.equal(result.schema_version, 1);
  assert.equal(result.name, 'Default Profile');
  assert.equal(result.polling_rate, 1000);
  assert.equal(result.dpi_stages.length, 6);
  assert.equal(result.rgb.enabled, true);
  assert.equal(result.rgb.effect, 'rainbow');
  assert.equal(result.rgb.brightness, 80);
});

test('validateConfig - always six supported DPI stages', () => {
  const custom = {
    profile_id: 'custom-1',
    name: 'Pro Gaming',
    active_dpi_stage: 10, // out of range
    dpi_stages: [
      { id: 1, dpi: 150 },
      { id: 2, dpi: 50000 },
      { id: 3, dpi: 1600 },
      { id: 4, dpi: 2400 },
      { id: 5, dpi: 3200 },
      { id: 6, dpi: 6400 },
      { id: 7, dpi: 12800 }, // 7th should be sliced off
    ],
    polling_rate: 9999 as any, // invalid polling rate
    rgb: {
      enabled: true,
      effect: 'super-glow' as any, // invalid effect
      brightness: 250, // exceeds 100
      speed: 10, // exceeds 5
      color: 'blue', // invalid hex
      direction: 'invalid' as any,
    },
  };

  const validated = validateConfig(custom);
  assert.equal(validated.dpi_stages.length, 6);
  assert.equal(validated.dpi_stages[0].dpi, MIN_DPI); // 150 -> 200
  assert.equal(validated.dpi_stages[1].dpi, MAX_DPI); // 50000 -> 12800
  assert.equal(validated.dpi_stages[5].dpi, 6400);
  assert.equal(validated.dpi_stages[2].dpi, 1600);
  assert.equal(validated.dpi_stages[3].dpi, 2400);
  assert.equal(validated.polling_rate, 1000); // fallback polling
  assert.equal(validated.rgb.effect, 'rainbow'); // fallback effect
  assert.equal(validated.rgb.brightness, 100); // clamped to 100
  assert.equal(validated.rgb.speed, 5); // clamped to 5
  assert.equal(validated.rgb.color, '#6366F1'); // fallback color
  assert.equal(validated.rgb.direction, 'clockwise'); // fallback direction
  assert.equal(validated.active_dpi_stage, 5); // clamped to stages.length - 1
});
