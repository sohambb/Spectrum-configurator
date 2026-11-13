import React from 'react';
import { DpiStage } from '../../types/config';
import { Range, SectionHead } from '../controls';
import { SUPPORTED_DPI } from '../../protocol/dpiSend';

export const DpiSection: React.FC<{
  stages: DpiStage[];
  active: number;
  onStages: (stages: DpiStage[]) => void;
  onActive: (index: number) => void;
}> = ({ stages, active, onStages, onActive }) => {
  const indexOf = (dpi: number) => Math.max(0, SUPPORTED_DPI.indexOf(dpi));
  const update = (i: number, dpi: number) => onStages(stages.map((s, idx) => (idx === i ? { ...s, dpi } : s)));

  return (
    <section className="section">
      <SectionHead title="Sensitivity" desc="Six DPI stages. The mouse's DPI button steps through them." />

      <ol className="stages">
        {stages.map((s, i) => (
          <li key={s.id} className={`stage-row ${i === active ? 'is-active' : ''}`}>
            <button
              type="button"
              className="stage-pick"
              aria-pressed={i === active}
              aria-label={`Make stage ${i + 1} the active stage`}
              onClick={() => onActive(i)}
            >
              {i + 1}
            </button>
            <Range
              label="DPI"
              min={0}
              max={SUPPORTED_DPI.length - 1}
              step={1}
              value={indexOf(s.dpi)}
              onChange={(v) => update(i, SUPPORTED_DPI[v])}
              format={(v) => SUPPORTED_DPI[v].toLocaleString()}
            />
          </li>
        ))}
      </ol>

      <p className="note">The numbered circle marks the stage the mouse starts on. Click Apply to send your changes.</p>
    </section>
  );
};
