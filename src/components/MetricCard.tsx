import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform, animate } from 'framer-motion';
import { Skeleton } from './Skeleton';

interface MetricCardProps {
  label: string;
  value: string | number;
  hint: string;
  tone?: 'real' | 'mock' | 'derived' | 'model' | 'warning' | 'healthy';
  loading?: boolean;
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'real',
  loading = false,
}: MetricCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value.toString().replace(/[^\d.-]/g, ''));
  const isNumeric = !isNaN(numericValue);
  
  const [displayValue, setDisplayValue] = useState(isNumeric ? 0 : value);

  useEffect(() => {
    if (!isNumeric) {
      setDisplayValue(value);
      return;
    }

    const controls = animate(displayValue as number, numericValue, {
      duration: 1,
      ease: 'easeOut',
      onUpdate: (latest) => {
        if (typeof value === 'string' && value.includes('.')) {
          setDisplayValue(latest.toFixed(1));
        } else {
          setDisplayValue(Math.floor(latest));
        }
      },
    });

    return () => controls.stop();
  }, [numericValue, isNumeric, value]);

  if (loading) {
    return (
      <div className={`metric-card tone-${tone} loading`.trim()}>
        <div className="metric-header">
          <Skeleton width={60} height={12} />
        </div>
        <div style={{ margin: '8px 0' }}>
          <Skeleton width="80%" height={32} />
        </div>
        <Skeleton width="40%" height={12} />
      </div>
    );
  }

  return (
    <motion.div 
      className={`metric-card tone-${tone}`.trim()}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="metric-header">
        <span className="metric-label">{label}</span>
      </div>
      <strong className="metric-value">
        {isNumeric && typeof value === 'string' && value.includes('%') ? `${displayValue}%` : displayValue}
      </strong>
      <span className="metric-hint">{hint}</span>
    </motion.div>
  );
}
