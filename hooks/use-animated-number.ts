"use client";

import { useEffect, useState } from "react";

export function useAnimatedNumber(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    let start: number | null = null;
    const from = 0;

    const tick = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}
