// 담당: 김근형
// 지도·GPS·데모 러닝. 측정은 RunningSession, 저장은 종료 화면에서 처리.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RunMap from '../components/map/RunMap';
import { LiveClock } from '../components/LiveClock';
import { SpeedChart } from '../components/SpeedChart';
import { InlineConfirm } from '../components/ui';
import { useAuth } from '../components/AuthProvider';
import type { RankingEntry } from '../components/RankingItem';
import { authRequest } from '../services/auth';
import { formatGap, formatKm } from '../services/format';
import { HAPTIC, buzz } from '../services/haptics';
import { nativeTracking, previewLocation, watchLocation, type LocationPosition } from '../services/location';
import { MAX_ACCURACY_M, RunningSession, createRoutePlayer, distanceBetween, type RunResult } from '../services/tracking';
import { clock, pace } from '../services/runRecords';
import { cellsAlong, claimTerritory, useTerritory, type Claim, type Territory } from '../services/territory';
import { CUSTOM_DEMO_ROUTE_EVENT, readCustomDemoRoute, saveCustomDemoRoute } from '../services/customDemoRoute';
import { SUYEONG_A_ROUND_TRIP } from '../services/suyeongACourse';
export type { RunResult } from '../services/tracking';

type Position = LocationPosition;
const NO_CELLS: Territory = {};
// 이보다 느리면 페이스가 의미 없는 값(수십 분/km)이 되므로 표시하지 않습니다.
const MIN_PACE_SPEED_MPS = 0.5;
// 이보다 짧으면 영토·기록으로 남기지 않습니다.
const MIN_CLAIM_METERS = 50;
const NOTICE_HOLD_MS = 8000;
const STALE_FIX_S = 10;

type Preview = { kind: 'idle' } | { kind: 'searching' } | { kind: 'fix'; position: Position; accuracy: number };
/** 이번 주 랭킹 추격: 출발 시점의 내 주간 거리 기준으로 앞 순위까지 남은 거리. 앞에 아무도 없으면 1위를 지키는 중. */
type Chase = { targets: { rank: number; gap: number }[]; passed: number | null };

function signalBucket(accuracy: number) {
  return accuracy <= 10 ? '좋음' : accuracy <= 25 ? '보통' : '약함';
}

function previewCopy(preview: Preview) {
  if (preview.kind === 'idle') return '시작을 누르면 위치 권한을 물어봐요.';
  if (preview.kind === 'searching') return 'GPS 신호를 찾고 있어요…';
  // 오차는 5m 단위로만 바꿔 읽어 주는 문장이 매초 흔들리지 않게 합니다.
  const meters = Math.max(5, Math.round(preview.accuracy / 5) * 5);
  return preview.accuracy <= 20 ? `GPS 준비됐어요 · 오차 약 ${meters}m`
    : `GPS 신호가 약해요 · 오차 약 ${meters}m · 트인 곳에서 잠시 기다려 주세요`;
}

type Props = {
  /** claim은 기록할 만큼 움직이지 않은 러닝(50m 미만)이면 null이고, 영토에도 더하지 않습니다. */
  onFinish: (result: RunResult, claim: Claim | null) => void;
  /** 켜지면 바로 GPS 러닝을 시작하고 onAutoStarted로 알립니다. */
  autoStart?: boolean;
  onAutoStarted?: () => void;
  onActiveChange?: (active: boolean) => void;
  /** 러닝 탭이 보이는 동안만 시작 전 GPS 미리보기를 켭니다. */
  visible: boolean;
  /** 달리는 중 새로 지난 칸 수. 러닝이 아니면 0. */
  onLiveClaim?: (count: number) => void;
};

