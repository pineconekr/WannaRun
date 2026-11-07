import React, { useEffect, useRef, useState } from 'react';
import MapScreen, { type RunResult } from './MapScreen';
import { useAuth } from '../components/AuthProvider';
import { pace, readRecords, recordKey, saveRecord } from '../services/runRecords';
import { getRunningRecords, saveRunningRecord, updateRunningRecord, type RunRecord } from '../services/api';
import { ApiError, authRequest } from '../services/auth';
import type { Claim } from '../services/territory';
import { formatGap, formatKm, formatRunDate, runTitle } from '../services/format';
import { HAPTIC, buzz } from '../services/haptics';
import { RunStats } from '../components/RunStats';
import { SpeedChart, thinSamples } from '../components/SpeedChart';
import TerritoryMap from '../components/map/TerritoryMap';
import { CellCount, InlineConfirm } from '../components/ui';
import { useCountUp } from '../hooks/useCountUp';
import type { RunStatus } from './HomeTab';

type Props = {
  onHistory: () => void;
  /** 홈에서 시작을 누를 때마다 커지는 번호. */
  startRequest: number;
  onStatusChange: (status: RunStatus) => void;
  visible: boolean;
  onLiveClaim: (count: number) => void;
};

type WeekBoard = { entries: { rank: number; user_id: string; total_distance_m: number }[] };
/** 이번 러닝을 저장했을 때의 이번 주 순위 예상. */
type RankImpact = { before: number | null; after: number; weekMeters: number; ahead: { rank: number; gap: number } | null };

// 서버가 받는 경로·속도 표본 수의 상한.
const UPLOAD_LIMIT = 20_000;
const MILESTONES = [1000, 500, 100, 50];

function thinPath<T>(path: T[]): T[] {
  if (path.length <= UPLOAD_LIMIT) return path;
  const stride = (path.length - 1) / (UPLOAD_LIMIT - 1);
  return Array.from({ length: UPLOAD_LIMIT }, (_, index) => path[Math.round(index * stride)]);
}

function defaultTitle(run: RunResult) {
  return run.source === 'demo' ? '데모 러닝' : runTitle(run.startedAt);
}

function rankImpact(board: WeekBoard, userId: string, meters: number): RankImpact {
  const mine = board.entries.find(entry => entry.user_id === userId);
  const weekMeters = (mine?.total_distance_m ?? 0) + meters;
  const others = board.entries.filter(entry => entry.user_id !== userId);
  const after = 1 + others.filter(entry => entry.total_distance_m > weekMeters).length;
  // 저장 뒤에도 앞에 있는 가장 가까운 러너.
  const next = others.filter(entry => entry.total_distance_m > weekMeters)
    .reduce<WeekBoard['entries'][number] | null>((best, entry) => !best || entry.total_distance_m < best.total_distance_m ? entry : best, null);
  return { before: mine?.rank ?? null, after, weekMeters, ahead: next ? { rank: after - 1, gap: next.total_distance_m - weekMeters } : null };
}

type PastRun = { distance: number; duration: number };

function personalBest(run: RunResult, past: PastRun[]): string | null {
  if (past.length === 0) return '첫 GPS 러닝이에요';
  const longest = Math.max(...past.map(item => item.distance));
  if (run.distanceMeters > longest) return `지금까지 가장 먼 거리예요 · 이전 최고 ${formatKm(longest, 2)}km`;
  if (run.distanceMeters < 1000 || run.durationSeconds <= 0) return null;
  const paced = past.filter(item => item.distance >= 1000 && item.duration > 0);
  if (paced.length === 0) return null;
  const best = paced.reduce((a, b) => a.duration / a.distance <= b.duration / b.distance ? a : b);
  return run.durationSeconds / run.distanceMeters < best.duration / best.distance
    ? `1km 이상 러닝 중 가장 빠른 페이스예요 · 이전 ${pace({ distanceMeters: best.distance, durationSeconds: best.duration })}/km`
    : null;
}

