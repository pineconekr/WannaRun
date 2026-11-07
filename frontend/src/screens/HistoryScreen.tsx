import React, { useEffect, useMemo, useState } from 'react';
import { getRunningRecords, saveRunningRecord, type RunRecord } from '../services/api';
import { useAuth } from '../components/AuthProvider';
import { RunStats } from '../components/RunStats';
import { SpeedChart } from '../components/SpeedChart';
import TerritoryMap from '../components/map/TerritoryMap';
import { RetryError } from '../components/ui';
import { pace, readRecords, recordKey, removeRecords, type SavedRun } from '../services/runRecords';
import { cellsAlong, type Position } from '../services/territory';
import type { SpeedSample } from '../services/tracking';
import { formatKm, formatRunDate } from '../services/format';

type Source = 'gps' | 'demo' | 'legacy';
type Item = {
  key: string; source: Source; title: string; startedAt: string; endedAt: string;
  distanceMeters: number; durationSeconds: number; path: Position[]; samples: SpeedSample[]; note: string;
  deviceOnly: boolean; unlisted: boolean;
};
const sourceLabels: Record<Source, string> = { gps: 'GPS', demo: '데모', legacy: '기존 기록' };

function fromServer(run: RunRecord): Item {
  return {
    key: `s-${run.id}`, source: run.source ?? 'legacy', title: run.title || '오늘의 러닝', startedAt: run.started_at, endedAt: run.ended_at,
    distanceMeters: run.distance_m, durationSeconds: run.duration_s, path: run.path ?? [], samples: run.speed_samples ?? [], note: run.note,
    deviceOnly: false, unlisted: false,
  };
}
function fromDevice(record: SavedRun): Item {
  return {
    key: `d-${record.id}`, source: record.source, title: record.title, startedAt: record.startedAt, endedAt: record.endedAt,
    distanceMeters: record.distanceMeters, durationSeconds: record.durationSeconds, path: record.path, samples: record.speedSamples ?? [], note: record.note,
    deviceOnly: true, unlisted: Boolean(record.serverId),
  };
}

function RecordBody({ item }: { item: Item }) {
  const cells = useMemo(() => item.path.length ? cellsAlong([item.path]) : null, [item.path]);
  const cellCount = cells ? Object.keys(cells).length : 0;
  return <div className="wr-record-body">
    {cells && cellCount > 0 && <>
      <TerritoryMap className="wr-record-map" cells={cells} route={item.path} label={`${item.title} 경로와 지나간 칸 ${cellCount}칸을 표시한 지도`} />
      <p className="wr-muted">이 러닝이 지나간 칸 {cellCount.toLocaleString('ko-KR')}칸</p>
    </>}
    <RunStats record={item} />
    <SpeedChart samples={item.samples} />
    {item.note && <p className="wr-record-note">{item.note}</p>}
    <p className="wr-muted">종료 {formatRunDate(item.endedAt)}</p>
    {item.unlisted && <p className="wr-muted">계정에 저장했던 기록이지만 지금 계정 목록에 없어 이 기기 기록으로 보여줘요.</p>}
    {item.source === 'legacy' && <p className="wr-muted">GPS 기록인지 확인할 수 없는 이전 기록이라 랭킹과 통계에서 빠져요.</p>}
    {item.source === 'demo' && <p className="wr-muted">데모 기록이라 랭킹과 통계에서 빠져요.</p>}
  </div>;
}

