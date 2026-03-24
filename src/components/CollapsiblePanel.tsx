import { useState, type ReactNode } from 'react';
import { Panel } from './Panel';

interface CollapsiblePanelProps {
  title: string;
  subtitle?: string;
  note?: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsiblePanel({
  title,
  subtitle,
  note,
  meta,
  children,
  defaultOpen = false,
  className = '',
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      note={open ? note : undefined}
      meta={open ? meta : undefined}
      className={`collapsible-panel ${className}`.trim()}
      actions={
        <button
          type="button"
          className={`panel-info-toggle ${open ? 'active' : ''}`.trim()}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? '收起明细' : '查看明细'}
        </button>
      }
    >
      {open ? children : null}
    </Panel>
  );
}
