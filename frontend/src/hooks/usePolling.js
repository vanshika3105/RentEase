import { useEffect } from "react";

// Runs `load` immediately and then every `ms` milliseconds. `load` must be memoised (useCallback).
export default function usePolling(load, ms = 10000) {
  useEffect(() => {
    const run = () => load().catch((e) => console.error(e));
    run();
    const t = setInterval(run, ms);
    return () => clearInterval(t);
  }, [load, ms]);
}
