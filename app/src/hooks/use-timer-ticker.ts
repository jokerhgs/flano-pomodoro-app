import { useEffect } from "react";
import { useTimer } from "../stores/timer";

export function useTimerTicker() {
  const tick = useTimer((s) => s.tick);
  const status = useTimer((s) => s.status);
  useEffect(() => {
    const id = window.setInterval(() => {
      void tick();
    }, 500);
    return () => window.clearInterval(id);
  }, [tick, status]);
}