export default function RunScreen({ onHistory, startRequest, onStatusChange, visible, onLiveClaim }: Props) {
  const { user, token } = useAuth();
  const [result, setResult] = useState<RunResult | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [localCopy, setLocalCopy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [session, setSession] = useState(0);
  const [mapActive, setMapActive] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [impact, setImpact] = useState<RankImpact | null>(null);
  const [best, setBest] = useState<string | null>(null);
  const handledStart = useRef(startRequest);
  const savingRun = useRef<string | null>(null);

  // 기록할 수 없을 만큼 짧은 러닝은 저장할 것이 없어 결과를 들고 있지 않은 상태와 같습니다.
  const pending = Boolean(result && claim && !saved);
  const counted = result && claim && result.source === 'gps' ? result : null;

  useEffect(() => {
    if (startRequest === handledStart.current) return;
    handledStart.current = startRequest;
    // 저장을 마친 결과 화면이면 정리하고 새 러닝을 시작합니다. 저장 전 결과는 홈이 시작을 요청하지 않습니다.
    if (result) reset();
    setAutoStart(true);
  }, [startRequest]);

  useEffect(() => {
    onStatusChange(pending ? 'result' : result ? 'ready' : mapActive ? 'active' : 'ready');
  }, [pending, result, mapActive, onStatusChange]);

  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  // 계정 러너는 끝나자마자 이번 주 순위가 어떻게 바뀔지 한 번 확인합니다.
  useEffect(() => {
    if (!counted || !token || !user) return;
    let active = true;
    authRequest<WeekBoard>('/leaderboard?period=week', {}, token)
      .then(board => { if (active) setImpact(rankImpact(board, user.id, counted.distanceMeters)); })
      .catch(() => { /* 순위 예상은 덧붙이는 정보라 실패해도 결과 화면은 그대로입니다. */ });
    return () => { active = false; };
  }, [counted?.id]);

  useEffect(() => {
    if (!counted) return;
    let active = true;
    const past: Promise<PastRun[]> = token
      ? getRunningRecords(token).then(runs => runs.filter(run => run.source === 'gps' && run.id !== counted.id)
        .map(run => ({ distance: run.distance_m, duration: run.duration_s })))
      : Promise.resolve().then(() => readRecords(recordKey(user?.id)).filter(run => run.source === 'gps' && run.id !== counted.id)
        .map(run => ({ distance: run.distanceMeters, duration: run.durationSeconds })));
    past.then(runs => { if (active) setBest(personalBest(counted, runs)); })
      .catch(() => { /* 비교할 기록을 못 읽으면 칩을 보이지 않습니다. */ });
    return () => { active = false; };
  }, [counted?.id]);

  function reset() {
    savingRun.current = null;
    setResult(null); setClaim(null); setSaved(false); setSaving(false); setError(''); setLocalCopy(false);
    setConfirmDiscard(false); setTitle(''); setNote(''); setNoteOpen(false); setMapReady(false);
    setImpact(null); setBest(null); setSession(value => value + 1);
  }

  async function save() {
    if (!result || savingRun.current !== null) return;
    savingRun.current = result.id;
    setSaving(true); setError('');
    const metadata = { title: title.trim() || defaultTitle(result), note: note.trim() };
    try {
      if (token && !localCopy) {
        let stored: RunRecord;
        try {
          stored = await saveRunningRecord({
            id: result.id, started_at: result.startedAt, ended_at: result.endedAt,
            distance_m: result.distanceMeters, duration_s: result.durationSeconds,
            path: thinPath(result.path), source: result.source, speed_samples: thinSamples(result.speedSamples, UPLOAD_LIMIT),
            ...metadata,
          }, token);
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 422) throw new Error('기록이 너무 길어 계정에 올리지 못했어요. 이 기기에 저장할 수 있어요.');
          throw reason;
        }
        if (stored.title !== metadata.title || stored.note !== metadata.note) {
          await updateRunningRecord(stored.id, metadata, token);
        }
        window.dispatchEvent(new Event('wannarun:records'));
        if (savingRun.current !== result.id) return;
        setResult(current => current?.id === result.id ? { ...current, serverId: stored.id } : current);
        if (impact && result.source === 'gps' && (impact.before === null || impact.after < impact.before)) buzz(HAPTIC.rankPassed);
      } else {
        saveRecord(recordKey(user?.id), { ...result, ...metadata });
      }
      if (savingRun.current === result.id) setSaved(true);
    } catch (reason) {
      if (savingRun.current === result.id) setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 결과는 그대로 두었으니 다시 시도해 주세요.');
    } finally {
      if (savingRun.current === result.id) {
        savingRun.current = null;
        setSaving(false);
      }
    }
  }

  const added = claim?.added.length ?? 0;
  const visited = claim ? Object.keys(claim.cells).length : 0;
  const count = useCountUp(added, mapReady);
  const toAccount = Boolean(token && !localCopy);
  const milestone = claim && added ? MILESTONES.find(mark => claim.total - added < mark && claim.total >= mark) : undefined;
  const firstTerritory = Boolean(claim && added && claim.total === added);
  const rankLine = impact && counted && (impact.before === null || impact.after < impact.before)
    ? impact.before === null ? `저장하면 이번 주 ${impact.after}위에 올라요` : `저장하면 이번 주 ${impact.before}위 → ${impact.after}위로 올라가요`
    : impact?.ahead ? `${impact.ahead.rank}위까지 ${formatGap(impact.ahead.gap)} 남았어요` : null;

  const claimSection = result && claim && <section className="wr-claim" aria-labelledby="claim-title">
    <TerritoryMap className="wr-claim-map" cells={claim.cells} fresh={claim.added} route={result.path} onReady={() => setMapReady(true)}
      label={added ? `이번 러닝으로 새로 차지한 ${added}칸을 표시한 지도` : '이번 러닝 경로 지도'} />
    <div className="wr-claim-copy">
      {added ? <>
        <h2 id="claim-title">
          <span aria-hidden="true"><CellCount className="wr-claim-count" value={count} signed /></span>
          <span className="wr-sr">{added.toLocaleString('ko-KR')}칸</span>
          {firstTerritory ? '첫 영토가 생겼어요' : '차지했어요'}
        </h2>
        <p>{firstTerritory ? '앞으로 달리는 길마다 영토가 넓어져요.'
          : milestone ? `영토 ${milestone.toLocaleString('ko-KR')}칸을 넘었어요 · 이제 ${claim.total.toLocaleString('ko-KR')}칸이에요.`
          : <>이제 내 영토는 <CellCount value={claim.total} />이에요.</>}</p>
      </> : <>
        <h2 id="claim-title">이번엔 새로 차지한 칸이 없어요</h2>
        <p>{visited ? `지나간 ${visited.toLocaleString('ko-KR')}칸이 모두 이미 내 땅이었어요. 다음엔 한 블록 옆길로 달려 보세요.`
          : 'GPS 위치를 받지 못해 칸을 차지하지 못했어요.'}</p>
      </>}
      {best && <p className="wr-best-chip">{best}</p>}
    </div>
    {!claim.saved && <div className="wr-error" role="alert"><p>영토를 이 기기에 저장하지 못했어요. 앱을 닫으면 이번 칸이 사라져요. 저장 공간을 확인해 주세요.</p></div>}
  </section>;

  return <section className="wr-run-page" aria-labelledby="run-title">
    <h1 id="run-title">{result ? '러닝 결과' : '러닝'}</h1>
    <div hidden={Boolean(result)} className="wr-running-map">
      <MapScreen key={session} autoStart={autoStart} onAutoStarted={() => setAutoStart(false)} onActiveChange={setMapActive}
        visible={visible && !result} onLiveClaim={onLiveClaim}
        onFinish={(value, nextClaim) => { setResult(value); setClaim(nextClaim); setSaved(false); setTitle(defaultTitle(value)); }} />
    </div>
    {result && !claim && <div className="wr-result">
      <div className="wr-claim-copy">
        <h2>기록하기엔 너무 짧았어요</h2>
        <p>50m 이상 달리면 기록과 영토가 남아요.</p>
      </div>
      <RunStats record={result} />
      <button type="button" className="wr-primary-button" onClick={reset}>다시 준비</button>
    </div>}
    {result && claim && <div className="wr-result">
      {claimSection}
      <span className="wr-map-badge">{result.source === 'demo' ? '데모 · 순위 제외' : 'GPS 측정'}</span>
      <RunStats record={result} />
      <SpeedChart samples={result.speedSamples} averageMps={result.durationSeconds > 0 ? result.distanceMeters / result.durationSeconds : 0} />
      <p className="wr-muted">{formatRunDate(result.startedAt)} 시작</p>
      <form className="wr-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saved || saving}>
          <label htmlFor="run-name">러닝 이름</label>
          <input id="run-name" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} />
          {noteOpen ? <>
            <label htmlFor="run-note">메모 (선택)</label>
            <textarea id="run-note" value={note} maxLength={2000} rows={3} autoFocus onChange={event => setNote(event.target.value)} />
          </> : <button type="button" className="wr-link-button" onClick={() => setNoteOpen(true)}>+ 메모 추가</button>}
          <small>{toAccount ? '경로와 속도 그래프까지 내 계정에 저장해요.'
            : token ? '이 기기에만 저장해요. 계정 기록과 랭킹에는 들어가지 않아요.'
            : '로그인하지 않아 이 기기에만 저장돼요.'}</small>
          {!saved && toAccount && rankLine && <p className="wr-rank-impact">{rankLine}</p>}
          {!saved && <button className="wr-primary-button" type="submit">{saving ? '저장 중…' : toAccount ? '계정에 저장' : '이 기기에 저장'}</button>}
        </fieldset>
      </form>
      {error && <div className="wr-error" role="alert">
        <p>{error}</p>
        {toAccount && <>
          <button type="button" className="wr-secondary-button" disabled={saving} onClick={() => void save()}>계정에 다시 저장</button>
          <button type="button" className="wr-secondary-button" disabled={saving} onClick={() => { setLocalCopy(true); setError(''); }}>이 기기에만 저장 (랭킹 제외)</button>
        </>}
      </div>}
      {saved && <>
        <p className="wr-success" role="status">{toAccount
          ? impact && counted ? `계정에 저장했어요 · 이번 주 ${formatKm(impact.weekMeters)}km, ${impact.after}위` : '계정에 저장했어요.'
          : <>이 기기에 저장했어요 · 내 영토 <CellCount value={claim.total} /></>}</p>
        <button type="button" className="wr-primary-button" onClick={onHistory}>내 기록 보기</button>
      </>}
      {saved
        ? <button type="button" className="wr-secondary-button" onClick={() => { reset(); setAutoStart(true); }}>새 러닝 시작</button>
        : <button type="button" className="wr-secondary-button" disabled={saving} onClick={() => setConfirmDiscard(true)}>저장하지 않고 닫기</button>}
      {confirmDiscard && <InlineConfirm tone="danger" cancelLabel="계속 작성" confirmLabel="결과 버리기"
        message={`저장하지 않은 결과를 버릴까요?${added > 0 ? ` 차지한 영토 ${added.toLocaleString('ko-KR')}칸은 그대로 남아요.` : ''}`}
        onCancel={() => setConfirmDiscard(false)} onConfirm={reset} />}
    </div>}
  </section>;
}
