import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_DPI, dpiSendProblems, nearestSupportedDpi } from '../src/protocol/dpiSend.ts';
import type { DpiStage } from '../src/types/config.ts';

const mk = (dpis: number[]): DpiStage[] => dpis.map((dpi, i) => ({ id: i + 1, dpi }));

test('supported DPI list has 23 ascending values', () => {
  assert.equal(SUPPORTED_DPI.length, 23);
  assert.equal(SUPPORTED_DPI[0], 200);
  assert.equal(SUPPORTED_DPI[22], 12800);
});

test('nearestSupportedDpi snaps to the vendor table', () => {
  assert.equal(nearestSupportedDpi(1700), 1600);
  assert.equal(nearestSupportedDpi(2200), 2000);
  assert.equal(nearestSupportedDpi(12800), 12800);
});

test('dpiSendProblems - factory stages are fine', () => {
  assert.deepEqual(dpiSendProblems(mk([800, 1600, 3200, 6400, 10400, 12800]), 0), []);
});

test('dpiSendProblems - reports count, unsupported value, bad active stage', () => {
  assert.equal(dpiSendProblems(mk([800, 1600]), 0).length, 1);
  assert.equal(dpiSendProblems(mk([800, 1600, 3200, 6400, 10400, 12700]), 0).length, 1);
  assert.equal(dpiSendProblems(mk([800, 1600, 3200, 6400, 10400, 12800]), 6).length, 1);
});
