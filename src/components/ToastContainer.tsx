import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore, ToastType } from '../store/toastStore';

const iconMap: Record<ToastType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

const colorMap: Record<ToastType, string> = {
  info: 'var(--color-info)',
  success: 'var(--color-healthy)',
  warning: 'var(--color-warning)',
  error: 'var(--color-risk)',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
            onClick={() => removeToast(toast.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(20px)',
              padding: '12px 18px',
              borderRadius: 16,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 200,
              maxWidth: 400,
            }}
          >
            <span style={{ fontSize: 16 }}>{iconMap[toast.type]}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              {toast.message}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
