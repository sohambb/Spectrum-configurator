import React from 'react';
import { SectionHead } from '../controls';

export const ButtonsSection: React.FC = () => (
  <section className="section">
    <SectionHead title="Buttons and macros" desc="Remap buttons and record macros." />
    <div className="coming-soon" role="status">
      <h3>Still in development</h3>
      <p>Button remapping and macros are not available yet. They are coming in a later version.</p>
    </div>
  </section>
);
