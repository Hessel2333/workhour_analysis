import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  note?: string;
  actions?: ReactNode;
  badge?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  subtitle,
  note,
  actions,
  badge,
  meta,
  children,
  className = '',
}: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{title}</p>
          {subtitle ? <h3 className="panel-title">{subtitle}</h3> : null}
        </div>
        <div className="panel-actions">
          {badge ? <span className="panel-badge">{badge}</span> : null}
          {actions}
        </div>
      </header>
      {note ? <p className="panel-note">{note}</p> : null}
      {meta ? <div className="panel-meta">{meta}</div> : null}
      <div className="panel-body">{children}</div>
    </section>
  );
}
