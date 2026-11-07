// 달리는 중 시간. 1초 갱신을 이 칸 하나에 가둬 지도·계기판 전체가 매초 다시 그려지지 않게 합니다.
import React, { useEffect, useState } from 'react';
import { clock } from '../services/runRecords';
import type { RunningSession } from '../services/tracking';

/** now: 경과 시간을 잴 시각. 데모는 재생 시계를, GPS는 Date.now를 넘깁니다. */
export function LiveClock({ run, now }: { run: RunningSession; now: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (run.phase !== 'running') return;
    const redraw = () => tick(value => value + 1);
    const timer = window.setInterval(redraw, 1000);
    // 화면을 껐다 켜면 interval이 밀려 있으므로 바로 다시 계산합니다.
    document.addEventListener('visibilitychange', redraw);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', redraw); };
  }, [run, run.phase]);
  return <>{run.waiting ? '—:—' : clock(run.elapsed(now()))}</>;
}
