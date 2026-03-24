import { motion } from 'framer-motion';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  circle?: boolean;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = 8,
  className = '',
  circle = false,
}: SkeletonProps) {
  return (
    <motion.div
      className={`skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius: circle ? '50%' : borderRadius,
        background: 'rgba(15, 23, 42, 0.05)',
        overflow: 'hidden',
        position: 'relative',
      }}
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </motion.div>
  );
}
