import React from 'react';
import { RgbConfig, RgbDirection } from '../../types/config';
import { Range, SectionHead, Segmented, Switch } from '../controls';
import { VENDOR_EFFECTS } from '../../protocol/lighting';

export const LightingSection: React.FC<{
  rgb: RgbConfig;
  onChange: (rgb: RgbConfig) => void;
}> = ({ rgb, onChange }) => {
  const set = (patch: Partial<RgbConfig>) => onChange({ ...rgb, ...patch });
  const on = rgb.enabled && rgb.effect !== 'off';
  const fx = VENDOR_EFFECTS.find((e) => e.id === rgb.mode);

  const pick = (id: number) => {
    const e = VENDOR_EFFECTS.find((v) => v.id === id);
    if (e) set({ mode: id, effect: e.preview, enabled: true });
  };

  const dirOptions: { value: RgbDirection; label: string }[] = [
    { value: 'clockwise', label: 'Clockwise' },
    { value: 'counter-clockwise', label: 'Anticlockwise' },
  ];
  if (fx?.directions === 3) dirOptions.push({ value: 'two-way', label: 'Both ways' });

  return (
    <section className="section">
      <SectionHead
        title="Lighting"
        desc="The light behind the honeycomb shell. These are the effects built into the mouse."
      />

      <div className="row-between">
        <span className="field-label">Lighting on</span>
        <Switch
          checked={on}
          label="Lighting on"
          onChange={(v) => set({ enabled: v, effect: v ? fx?.preview ?? 'static' : 'off' })}
        />
      </div>

      <fieldset className="field" disabled={!on}>
        <legend className="field-label">Effect</legend>
        <div className="effect-grid" role="radiogroup" aria-label="Effect">
          {VENDOR_EFFECTS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={rgb.mode === e.id}
              className={`effect-tile ${rgb.mode === e.id ? 'is-on' : ''}`}
              onClick={() => pick(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
      </fieldset>

      {fx && (fx.brightness || fx.speed) && (
        <div className="field-grid">
          {fx.brightness && (
            <Range label="Brightness" min={0} max={100} step={5} value={rgb.brightness} onChange={(brightness) => set({ brightness })} format={(v) => `${v}%`} disabled={!on} />
          )}
          {fx.speed && <Range label="Speed" min={1} max={5} value={rgb.speed} onChange={(speed) => set({ speed })} disabled={!on} />}
        </div>
      )}

      {fx && fx.directions > 0 && (
        <fieldset className="field" disabled={!on}>
          <legend className="field-label">Direction</legend>
          <Segmented<RgbDirection>
            label="Direction"
            value={fx.directions === 2 && rgb.direction === 'two-way' ? 'clockwise' : rgb.direction}
            onChange={(direction) => set({ direction })}
            options={dirOptions}
          />
        </fieldset>
      )}

      <p className="note">Click Apply to send your changes to the mouse.</p>
    </section>
  );
};
