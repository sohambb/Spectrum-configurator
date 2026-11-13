import React from 'react';

export const Switch: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className="switch"
    onClick={() => onChange(!checked)}
  >
    <span className="switch-knob" />
  </button>
);

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tells the user whether a section's changes actually reach the mouse. */
export const SectionHead: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <header className="section-head">
    <div>
      <h2>{title}</h2>
      <p>{desc}</p>
    </div>
  </header>
);

export const Range: React.FC<{
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}> = ({ label, min, max, step = 1, value, onChange, format, disabled }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="range">
      <span className="range-label">
        {label}
        <output>{format ? format(value) : value}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
};
