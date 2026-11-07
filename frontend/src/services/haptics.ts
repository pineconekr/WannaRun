// 달리는 중 휴대폰을 보지 않아도 알 수 있게 짧은 진동으로 순간을 알립니다.
// 패턴마다 의미가 하나씩이며, 데모 러닝과 화면이 숨겨진 상태에서는 울리지 않습니다.

export const HAPTIC = {
  gpsLock: 15,
  newCell: 12,
  pause: 30,
  resume: [15, 60, 15],
  kmSplit: [20, 80, 20],
  rankPassed: [30, 60, 30, 60, 60],
} as const;

let last = 0;

/** minGapMs 안에 다시 부르면 무시해 진동이 겹치지 않게 합니다. */
export function buzz(pattern: number | readonly number[], minGapMs = 1500) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator) || document.hidden) return;
  const now = performance.now();
  if (now - last < minGapMs) return;
  last = now;
  navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
}
