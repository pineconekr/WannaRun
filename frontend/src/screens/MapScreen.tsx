// 담당: 김근형
// 지도·GPS·데모 러닝. 측정은 RunningSession, 저장은 종료 화면에서 처리.
import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import TerritoryLayer from '../components/map/TerritoryLayer';
import { SpeedChart } from '../components/SpeedChart';
import { watchLocation, nativeTracking, type LocationPosition } from '../services/location';
import { RunningSession, createRoutePlayer, distanceBetween, type RunResult } from '../services/tracking';
import { duration } from '../services/runRecords';
import { CUSTOM_DEMO_ROUTE_EVENT, CUSTOM_DEMO_ROUTE_KEY, readCustomDemoRoute, saveCustomDemoRoute } from '../services/customDemoRoute';
import { SUYEONG_A_ROUND_TRIP } from '../services/suyeongACourse';
export type { RunResult } from '../services/tracking';

type Position = LocationPosition;

function MapViewport({ position, route, active }: { position: Position | null; route: Position[]; active: boolean }) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (position) map.panTo(position, { animate: false });
    else if (!active && route.length > 1) map.fitBounds(route, { padding: [24, 24], maxZoom: 16 });
  }, [map, position, route, active]);
  return null;
}

function RoutePicker({ enabled, onPick }: { enabled: boolean; onPick: (p: Position) => void }) {
  useMapEvents({ click: event => { if (enabled) onPick([event.latlng.lat, event.latlng.lng]); } });
  return null;
}

