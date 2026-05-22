import type { ReactNode } from 'react';

type RightPanelSectionProps = {
  title: string;
  code?: string;
  children: ReactNode;
};

export default function RightPanelSection({ title, code, children }: RightPanelSectionProps) {
  return (
    <section className="wpc-panel wpc-right-section">
      <div className="wpc-panel-heading">
        <span>{title}</span>
        {code ? <strong>{code}</strong> : null}
      </div>
      {children}
    </section>
  );
}
