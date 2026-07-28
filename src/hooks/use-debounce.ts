import { useEffect, useState } from "react";

/**
 * Debounce util reutilizável — não recria timers desnecessariamente e é
 * SSR-safe (usa `useState`/`useEffect` do React sem globais).
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
