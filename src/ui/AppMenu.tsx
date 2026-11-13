import React from 'react';
import { Segmented } from './controls';
import { IconMenu } from './icons';
import { usePopover } from './usePopover';

export type Theme = 'light' | 'dark';

export const AppMenu: React.FC<{
  theme: Theme;
  onTheme: (t: Theme) => void;
}> = ({ theme, onTheme }) => {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="tool-button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconMenu size={18} />
      </button>
      {open && (
        <div className="popover popover-right" role="dialog" aria-label="App settings">
          <div className="pop-row">
            <span>Appearance</span>
            <Segmented<Theme>
              label="Appearance"
              value={theme}
              onChange={onTheme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
};
