import React, { useEffect, useState } from 'react';
import { getRunningRecords, type RunRecord } from '../services/api';
import { useAuth } from '../components/AuthProvider';
import { RunStats } from '../components/RunStats';
import { SpeedChart } from '../components/SpeedChart';
import { readRecords, recordKey, type SavedRun } from '../services/runRecords';

export default function HistoryScreen() {
  const { user, token } = useAuth();
  const [serverRuns, setServerRuns] = useState<RunRecord[] | null>(null);
  const [serverError, setServerError] = useState('');
  const [serverAttempt, setServerAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    function refresh() {
      if (!token) { setServerRuns(null); setServerError(''); return; }
      setServerRuns(null); setServerError('');
      getRunningRecords(token).then(value => { if (active) setServerRuns(value); })
        .catch(reason => { if (active) setServerError(reason instanceof Error ? reason.message : '서버 기록을 불러오지 못했어요.'); });
    }
    refresh(); window.addEventListener('wannarun:records', refresh);
    return () => { active = false; window.removeEventListener('wannarun:records', refresh); };
  }, [token, serverAttempt]);
  const [records, setRecords] = useState<SavedRun[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    function refresh() {
      try { setRecords(readRecords(recordKey(user?.id))); setError(''); }
      catch { setError('기록을 불러오지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); }
    }
    refresh(); window.addEventListener('wannarun:records', refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('wannarun:records', refresh); window.removeEventListener('storage', refresh); };
  }, [user?.id, attempt]);
  const shown = records.filter(record => filter === 'all' || record.source === filter);
  return <section className="wr-history" aria-labelledby="history-title">
    <p className="wr-eyebrow">ONE RUN AT A TIME</p><h1 id="history-title">쌓여가는 나의 발걸음</h1>
    <p className="wr-description">서버 기록과 이 브라우저에 별도로 저장한 기록을 확인해요.</p>
    <h2>서버에 저장한 기록</h2>
    {!token ? <p className="wr-notice">로그인하면 서버 기록을 볼 수 있어요.</p>
      : serverError ? <div className="wr-error" role="alert">{serverError}<button className="wr-secondary-button" onClick={() => setServerAttempt(value => value + 1)}>서버 기록 다시 불러오기</button></div>
      : serverRuns === null ? <p role="status">서버 기록을 불러오고 있어요…</p>
      : serverRuns.length === 0 ? <p className="wr-notice">서버에 저장한 기록이 없어요.</p>
      : serverRuns.map(run => <details className="wr-record-card" key={run.id}>
        <summary><span className="wr-map-badge">서버 저장</span><strong>{new Date(run.started_at).toLocaleString('ko-KR')}</strong><span className="wr-muted">{(run.distance_m / 1000).toFixed(2)} km · 상세 보기</span></summary>
        <RunStats record={{id:run.id, startedAt:run.started_at, endedAt:run.ended_at, distanceMeters:run.distance_m, durationSeconds:run.duration_s, points:run.path.length, source:'gps'}} />
        <p className="wr-description">종료 {new Date(run.ended_at).toLocaleString('ko-KR')} · 기록 지점 {run.path.length}개</p>
      </details>)}
    <h2>이 브라우저의 기록</h2>
    <p className="wr-notice">이름·메모와 데모 결과는 브라우저에 저장해요. 서버 기록과 중복될 수 있으며 자동 동기화되지 않아요.</p>
    <div className="wr-filters" aria-label="기록 종류 필터">{[['all', '전체'], ['gps', 'GPS'], ['demo', '데모']].map(([value, label]) =>
      <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {error ? <div className="wr-error" role="alert">{error}<button className="wr-secondary-button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></div> : <>
      <p className="wr-muted" role="status">총 {shown.length}개의 기록</p>
      {!shown.length && <div className="wr-record-card"><h2>아직 기록이 없어요</h2><p className="wr-description">러닝 탭에서 달리기를 마치고 결과를 저장해 보세요.</p></div>}
      {shown.map(record => <details className="wr-record-card" key={record.id}>
        <summary><span className="wr-map-badge">{record.source === 'demo' ? '데모' : 'GPS'}</span><strong>{record.title}</strong><span className="wr-muted">{new Date(record.startedAt).toLocaleDateString('ko-KR')} · {(record.distanceMeters / 1000).toFixed(2)} km · 상세 보기</span></summary>
        <RunStats record={record} /><p className="wr-description">시작 {new Date(record.startedAt).toLocaleString('ko-KR')}<br />종료 {new Date(record.endedAt).toLocaleString('ko-KR')}</p>
        <SpeedChart samples={record.speedSamples ?? []} />
        {record.note && <p className="wr-record-note">{record.note}</p>}
        {record.source === 'demo' && <p className="wr-notice">지정 경로를 재생한 데모예요. 시간은 걷는 속도로 환산했어요.</p>}
      </details>)}
    </>}
  </section>;
}
