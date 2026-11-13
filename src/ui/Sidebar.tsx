import React from 'react';
import { MouseConfig, PollingRate } from '../types/config';
import { MousePhoto } from './MousePhoto';
import { IconButtons, IconDpi, IconLight, IconPolling } from './icons';

export type SectionId = 'dpi' | 'polling' | 'lighting' | 'buttons';

const SECTIONS: { id: SectionId; label: string; tint: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'dpi', label: 'Sensitivity', tint: 'blue', Icon: IconDpi },
  { id: 'polling', label: 'Polling rate', tint: 'green', Icon: IconPolling },
  { id: 'lighting', label: 'Lighting', tint: 'orange', Icon: IconLight },
  { id: 'buttons', label: 'Buttons', tint: 'purple', Icon: IconButtons },
];

export const Sidebar: React.FC<{
  config: MouseConfig;
  section: SectionId;
  onSection: (id: SectionId) => void;
  demo: boolean;
  devicePolling: PollingRate | null;
}> = ({ config, section, onSection, demo, devicePolling }) => {
  const stage = config.dpi_stages[config.active_dpi_stage] ?? config.dpi_stages[0];
  const state = demo ? 'demo' : 'ok';
  const stateText = demo ? 'Demo mode' : 'Connected';
  const polling = !demo && devicePolling ? devicePolling : config.polling_rate;

  return (
    <aside className="sidebar">
      <div className="hero">
        <MousePhoto rgb={config.rgb} />
        <h1 className="hero-name">Spectrum</h1>
        <p className={`hero-state state-${state}`} role="status">
          <span className="state-dot" />
          {stateText}
        </p>
        <dl className="hero-stats">
          <div>
            <dt>DPI</dt>
            <dd>{stage?.dpi.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Hz</dt>
            <dd>{polling}</dd>
          </div>
        </dl>
      </div>

      <nav className="nav" aria-label="Settings">
        {SECTIONS.map(({ id, label, tint, Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${section === id ? 'is-on' : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSection(id)}
          >
            <span className={`nav-icon tint-${tint}`}>
              <Icon size={15} />
            </span>
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
};
