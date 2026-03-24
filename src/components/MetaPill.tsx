interface MetaPillProps {
  tone: 'real' | 'mock' | 'derived' | 'model' | 'warning' | 'healthy';
  children: string;
}

export function MetaPill({ tone, children }: MetaPillProps) {
  return <span className={`meta-pill tone-${tone}`}>{children}</span>;
}
