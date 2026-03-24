import { motion } from 'framer-motion';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, message, icon = '🔍', action }: EmptyStateProps) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
        background: 'rgba(15, 23, 42, 0.02)',
        borderRadius: 24,
        border: '1px dashed rgba(15, 23, 42, 0.08)',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: '0 0 24px', color: 'var(--muted)', fontSize: 14, maxWidth: '32ch' }}>
        {message}
      </p>
      {action && <div>{action}</div>}
    </motion.div>
  );
}
