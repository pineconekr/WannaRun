// 숫자를 0에서 목표값까지 ease-out expo로 올립니다. 모션을 줄이는 설정이면 바로 목표값을 보여줍니다.
import { useEffect, useState } from 'react';

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** start가 true가 되는 순간부터 durationMs 동안 target까지 셉니다. */
export function useCountUp(target: number, start: boolean, durationMs = 900): number {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced || target <= 0) { setValue(target); return; }
    if (!start) { setValue(0); return; }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / durationMs);
      setValue(Math.round(target * easeOutExpo(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, start, durationMs, reduced]);

  return value;
}
