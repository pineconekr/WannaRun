// 랭킹 한 줄. 누르면 그 러너의 활동 지역 지도가 아래에 펼쳐집니다.
import React, { Suspense, lazy } from 'react';
import { formatKm } from '../services/format';

// 지도 묶음(Leaflet·markercluster)은 처음 펼칠 때만 불러옵니다.
const RunnerAreaMap = lazy(() => import('./map/RunnerAreaMap'));

export type RankingEntry = { rank: number; user_id: string; username: string; total_distance_m: number };

type Props = {
  entry: RankingEntry;
  self: boolean;
  meta?: string;
  open: boolean;
  onToggle: () => void;
};

export function RankingItem({ entry, self, meta, open, onToggle }: Props) {
  const panelId = `runner-area-${entry.user_id}`;
  return <li className="wr-ranking-item">
    <button type="button" className={`wr-ranking-row${entry.rank <= 3 ? ' is-podium' : ''}${self ? ' is-self' : ''}`}
      aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle}>
      <span className="wr-rank-number"><span className="wr-sr">순위 </span>{entry.rank}<span className="wr-sr">위</span></span>
      <span className="wr-ranking-person">
        <span className="wr-ranking-name"><strong>{entry.username}</strong>{self && <span className="wr-self-label">나</span>}</span>
        {meta && <span className="wr-muted">{meta}</span>}
      </span>
      <span className="wr-rank-distance">{formatKm(entry.total_distance_m, 1)}<small>km</small></span>
      <span className="wr-rank-chevron" aria-hidden="true" />
    </button>
    {open && <div id={panelId} className="wr-runner-area">
      <Suspense fallback={<p className="wr-notice" role="status">{entry.username}님의 활동 지역을 불러오고 있어요…</p>}>
        <RunnerAreaMap userId={entry.user_id} username={entry.username} />
      </Suspense>
    </div>}
  </li>;
}
