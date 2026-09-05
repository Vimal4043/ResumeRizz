import { useEffect, useState } from "react";

/**
 * Returns true when the user has enabled the OS "prefers-reduced-motion"
 * setting. Honors live changes (e.g. toggling the setting at runtime), so the
 * component can re-render and drop motion without a reload.
 */
export function useReducedMotion() {
  const get = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [reduced, setReduced] = useState(get);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  return reduced;
}