export default function MapScreen({ onFinish, autoStart = false, onAutoStarted, onActiveChange, visible, onLiveClaim }: Props) {
  const { token, user } = useAuth();
  const [route, setRoute] = useState<Position[]>(() => {
    const saved = readCustomDemoRoute();
    return saved.length > 1 ? saved : SUYEONG_A_ROUND_TRIP;
  });
  const [selecting, setSelecting] = useState(false);
  const [preview, setPreview] = useState<Preview>({ kind: 'idle' });
  // 준비 화면에서 미리보기 문구보다 먼저 알려야 할 일(권한 거부, 경로 저장 실패 등).
  const [readyNote, setReadyNote] = useState('');
  const [message, setMessage] = useState('');
  const [stale, setStale] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showTerritory, setShowTerritory] = useState(true);
  const [liveCells, setLiveCells] = useState<Territory>(NO_CELLS);
  const [chase, setChase] = useState<Chase | null>(null);
  const territory = useTerritory();
  const [, render] = useState(0);
  const session = useRef<RunningSession | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const position = useRef<Position | null>(null);
  const simulatedClock = useRef(0);
  const simulatedGps = useRef(false);
  const lastFixAt = useRef(0);
  const liveCursor = useRef({ segment: 0, point: 0 });
  const liveCellsRef = useRef<Territory>(NO_CELLS);
  const chaseRef = useRef<Chase | null>(null);
  const split = useRef({ km: 0, at: 0 });
  // 상태 문구: 같은 상태가 이어지면 다시 읽지 않고, km 통과 같은 알림은 8초 동안 덮어쓰지 않습니다.
  const status = useRef({ key: '', text: '', holding: false, timer: 0 });
  const lastFresh = useRef(0);
  const lastBucket = useRef('');
  const liveRef = useRef<HTMLElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const run = session.current;
  const phase = run?.phase ?? 'ready';
  const active = phase === 'running' || phase === 'paused';
  const searching = active && Boolean(run?.waiting);
  const segmentCount = run?.pathSegments.length ?? 0;
  const pathLength = run?.path.length ?? 0;
  // 끝난 구간은 그대로 두고 지금 그리는 구간만 복사해 새 점이 Polyline에 반영되게 합니다.
  const pathSegments = useMemo(() => run?.pathSegments.map((segment, i, all) => i === all.length - 1 ? segment.slice() : segment) ?? [],
    [run, segmentCount, pathLength]);
  const liveFresh = useMemo(() => Object.keys(liveCells).filter(key => !(key in territory)), [liveCells, territory]);
  const mapCells = useMemo(() => active ? { ...territory, ...liveCells } : territory, [active, territory, liveCells]);
  const freshCount = active ? liveFresh.length : 0;

  function draw() { render(value => value + 1); }

  function say(text: string, key = text) {
    const current = status.current;
    if (key === current.key) return;
    current.key = key;
    current.text = text;
    if (!current.holding) setMessage(text);
  }

  function announce(text: string) {
    const current = status.current;
    window.clearTimeout(current.timer);
    current.holding = true;
    setMessage(text);
    current.timer = window.setTimeout(() => { current.holding = false; setMessage(current.text); }, NOTICE_HOLD_MS);
  }

  /** 데모·모의 위치에서는 진동하지 않습니다. */
  function haptic(pattern: number | readonly number[], minGapMs?: number) {
    if (session.current?.source === 'gps' && !simulatedGps.current) buzz(pattern, minGapMs);
  }

  function resetStatus(text: string) {
    const current = status.current;
    window.clearTimeout(current.timer);
    status.current = { key: text, text, holding: false, timer: 0 };
    setMessage(text);
  }

  function updateChase(next: Chase | null) {
    chaseRef.current = next;
    setChase(next);
  }

  useEffect(() => { if (visible) render(value => value + 1); }, [visible]);
  useEffect(() => {
    const updateRoute = () => setRoute(readCustomDemoRoute());
    window.addEventListener(CUSTOM_DEMO_ROUTE_EVENT, updateRoute);
    return () => window.removeEventListener(CUSTOM_DEMO_ROUTE_EVENT, updateRoute);
  }, []);
  useEffect(() => {

    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
  useEffect(() => () => { cleanup.current?.(); window.clearTimeout(status.current.timer); }, []);
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  useEffect(() => {
    if (!autoStart) return;
    onAutoStarted?.();
    startGps();
  }, [autoStart]);

  // 시작 전 GPS 미리보기: 탭이 보이고 러닝 중이 아닐 때만.
  useEffect(() => {
    if (!visible || active) return;
    return previewLocation(
      update => setPreview({ kind: 'fix', position: update.position, accuracy: update.accuracy }),
      error => { if (error.fatal) setPreview({ kind: 'idle' }); },
      available => setPreview(available ? { kind: 'searching' } : { kind: 'idle' }),
    );
  }, [visible, active]);

  // 러닝이 시작되면 계기판을 화면 안으로 가져옵니다.
  useEffect(() => {
    if (!active || !visible || !run || scrolledFor.current === run.id) return;
    scrolledFor.current = run.id;
    liveRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [active, visible, run]);

  // 새 칸을 지날 때마다 진동하고, 바깥(홈 HUD 등)에 지금까지 새 칸 수를 알립니다.
  useEffect(() => {
    if (freshCount > lastFresh.current) haptic(HAPTIC.newCell, 2000);
    lastFresh.current = freshCount;
    onLiveClaim?.(freshCount);
  }, [freshCount]);

  // GPS 위치가 10초 넘게 오지 않으면 알립니다.
  useEffect(() => {
    if (phase !== 'running' || run?.source !== 'gps') return;
    const timer = window.setInterval(() => {
      const current = session.current;
      if (!current || current.phase !== 'running' || current.waiting) return;
      const seconds = (Date.now() - lastFixAt.current) / 1000;
      if (seconds <= STALE_FIX_S) return;
      const shown = Math.floor(seconds / 10) * 10;
      setStale(true);
      say(`신호 약함 · 마지막 위치 ${shown}초 전`, `stale:${shown}`);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, run]);

  // 웹은 화면이 꺼지면 위치가 끊기므로, 달리는 동안 화면을 켜 둡니다.
  useEffect(() => {
    if (nativeTracking || phase !== 'running' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock.request('screen').then(sentinel => {
        if (released) void sentinel.release(); else lock = sentinel;
      }, () => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { released = true; document.removeEventListener('visibilitychange', acquire); void lock?.release(); };
  }, [phase]);

  function saveRoute(next: Position[]) {
    setRoute(next);
    try { saveCustomDemoRoute(next); }
    catch { setReadyNote('경로를 저장하지 못했어요. 이번 데모에는 그대로 쓸 수 있어요.'); }
  }
  const pickPoint = useCallback((p: Position) => saveRoute([...route, p]), [route]);
  const undoPoint = useCallback(() => saveRoute(route.slice(0, -1)), [route]);
  const toggleTerritory = useCallback(() => setShowTerritory(value => !value), []);

  /** 새로 들어온 점만 칸으로 바꿔 지금까지의 칸에 더합니다. */
  function extendLiveCells(current: RunningSession) {
    const cursor = liveCursor.current;
    const segments = current.pathSegments;
    let added: Territory | null = null;
    while (cursor.segment < segments.length) {
      const segment = segments[cursor.segment];
      if (segment.length > cursor.point) {
        // 직전 점부터 이어야 두 점 사이를 지난 칸도 빠지지 않습니다.
        const cells = cellsAlong([segment.slice(Math.max(0, cursor.point - 1))]);
        for (const key in cells) if (!(key in liveCellsRef.current) && !(added && key in added)) (added ??= {})[key] = cells[key];
        cursor.point = segment.length;
      }
      if (cursor.segment === segments.length - 1) break;
      cursor.segment += 1;
      cursor.point = 0;
    }
    if (added) {
      liveCellsRef.current = { ...liveCellsRef.current, ...added };
      setLiveCells(liveCellsRef.current);
    }
  }

  /** 위치가 기록된 뒤: 칸, km 통과, 랭킹 추격. */
  function afterMove(current: RunningSession, timestamp: number) {
    extendLiveCells(current);
    const km = Math.floor(current.distance / 1000);
    if (km > split.current.km) {
      const elapsed = current.elapsed(timestamp);
      announce(`${km}km 통과 · 이번 1km ${clock(elapsed - split.current.at)}`);
      split.current = { km, at: elapsed };
      haptic(HAPTIC.kmSplit, 0);
    }
    const target = chaseRef.current?.targets[0];
    if (chaseRef.current && target && current.distance > target.gap) {
      announce(`${target.rank}위 거리 돌파 · 저장하면 ${target.rank}위`);
      haptic(HAPTIC.rankPassed, 0);
      updateChase({ ...chaseRef.current, targets: chaseRef.current.targets.slice(1), passed: target.rank });
    }
  }

  function beginSession(current: RunningSession, text: string) {
    session.current = current;
    position.current = null;
    liveCursor.current = { segment: 0, point: 0 };
    liveCellsRef.current = NO_CELLS;
    lastBucket.current = '';
    setLiveCells(NO_CELLS);
    split.current = { km: 0, at: 0 };
    updateChase(null);
    setStale(false);
    setConfirmEnd(false);
    setSelecting(false);
    setReadyNote('');
    resetStatus(text);
  }

  function finish() {
    const current = session.current;
    if (!current || current.phase === 'finished') return;
    cleanup.current?.(); cleanup.current = null;
    const result = current.finish(current.source === 'demo' ? simulatedClock.current : Date.now());
    if (simulatedGps.current) result.source = 'demo';
    const claim = result.distanceMeters < MIN_CLAIM_METERS ? null : claimTerritory(current.pathSegments);
    setConfirmEnd(false);
    resetStatus('');
    draw();
    onFinish(result, claim);
  }

  function loadChase(current: RunningSession) {
    if (!token || !user) return;
    authRequest<{ entries: RankingEntry[] }>('/leaderboard?period=week', {}, token).then(board => {
      if (session.current !== current || current.phase === 'finished' || simulatedGps.current) return;
      const mine = board.entries.find(entry => entry.user_id === user.id);
      const base = mine?.total_distance_m ?? 0;
      const targets = board.entries
        .filter(entry => entry.user_id !== user.id && entry.total_distance_m > base)
        .map(entry => ({ rank: entry.rank, gap: entry.total_distance_m - base }))
        .sort((a, b) => a.gap - b.gap);
      // 앞 순위가 없으면 1위일 때만 보여줍니다(이번 주 기록이 아무도 없으면 숨김).
      if (!targets.length && mine?.rank !== 1) return;
      updateChase({ targets, passed: null });
    }, () => { /* 랭킹을 못 불러오면 추격 줄만 숨깁니다. */ });
  }

  function startGps() {
    if (session.current && (session.current.phase === 'running' || session.current.phase === 'paused')) return;
    const current = new RunningSession('gps');
    simulatedGps.current = false;
    beginSession(current, 'GPS 신호를 찾고 있어요…');
    cleanup.current = watchLocation(update => {
      if (current !== session.current) return;
      // 모의 위치로 측정된 기록은 실제 순위에 포함하지 않음.
      if (update.simulated && !simulatedGps.current) { simulatedGps.current = true; updateChase(null); }
      const first = current.waiting;
      if (!current.ingest(update)) {
        if (current.phase === 'running' && update.accuracy > MAX_ACCURACY_M) say(`GPS 신호가 약해요 · 오차 약 ${Math.round(update.accuracy)}m`, 'rejected');
        return;
      }
      lastFixAt.current = Date.now();
      setStale(false);
      position.current = update.position;
      const bucket = signalBucket(update.accuracy);
      lastBucket.current = bucket;
      if (first) {
        haptic(HAPTIC.gpsLock);
        say('GPS 연결됨 · 출발해도 좋아요', bucket);
      } else say(`GPS 신호 ${bucket}`, bucket);
      afterMove(current, update.timestamp);
      draw();
    }, error => {
      if (current !== session.current) return;
      if (error.fatal) {
        if (current.points > 0) { finish(); setReadyNote(error.message); return; }
        cleanup.current?.(); cleanup.current = null;
        session.current = null;
        resetStatus('');
        setReadyNote(error.message);
        draw();
        return;
      }
      if (current.phase !== 'running') return;
      if (error.signal && current.points > 0) say('GPS 신호가 끊겼어요. 다시 잡히면 이어서 기록해요.', 'lost');
      else say(error.message, `error:${error.message}`);
    }, notice => { if (current === session.current) announce(notice); });
    if (!cleanup.current) { session.current = null; return; }
    loadChase(current);
    draw();
  }

  function startDemo() {
    if (active || route.length < 2) return;
    const current = new RunningSession('demo');
    simulatedClock.current = current.started;
    beginSession(current, '데모 재생 중 · 랭킹에는 들어가지 않아요.');
    const nextPoint = createRoutePlayer(route);
    let previous: Position | null = null;
    const tick = () => {
      if (current.phase !== 'running') return;
      const point = nextPoint();
      if (!point) { finish(); return; }
      const travelled = previous ? distanceBetween(previous, point) : 0;
      simulatedClock.current += Math.max(1, travelled / 1.2 * 1000);
      current.ingest({ position: point, accuracy: 1, timestamp: simulatedClock.current, speed: previous ? 1.2 : 0, simulated: true });
      previous = point;
      position.current = point;
      afterMove(current, simulatedClock.current);
      draw();
    };
    tick();
    const timer = window.setInterval(tick, 150);
    cleanup.current = () => window.clearInterval(timer);
    draw();
  }

  function togglePause() {
    if (!run) return;
    const now = run.source === 'demo' ? simulatedClock.current : Date.now();
    if (run.phase === 'paused') {
      run.resume(now);
      lastFixAt.current = Date.now();
      haptic(HAPTIC.resume, 0);
      // 신호 상태와 같은 키로 두어, 다음 위치가 같은 신호면 이 문구를 바로 덮지 않습니다.
      say('다시 기록하고 있어요', lastBucket.current || 'resumed');
    } else {
      run.pause(now);
      setStale(false);
      haptic(HAPTIC.pause, 0);
      say('일시정지 중 · 시간과 거리를 멈춰 두었어요', 'paused');
    }
    draw();
  }

  const distance = run?.distance ?? 0;
  const currentSpeed = run?.speed ?? 0;
  const livePace = currentSpeed >= MIN_PACE_SPEED_MPS ? pace({ distanceMeters: currentSpeed, durationSeconds: 1 }) : '—';
  const here = active && position.current ? Object.keys(cellsAlong([[position.current]]))[0] : null;
  const liveLabel = phase === 'paused' ? '일시정지' : searching ? '위치 찾는 중'
    : here && here in territory ? '내 땅 위를 달리는 중' : '새 땅 개척 중';
  const nowFor = run?.source === 'demo' ? () => simulatedClock.current : Date.now;
  const mapPosition = active ? position.current ?? (searching && preview.kind === 'fix' ? preview.position : null)
    : preview.kind === 'fix' ? preview.position : null;
  const target = chase?.targets[0];
  const demoHint = route.length === 0 ? '지도를 눌러 출발점을 찍어 주세요.'
    : route.length === 1 ? '다음 지점을 하나 더 찍어 주세요.' : `${route.length}곳 찍었어요. 더 찍거나 바로 달려 보세요.`;
  const confirm = distance < 100
    ? { message: `아직 ${formatKm(distance, 2)}km예요. 지금 끝내면 기록할 거리가 거의 없어요.`, confirmLabel: '그래도 종료' }
    : { message: liveFresh.length > 0 ? `지금 끝내면 +${liveFresh.length.toLocaleString('ko-KR')}칸이 내 땅이 돼요.` : '러닝을 끝내고 결과를 볼까요?', confirmLabel: '끝내고 결과 보기' };

  const liveClass = ['wr-live', phase === 'paused' && 'is-paused', searching && 'is-searching', stale && phase === 'running' && 'is-stale'].filter(Boolean).join(' ');

  return <div className="wr-tracker">
    {active && run && <section ref={liveRef} className={liveClass} aria-label="실시간 러닝">
      <p className="wr-live-status"><span className="wr-live-dot" aria-hidden="true" />{liveLabel}</p>
      <dl className="wr-live-stats">
        <div className="wr-live-distance"><dt>거리</dt><dd>{formatKm(distance, 2)}<small>km</small></dd></div>
        <div><dt>시간</dt><dd><LiveClock run={run} now={nowFor} /></dd></div>
        <div><dt>현재 페이스</dt><dd>{livePace}<small>/km</small></dd></div>
        <div className="wr-live-claim"><dt>새 영토</dt>
          <dd key={liveFresh.length} className={liveFresh.length ? 'is-up' : 'is-zero'}>+{liveFresh.length.toLocaleString('ko-KR')}<small>칸</small></dd>
        </div>
      </dl>
      {chase && <div className="wr-chase">
        {target ? <>
          <p className="wr-chase-label">
            <span>{target.rank}위까지 {formatGap(target.gap - distance)}</span>
            <small>출발 시점 기준</small>
          </p>
          <div className="wr-chase-track" aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(1, distance / target.gap)})` }} /></div>
        </> : <p className="wr-chase-label">
          <span>{chase.passed ? `${chase.passed}위 거리 돌파 · 저장하면 ${chase.passed}위` : '1위를 지키는 중'}</span>
        </p>}
      </div>}
      {searching && !nativeTracking && <p className="wr-live-hint">화면을 켜 둔 채로 달려 주세요</p>}
      <p className="wr-live-message" role="status">{message}</p>
      {confirmEnd ? <InlineConfirm className="wr-live-confirm" message={confirm.message}
        cancelLabel="계속 달리기" confirmLabel={confirm.confirmLabel}
        onCancel={() => setConfirmEnd(false)} onConfirm={finish} />
      : <div className="wr-actions">
        <button className="wr-primary-button" onClick={togglePause}>{phase === 'paused' ? '계속 달리기' : '일시정지'}</button>
        <button className="wr-secondary-button" onClick={() => setConfirmEnd(true)}>러닝 종료</button>
      </div>}
    </section>}
    <RunMap cells={mapCells} fresh={active ? liveFresh : undefined} showTerritory={showTerritory} onToggleTerritory={toggleTerritory}
      route={route} showPlan={!active} showWaypoints={!active || run?.source === 'demo'}
      selecting={selecting} onPick={pickPoint} onUndo={undoPoint} segments={pathSegments}
      position={mapPosition} accuracy={!active && preview.kind === 'fix' ? preview.accuracy : null}
      smooth={run?.source !== 'demo'} />
    {!active && <>
      <p className="wr-status" role="status">{readyNote || previewCopy(preview)}</p>
      <button className="wr-primary-button wr-start-button" onClick={startGps}>
        GPS 러닝 시작
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5Z" /></svg>
      </button>
      <details className="wr-demo" onToggle={event => { if (!event.currentTarget.open) setSelecting(false); }}>
        <summary>데모 경로로 미리 달려보기</summary>
        <p className="wr-muted">지도에 두 곳 이상 찍으면 걷는 속도로 경로를 재생해요. 데모는 랭킹에서 제외돼요.</p>
        {selecting && <p className="wr-demo-hint" role="status">{demoHint}</p>}
        <div className="wr-actions">
          {selecting && route.length >= 2 && <button className="wr-primary-button" onClick={startDemo}>이 경로로 데모 달리기</button>}
          <button className="wr-secondary-button" aria-pressed={selecting} onClick={() => setSelecting(!selecting)}>{selecting ? '경로 지정 완료' : '지도에서 경로 지정'}</button>
          {!selecting && <button className="wr-secondary-button" disabled={route.length < 2} onClick={startDemo}>데모 달리기 시작</button>}
          {route.length > 0 && <button className="wr-secondary-button" onClick={() => saveRoute([])}>경로 지우기</button>}
        </div>
      </details>
    </>}
    {active && visible && run && run.samples.length > 0 && <SpeedChart samples={run.samples} />}
    <p className="wr-footnote">{nativeTracking ? '위치·알림 권한을 허용하면 화면을 꺼도 계속 기록해요. 앱을 완전히 종료하면 기록이 멈춰요.' : '웹에서는 화면이 꺼지면 기록이 멈춰요. 화면을 끄고 달리려면 Android 앱을 써 주세요.'}</p>
  </div>;
}