export default function MapScreen({ onFinish, preview = false, onPrepare, visible = true }: {
  onFinish?: (result: RunResult) => void; preview?: boolean; onPrepare?: () => void; visible?: boolean;
}) {
  const [route, setRoute] = useState<Position[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(CUSTOM_DEMO_ROUTE_KEY) ?? '[]');
      return Array.isArray(value) && value.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        ? (value.length > 1 ? value : SUYEONG_A_ROUND_TRIP)
        : SUYEONG_A_ROUND_TRIP;
    } catch { return SUYEONG_A_ROUND_TRIP; }
  });
  const [selecting, setSelecting] = useState(false);
  const [message, setMessage] = useState('위치 권한을 허용한 뒤 러닝을 시작해 주세요.');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [territoryEnabled, setTerritoryEnabled] = useState(true);
  const [territories, setTerritories] = useState(0);
  const [territoryReset, setTerritoryReset] = useState(0);
  const [confirmTerritoryReset, setConfirmTerritoryReset] = useState(false);
  const [, render] = useState(0);
  const session = useRef<RunningSession | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const position = useRef<Position | null>(null);
  const simulatedClock = useRef(0);
  const simulatedGps = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const run = session.current;
  const phase = run?.phase ?? 'ready';
  const active = phase === 'running' || phase === 'paused';
  const elapsed = run?.elapsed(run.source === 'demo' ? simulatedClock.current : Date.now()) ?? 0;
  const path = React.useMemo(() => run?.path.slice() ?? [], [run, run?.path.length]);
  const pathSegments = React.useMemo(() => run?.pathSegments.map(segment => segment.slice()) ?? [], [run, run?.path.length]);
  // 다른 탭에 있는 동안에는 측정만 계속하고 지도·통계 화면은 다시 그리지 않음.
  const draw = () => { if (visibleRef.current) render(value => value + 1); };

  useEffect(() => { if (visible) render(value => value + 1); }, [visible]);
  useEffect(() => {
    const updateRoute = () => setRoute(readCustomDemoRoute());
    window.addEventListener(CUSTOM_DEMO_ROUTE_EVENT, updateRoute);
    return () => window.removeEventListener(CUSTOM_DEMO_ROUTE_EVENT, updateRoute);
  }, []);
  useEffect(() => {
    if (!active || !visible) return;
    const tick = window.setInterval(draw, 1000);
    const refresh = () => draw();
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(tick); document.removeEventListener('visibilitychange', refresh); };
  }, [active, visible]);
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
  useEffect(() => () => cleanup.current?.(), []);

  function saveRoute(next: Position[]) {
    setRoute(next);
    try {
      saveCustomDemoRoute(next);
    }
    catch { setMessage('경로를 브라우저에 저장하지 못했어요.'); }
  }

  function finish() {
    const current = session.current;
    if (!current || current.phase === 'finished') return;
    cleanup.current?.(); cleanup.current = null;
    const result = current.finish(current.source === 'demo' ? simulatedClock.current : Date.now());
    if (simulatedGps.current) result.source = 'demo';
    setConfirmEnd(false);
    draw();
    onFinish?.(result);
  }

  function startGps() {
    if (active) return;
    const current = new RunningSession('gps');
    session.current = current;
    simulatedGps.current = false;
    position.current = null;
    setMessage('GPS 위치를 기다리고 있어요. 정확도 50m 이내 위치만 기록해요.');
    setSelecting(false);
    cleanup.current = watchLocation(update => {
      if (current !== session.current) return;
      // 모의 위치로 측정된 기록은 실제 순위에 포함하지 않음.
      if (update.simulated) simulatedGps.current = true;
      if (current.ingest(update)) {
        position.current = update.position;
        if (visibleRef.current) setMessage(`위치 수신 중 · 정확도 약 ${Math.round(update.accuracy)}m`);
        draw();
      }
    }, (error, fatal) => {
      if (current !== session.current) return;
      setMessage(error);
      if (fatal && current.points > 0) finish();
      else if (fatal) {
        cleanup.current?.(); cleanup.current = null;
        session.current = null;
        draw();
      }
    });
    if (!cleanup.current) session.current = null;
    draw();
  }

  function startDemo() {
    if (active || route.length < 2) return;
    const current = new RunningSession('demo');
    session.current = current;
    simulatedClock.current = current.started;
    setSelecting(false);
    setMessage('데모 이동 · 걷는 속도로 환산하며 순위에서는 제외해요.');
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
    if (run.phase === 'paused') run.resume(now); else run.pause(now);
    draw();
  }

  return <div className="wr-tracker">
    {!preview && <>
      <h2>{phase === 'running' ? '러닝 진행 중' : phase === 'paused' ? '일시정지' : '러닝 준비'}</h2>
      <p className="wr-notice" role="status">{message}</p>
      {!active ? <div className="wr-actions">
        <button className="wr-primary-button" onClick={startGps}>GPS 러닝 시작</button>
        <button className="wr-secondary-button" onClick={() => setSelecting(!selecting)}>{selecting ? '경로 지정 완료' : '지도에서 경로 지정'}</button>
        <button className="wr-secondary-button" disabled={selecting || route.length < 2} onClick={startDemo}>데모 이동</button>
        {route.length > 0 && <button className="wr-secondary-button" onClick={() => saveRoute([])}>경로 지우기</button>}
      </div> : <>
        <dl className="wr-stats" aria-label="실시간 러닝 통계">
          <div><dt>활동 시간</dt><dd>{duration(Math.floor(elapsed))}</dd></div>
          <div><dt>거리</dt><dd>{((run?.distance ?? 0) / 1000).toFixed(2)} <small>km</small></dd></div>
          <div><dt>현재 초속</dt><dd>{(run?.speed ?? 0).toFixed(2)} <small>m/s</small></dd></div>
          <div><dt>현재 시속</dt><dd>{((run?.speed ?? 0) * 3.6).toFixed(1)} <small>km/h</small></dd></div>
        </dl>
        <div className="wr-actions">
          <button className="wr-secondary-button" onClick={togglePause}>{phase === 'paused' ? '계속 달리기' : '일시정지'}</button>
          <button className="wr-primary-button" onClick={() => setConfirmEnd(true)}>러닝 종료</button>
        </div>
      </>}
      {confirmEnd && <div className="wr-notice" role="alert"><p>러닝을 종료하고 결과를 확인할까요?</p><div className="wr-actions">
        <button className="wr-secondary-button" onClick={() => setConfirmEnd(false)}>취소</button>
        <button className="wr-primary-button" onClick={finish}>종료하고 결과 보기</button>
      </div></div>}
      {selecting && <p className="wr-description">지도에서 출발점과 도착점을 포함해 두 곳 이상 찍어 주세요. 현재 {route.length}곳.</p>}
      <div className="wr-territory-controls">
        <button className="wr-text-button" aria-pressed={territoryEnabled} onClick={() => setTerritoryEnabled(!territoryEnabled)}>땅따먹기 {territoryEnabled ? '켜짐' : '꺼짐'} · {territories}칸</button>
        {territories > 0 && !active && <button className="wr-text-button" onClick={() => setConfirmTerritoryReset(true)}>점령 기록 지우기</button>}
      </div>
      {!territoryEnabled && <p className="wr-muted wr-territory-hint">꺼 두면 지도에 표시하지 않고 이번 러닝은 점령하지 않아요. 기존 기록은 그대로 남아요.</p>}
      {confirmTerritoryReset && !active && <div className="wr-notice" role="alert"><p>점령한 {territories}칸을 모두 지울까요? 지운 기록은 되돌릴 수 없어요.</p><div className="wr-actions">
        <button className="wr-secondary-button" onClick={() => setConfirmTerritoryReset(false)}>취소</button>
        <button className="wr-secondary-button" onClick={() => { setTerritoryReset(value => value + 1); setConfirmTerritoryReset(false); }}>기록 지우기</button>
      </div></div>}
    </>}
    <div className="wr-tracker-map">
      <MapContainer center={[35.1688, 129.1258]} zoom={16} style={{ height: '100%', width: '100%' }}>
        <MapViewport position={position.current} route={route} active={active} />
        <RoutePicker enabled={selecting} onPick={p => saveRoute([...route, p])} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {!preview && <TerritoryLayer route={path} segments={pathSegments} hasFinishedRun={phase === 'finished'} enabled={territoryEnabled} resetToken={territoryReset} onTerritoryCountChange={setTerritories} />}
        {route.length > 1 && !active && <Polyline positions={route} color="#176b4a" dashArray="6 6" />}
        {route.map((p, i) => <CircleMarker key={i} center={p} radius={5}><Popup>{i === 0 ? '출발점' : `경유지 ${i}`}</Popup></CircleMarker>)}
        {position.current && <CircleMarker center={position.current} radius={7}><Popup>현재 위치</Popup></CircleMarker>}
        {pathSegments.map((segment, i) => segment.length > 1 && <Polyline key={i} positions={segment} color="#176b4a" />)}
      </MapContainer>
    </div>
    {preview ? <button className="wr-primary-button" onClick={onPrepare}>러닝 준비하기</button>
      : <><p className="wr-notice">{nativeTracking ? 'Android 앱: 위치·알림 권한을 허용하면 화면 잠금 중에도 측정해요. 앱 강제 종료는 지원하지 않아요.' : '웹: 화면을 켜고 페이지를 열어 두세요. 화면 잠금 중 측정은 Android 앱을 이용해 주세요.'}</p>
        {run && run.samples.length > 0 && <SpeedChart samples={run.samples} />}</>}
  </div>;
}