function RecordCard({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  return <details className="wr-record-card" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <span className="wr-record-head">
        {(item.source !== 'gps' || item.deviceOnly) && <span className="wr-record-badges">
          {item.source !== 'gps' && <span className="wr-map-badge">{sourceLabels[item.source]}</span>}
          {item.deviceOnly && <span className="wr-map-badge">이 기기에만</span>}
        </span>}
        <strong>{item.title}</strong>
        <span className="wr-muted">{formatRunDate(item.startedAt)} · {pace(item)}/km</span>
      </span>
      <span className="wr-record-distance">{formatKm(item.distanceMeters, 2)}<small>km</small></span>
    </summary>
    {open && <RecordBody item={item} />}
  </details>;
}

export default function HistoryScreen({ onStart }: { onStart?: () => void }) {
  const { user, token } = useAuth();
  const [serverRuns, setServerRuns] = useState<RunRecord[] | null>(null);
  const [serverError, setServerError] = useState('');
  const [serverAttempt, setServerAttempt] = useState(0);
  const [records, setRecords] = useState<SavedRun[]>([]);
  const [guestRecords, setGuestRecords] = useState<SavedRun[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Source>('all');
  const [attempt, setAttempt] = useState(0);
  const [moving, setMoving] = useState<{ done: number; total: number } | null>(null);
  const [moveError, setMoveError] = useState('');

  useEffect(() => {
    let active = true;
    let request = 0;
    function refresh() {
      const current = ++request;
      setServerRuns(null);
      setServerError('');
      if (!token) return;
      getRunningRecords(token)
        .then(value => { if (active && request === current) setServerRuns(value); })
        .catch(reason => { if (active && request === current) setServerError(reason instanceof Error ? reason.message : '계정 기록을 불러오지 못했어요.'); });
    }
    refresh();
    window.addEventListener('wannarun:records', refresh);
    return () => { active = false; window.removeEventListener('wannarun:records', refresh); };
  }, [token, serverAttempt]);

  useEffect(() => {
    function refresh() {
      try { setRecords(readRecords(recordKey(user?.id))); setError(''); }
      catch { setRecords([]); setError('이 기기에 저장된 기록을 읽지 못했어요. 기록은 지우지 않았어요.'); }
      try { setGuestRecords(user ? readRecords(recordKey()) : []); }
      catch { setGuestRecords([]); }
    }
    refresh();
    window.addEventListener('wannarun:records', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('wannarun:records', refresh); window.removeEventListener('storage', refresh); };
  }, [user, attempt]);

  // Match only durable IDs, never approximate dates or distances. Server metadata wins.
  const serverIds = new Set(serverRuns?.map(run => run.id));
  const items = [
    ...(serverRuns ?? []).map(fromServer),
    ...records.filter(record => !serverIds.has(record.serverId ?? record.id)).map(fromDevice),
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const sources = (['gps', 'demo', 'legacy'] as const).filter(source => items.some(item => item.source === source));
  const activeFilter = filter !== 'all' && sources.includes(filter) ? filter : 'all';
  const shown = items.filter(item => activeFilter === 'all' || item.source === activeFilter);
  const gpsMeters = items.reduce((sum, item) => sum + (item.source === 'gps' ? item.distanceMeters : 0), 0);
  const loading = Boolean(token) && serverRuns === null && !serverError;

  async function moveGuestRecords() {
    if (!token || moving) return;
    const pending = guestRecords;
    const movedIds: string[] = [];
    setMoveError('');
    setMoving({ done: 0, total: pending.length });
    for (const record of pending) {
      try {
        if (!serverIds.has(record.serverId ?? record.id)) {
          await saveRunningRecord({
            id: record.id, source: record.source, title: record.title, note: record.note, speed_samples: record.speedSamples ?? [],
            started_at: record.startedAt, ended_at: record.endedAt, distance_m: record.distanceMeters,
            duration_s: record.durationSeconds, path: record.path,
          }, token);
        }
        movedIds.push(record.id);
        setMoving({ done: movedIds.length, total: pending.length });
      } catch (reason) {
        setMoveError(`${pending.length - movedIds.length}개를 옮기지 못했어요. ${reason instanceof Error ? reason.message : ''}`.trim());
        break;
      }
    }
    setMoving(null);
    if (movedIds.length) removeRecords(recordKey(), movedIds);
  }

  return <section className="wr-history wr-page" aria-labelledby="history-title">
    <h1 id="history-title">{gpsMeters > 0
      ? <>지금까지 <span className="wr-week-distance">{formatKm(gpsMeters)}</span>km 달렸어요</>
      : '내 러닝 기록'}</h1>

    {user && guestRecords.length > 0 && <div className="wr-notice wr-migrate" role="status">
      <p>로그인 전에 저장한 기록 {guestRecords.length.toLocaleString('ko-KR')}개</p>
      {moveError && <p className="wr-error" role="alert">{moveError}</p>}
      <button type="button" className="wr-primary-button" disabled={Boolean(moving)} onClick={() => void moveGuestRecords()}>
        {moving ? `옮기는 중… ${moving.done}/${moving.total}` : moveError ? '다시 옮기기' : '계정으로 옮기기'}
      </button>
    </div>}

    {sources.length >= 2 && <div className="wr-filters" role="group" aria-label="기록 종류 필터">
      {(['all', ...sources] as const).map(value =>
        <button type="button" key={value} aria-pressed={activeFilter === value} onClick={() => setFilter(value)}>{value === 'all' ? '전체' : sourceLabels[value]}</button>)}
    </div>}

    {serverError && <RetryError message={serverError} onRetry={() => setServerAttempt(value => value + 1)} />}
    {error && <RetryError message={error} onRetry={() => setAttempt(value => value + 1)} />}
    {loading && <p className="wr-notice" role="status">기록을 불러오고 있어요…</p>}
    {!loading && !serverError && !error && items.length === 0 && <div className="wr-empty" role="status">
      <p className="wr-description">아직 기록이 없어요. 첫 러닝을 마치면 경로·페이스·차지한 칸이 여기에 남아요.</p>
      {onStart && <button type="button" className="wr-primary-button" onClick={onStart}>GPS 러닝 시작</button>}
    </div>}
    {shown.map(item => <RecordCard key={item.key} item={item} />)}
  </section>;
}
