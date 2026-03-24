import { useEffect, useState } from 'react';
import { useThemeStore } from '../store/themeStore';

export function useDarkMode() {
  const { theme } = useThemeStore();
  const [isSystemDark, setIsSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => {
      setIsSystemDark(event.matches);
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return isSystemDark;
}
