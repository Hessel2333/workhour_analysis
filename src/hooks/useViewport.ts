import { useEffect, useState } from 'react';

function getWidth() {
  return window.innerWidth;
}

export function useViewport() {
  const [width, setWidth] = useState(getWidth);

  useEffect(() => {
    const onResize = () => setWidth(getWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    width,
    isPhone: width <= 640,
    isCompact: width <= 768,
    isTablet: width <= 1100,
  };
}
