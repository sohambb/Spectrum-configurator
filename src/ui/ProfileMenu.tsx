import React, { useRef, useState } from 'react';
import { MouseConfig } from '../types/config';
import { IconCheck, IconChevronDown } from './icons';
import { usePopover } from './usePopover';

export const ProfileMenu: React.FC<{
  profiles: MouseConfig[];
  activeId: string;
  activeName: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (json: string) => void;
}> = ({ profiles, activeId, activeName, onSelect, onCreate, onRename, onDelete, onExport, onImport }) => {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setRenaming(false);
  };
  const finishRename = () => {
    if (draft.trim()) onRename(activeId, draft.trim());
    close();
  };

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="profile-name">{activeName}</span>
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div className="popover popover-right menu" role="menu" aria-label="Profiles">
          {profiles.map((p) =>
            renaming && p.profile_id === activeId ? (
              <input
                key={p.profile_id}
                className="menu-input"
                value={draft}
                autoFocus
                aria-label="Profile name"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                onBlur={finishRename}
              />
            ) : (
              <button
                key={p.profile_id}
                type="button"
                role="menuitemradio"
                aria-checked={p.profile_id === activeId}
                className="menu-item"
                onClick={() => {
                  onSelect(p.profile_id);
                  close();
                }}
              >
                <span className="menu-check">{p.profile_id === activeId && <IconCheck size={14} />}</span>
                {p.name}
              </button>
            ),
          )}
          <hr className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => { onCreate(); close(); }}>
            <span className="menu-check" />New profile
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setDraft(activeName); setRenaming(true); }}>
            <span className="menu-check" />Rename…
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={profiles.length <= 1}
            onClick={() => {
              if (window.confirm(`Delete the profile "${activeName}"?`)) onDelete(activeId);
              close();
            }}
          >
            <span className="menu-check" />Delete…
          </button>
          <hr className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => { onExport(); close(); }}>
            <span className="menu-check" />Export…
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => fileRef.current?.click()}>
            <span className="menu-check" />Import…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onImport(await file.text());
              e.target.value = '';
              close();
            }}
          />
        </div>
      )}
    </div>
  );
};
