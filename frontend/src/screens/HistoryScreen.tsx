// 담당: 설지환
// 러닝 기록 목록 화면
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { getRunningRecords, type RunRecord } from '../services/api';

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${String(seconds % 60).padStart(2, '0')}초`;
}

export default function HistoryScreen() {
  const { token } = useAuth();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    getRunningRecords(token)
      .then(value => { if (active) setRuns(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '기록을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [token]);

  return <section className="wr-account" aria-labelledby="history-title">
    <p className="wr-eyebrow">MY RECORDS</p>
    <h1 id="history-title">러닝 기록</h1>
    {!token ? <p className="wr-description">로그인하면 러닝 기록을 볼 수 있어요.</p>
      : error ? <p className="wr-error" role="alert">{error}</p>
      : runs === null ? <p role="status">기록을 불러오고 있어요…</p>
      : runs.length === 0 ? <p className="wr-description">아직 저장된 기록이 없어요.</p>
      : <ul className="wr-run-list">
        {runs.map(run => <li key={run.id} className="wr-profile-card">
          <h2>{new Date(run.started_at).toLocaleString('ko-KR')}</h2>
          <p>{(run.distance_m / 1000).toFixed(2)} km · {formatDuration(run.duration_s)} · 기록 지점 {run.path.length}개</p>
        </li>)}
      </ul>}
  </section>;
}
