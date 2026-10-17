import { useCallback, useEffect, useState } from 'react';

// Light or dark: follows the system until the user picks one, then remembers it.
// index.html applies the stored choice before the first paint, so there's no flash.

export type Theme = 'light' | 'dark';
const KEY = 'planary-theme';

function stored(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function effective(): Theme {
  return stored() ?? (darkQuery().matches ? 'dark' : 'light');
}

/** The current theme and a toggle that switches to the other one. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(effective);

  useEffect(() => {
    // Follow the system while nothing is stored.
    const mq = darkQuery();
    const onChange = () => setTheme(effective());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page view.
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}
