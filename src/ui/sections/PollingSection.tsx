import React from 'react';
import { PollingRate } from '../../types/config';
import { SectionHead } from '../controls';

const RATES: { rate: PollingRate; interval: string }[] = [
  { rate: 125, interval: '8 ms' },
  { rate: 250, interval: '4 ms' },
  { rate: 500, interval: '2 ms' },
  { rate: 1000, interval: '1 ms' },
];

export const PollingSection: React.FC<{
  rate: PollingRate;
  onRate: (rate: PollingRate) => void;
  devicePolling: PollingRate | null;
}> = ({ rate, onRate, devicePolling }) => (
  <section className="section">
    <SectionHead
      title="Polling rate"
      desc="How often the mouse reports its position to the PC. Higher is smoother and uses a little more CPU."
    />

    <div className="rate-grid" role="radiogroup" aria-label="Polling rate">
      {RATES.map(({ rate: r, interval }) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={r === rate}
          className={`rate-tile ${r === rate ? 'is-on' : ''}`}
          onClick={() => onRate(r)}
        >
          <span className="rate-number">{r}</span>
          <span className="rate-unit">Hz</span>
          <span className="rate-interval">every {interval}</span>
          {devicePolling === r && <span className="rate-badge">On the mouse now</span>}
        </button>
      ))}
    </div>

    <p className="note">Click Apply to send your change. It takes a few seconds.</p>
  </section>
);
