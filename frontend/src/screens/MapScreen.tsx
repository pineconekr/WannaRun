// 담당: 김근형
// 지도·현재 위치·이동 궤적 표시
import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import TerritoryLayer from '../components/map/TerritoryLayer';
import { watchLocation, type LocationPosition } from '../services/location';
import { saveRunningRecord } from '../services/api';
import { useAuth } from '../components/AuthProvider';

// 마커 이미지 깨짐 방지
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// 지도가 로드된 후 크기를 강제로 재계산하여 하얀 화면을 방지하는 컴포넌트
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [map]);
  return null;
}

type Position = LocationPosition;

function distanceBetween(start: Position, end: Position) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const [startLatitude, startLongitude] = start.map(toRadians);
  const [endLatitude, endLongitude] = end.map(toRadians);
  const latitudeDifference = endLatitude - startLatitude;
  const longitudeDifference = endLongitude - startLongitude;
  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function MapFollower({
  position,
  route,
  hasFinishedRun,
}: {
  position: Position | null;
  route: Position[];
  hasFinishedRun: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (hasFinishedRun && route.length > 1) {
      map.fitBounds(route, { padding: [40, 40], maxZoom: 16, duration: 0.8 });
      return;
    }
    if (position) {
      map.flyTo(position, Math.max(map.getZoom(), 16), { duration: 0.25 });
    }
  }, [map, position, route, hasFinishedRun]);

  return null;
}

function RoutePointPicker({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (point: Position) => void;
}) {
  useMapEvents({
    click(event) {
      if (enabled) onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export type RunResult = {
  id: string; startedAt: string; endedAt: string; durationSeconds: number;
  distanceMeters: number; source: 'gps' | 'demo'; points: number;
};
const MapScreen = ({ onFinish, onServerStatus, preview = false, onPrepare }: { onFinish?: (result: RunResult) => void; onServerStatus?: (message: string) => void; preview?: boolean; onPrepare?: () => void }) => {
  const mapCenter: [number, number] = [35.1688, 129.1258];
  const CUSTOM_ROUTE_STORAGE_KEY = 'wannarun-custom-demo-route-v1';
  const [position, setPosition] = useState<Position | null>(null);
  const [runningPath, setRunningPath] = useState<Position[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDemoPlayback, setIsDemoPlayback] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const pausedRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const pausedMsRef = useRef(0);
  const sourceRef = useRef<'gps' | 'demo'>('gps');
  const pointsRef = useRef(0);
  const startDateRef = useRef(new Date());
  const resetSession = (source: 'gps' | 'demo') => {
    sourceRef.current = source; pausedRef.current = false; setIsPaused(false);
    pausedAtRef.current = null; pausedMsRef.current = 0; pointsRef.current = 0;
    startDateRef.current = new Date();
  };
  const togglePause = () => {
    const now = Date.now();
    if (pausedRef.current) {
      pausedMsRef.current += now - (pausedAtRef.current ?? now);
      pausedAtRef.current = null;
    } else { pausedAtRef.current = now; }
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
    setElapsedSeconds(Math.max(0, activeSeconds()));
    if (sourceRef.current === 'gps') lastPointRef.current = null;
  };
  const activeSeconds = () => Math.floor(((pausedAtRef.current ?? Date.now()) -
    (startedAtRef.current ?? Date.now()) - pausedMsRef.current) / 1000 * elapsedTimeScaleRef.current);
  const [hasFinishedRun, setHasFinishedRun] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [territoryCount, setTerritoryCount] = useState(0);
  const [isTerritoryEnabled, setIsTerritoryEnabled] = useState(true);
  const [customRoute, setCustomRoute] = useState<Position[]>([]);
  const [isSelectingRoute, setIsSelectingRoute] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<Date | null>(null);
  const [runEndedAt, setRunEndedAt] = useState<Date | null>(null);
  const [locationMessage, setLocationMessage] = useState('러닝을 시작하면 GPS 기록을 시작합니다.');
  const stopWatchingLocationRef = useRef<(() => void) | null>(null);
  const simulationIntervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const elapsedTimeScaleRef = useRef(1);
  const lastPointRef = useRef<Position | null>(null);
  const distanceMetersRef = useRef(0);
  // 데모 자동 종료는 이전 렌더의 stopRun을 호출하므로 최신 값은 ref로 읽습니다.
  const runningPathRef = useRef<Position[]>([]);
  const runStartedAtRef = useRef<Date | null>(null);
  const { token } = useAuth();
  runningPathRef.current = runningPath;
  runStartedAtRef.current = runStartedAt;

  useEffect(() => {
    try {
      const savedRoute = window.localStorage.getItem(CUSTOM_ROUTE_STORAGE_KEY);
      if (savedRoute) setCustomRoute(JSON.parse(savedRoute) as Position[]);
    } catch {
      // 저장된 경로가 손상된 경우에도 러닝 화면은 사용할 수 있습니다.
    }
  }, []);

  const saveCustomRoute = (nextRoute: Position[]) => {
    setCustomRoute(nextRoute);
    try {
      window.localStorage.setItem(CUSTOM_ROUTE_STORAGE_KEY, JSON.stringify(nextRoute));
    } catch {
      setLocationMessage('경로를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
    }
  };

  const addCustomRoutePoint = (point: Position) => {
    saveCustomRoute([...customRoute, point]);
  };

  const undoCustomRoutePoint = () => saveCustomRoute(customRoute.slice(0, -1));

  const clearCustomRoute = () => {
    saveCustomRoute([]);
    setIsSelectingRoute(false);
  };

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedSeconds(Math.max(0, activeSeconds()));
      }
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isRunning]);

  useEffect(() => {
    return () => {
      stopWatchingLocationRef.current?.();
      if (simulationIntervalRef.current !== null) {
        window.clearInterval(simulationIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isRunning]);

  const startRun = () => {
    if (stopWatchingLocationRef.current !== null || simulationIntervalRef.current !== null || isRunning) return;
    setIsDemoPlayback(false);
    setIsSelectingRoute(false);
    resetSession('gps');

    setPosition(null);
    setRunningPath([]);
    setElapsedSeconds(0);
    setDistanceMeters(0);
    setHasFinishedRun(false);
    setRunEndedAt(null);
    distanceMetersRef.current = 0;
    lastPointRef.current = null;
    const startTime = new Date();
    elapsedTimeScaleRef.current = 1;
    startedAtRef.current = startTime.getTime();
    setRunStartedAt(startTime);
    setLocationMessage('현재 위치를 확인하고 있어요. 브라우저 위치 권한을 허용해 주세요.');

    const stopWatchingLocation = watchLocation(
      ({ position: nextPosition, accuracy }) => {
        if (pausedRef.current) return;
        pointsRef.current += 1;
        setPosition(nextPosition);
        setLocationMessage(`실시간 위치를 표시 중입니다. 정확도 약 ${Math.round(accuracy)}m`);

        const previousPosition = lastPointRef.current;
        if (!previousPosition) {
          lastPointRef.current = nextPosition;
          setRunningPath([nextPosition]);
          return;
        }

        const segmentMeters = distanceBetween(previousPosition, nextPosition);
        // GPS의 작은 흔들림은 이동 거리와 궤적에 포함하지 않습니다.
        if (segmentMeters < 3) return;

        lastPointRef.current = nextPosition;
        distanceMetersRef.current += segmentMeters;
        setDistanceMeters(distanceMetersRef.current);
        setRunningPath((path) => [...path, nextPosition]);
      },
      setLocationMessage,
    );
    if (!stopWatchingLocation) {
      startedAtRef.current = null;
      setRunStartedAt(null);
      return;
    }

    stopWatchingLocationRef.current = stopWatchingLocation;
    setIsRunning(true);
  };

  const startDemoRun = () => {
    if (isRunning || stopWatchingLocationRef.current !== null || simulationIntervalRef.current !== null) return;
    if (customRoute.length < 2) {
      setLocationMessage('먼저 지도에서 경로를 지정해 주세요. 출발점과 도착점을 포함해 2곳 이상 찍어야 합니다.');
      return;
    }

    setIsDemoPlayback(true);
    setIsSelectingRoute(false);
    resetSession('demo');
    const demoWaypoints = customRoute;
    const demoPath: Position[] = [demoWaypoints[0]];
    for (let index = 1; index < demoWaypoints.length; index += 1) {
      const start = demoWaypoints[index - 1];
      const end = demoWaypoints[index];
      const steps = Math.max(1, Math.ceil(distanceBetween(start, end) / 35));
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        demoPath.push([
          start[0] + (end[0] - start[0]) * ratio,
          start[1] + (end[1] - start[1]) * ratio,
        ]);
      }
    }

    setPosition(null);
    setRunningPath([]);
    setElapsedSeconds(0);
    setDistanceMeters(0);
    setHasFinishedRun(false);
    setRunEndedAt(null);
    distanceMetersRef.current = 0;
    lastPointRef.current = null;
    const startTime = new Date();
    // 경로 재생은 짧게 보여주되 기록 페이스는 일반 러닝 속도에 가깝게 환산합니다.
    const routeLengthMeters = demoWaypoints.slice(1).reduce(
      (total, point, index) => total + distanceBetween(demoWaypoints[index], point),
      0,
    );
    const estimatedWalkSeconds = routeLengthMeters / 1.2;
    const acceleratedPlaybackSeconds = Math.max(1, (demoPath.length - 1) * 0.22);
    elapsedTimeScaleRef.current = estimatedWalkSeconds / acceleratedPlaybackSeconds;
    startedAtRef.current = startTime.getTime();
    setRunStartedAt(startTime);
    setLocationMessage('직접 지정한 경로를 데모로 재생 중입니다. 기록 시간은 걷는 속도에 맞춰 환산합니다.');
    setIsRunning(true);

    let pointIndex = 0;
    const showNextPoint = () => {
      if (pausedRef.current) return;
      const nextPosition = demoPath[pointIndex];
      if (!nextPosition) {
        if (simulationIntervalRef.current !== null) {
          window.clearInterval(simulationIntervalRef.current);
          simulationIntervalRef.current = null;
        }
        stopRun();
        return;
      }

      pointsRef.current += 1;
      setPosition(nextPosition);
      const previousPosition = lastPointRef.current;
      if (!previousPosition) {
        setRunningPath([nextPosition]);
      } else {
        const segmentMeters = distanceBetween(previousPosition, nextPosition);
        distanceMetersRef.current += segmentMeters;
        setDistanceMeters(distanceMetersRef.current);
        setRunningPath((path) => [...path, nextPosition]);
      }
      lastPointRef.current = nextPosition;
      pointIndex += 1;
    };

    showNextPoint();
    simulationIntervalRef.current = window.setInterval(showNextPoint, 220);
  };

  const stopRun = () => {
    const durationSeconds = Math.max(0, activeSeconds());
    onFinish?.({ id: crypto.randomUUID(), startedAt: startDateRef.current.toISOString(),
      endedAt: new Date().toISOString(), durationSeconds, distanceMeters: distanceMetersRef.current,
      source: sourceRef.current, points: pointsRef.current });
    stopWatchingLocationRef.current?.();
    stopWatchingLocationRef.current = null;
    if (simulationIntervalRef.current !== null) {
      window.clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    let finalElapsedSeconds = elapsedSeconds;
    if (startedAtRef.current !== null) {
      finalElapsedSeconds = Math.max(0, activeSeconds());
      setElapsedSeconds(finalElapsedSeconds);
      startedAtRef.current = null;
    }
    const endedAt = new Date();
    setRunEndedAt(endedAt);
    setHasFinishedRun(true);
    setIsRunning(false);
    pausedRef.current = false; setIsPaused(false); pausedAtRef.current = null;
    if (sourceRef.current === 'demo') { onServerStatus?.('데모 결과는 서버에 전송하지 않아요. 아래에서 브라우저에 저장할 수 있어요.'); return; }
    const startedAt = runStartedAtRef.current;
    if (!token || !startedAt) {
      setLocationMessage('러닝 기록을 종료했습니다. 로그인하면 기록이 저장돼요.');
      onServerStatus?.('게스트 기록은 아래에서 브라우저에 저장할 수 있어요.');
      return;
    }
    setLocationMessage('러닝 기록을 저장하고 있어요…');
    onServerStatus?.('서버에 기록을 저장하고 있어요…');
    saveRunningRecord({
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      distance_m: distanceMetersRef.current,
      duration_s: finalElapsedSeconds,
      path: runningPathRef.current,
    }, token)
      .then(() => { setLocationMessage('러닝 기록을 저장했어요.'); onServerStatus?.('서버에 기록을 저장했어요. 이름·메모는 아래에서 이 브라우저에 별도로 저장할 수 있어요.'); window.dispatchEvent(new Event('wannarun:records')); })
      .catch((reason) => { const message = reason instanceof Error ? reason.message : '기록을 저장하지 못했어요.'; setLocationMessage(message); onServerStatus?.(`서버 저장 실패: ${message} 아래에서 브라우저에 저장할 수 있어요.`); });
    pausedRef.current = false; setIsPaused(false); pausedAtRef.current = null;
  };

  const averagePaceSeconds = distanceMeters > 0 && elapsedSeconds > 0 ? elapsedSeconds / (distanceMeters / 1000) : null;
  const averagePace = averagePaceSeconds === null
    ? '--:-- /km'
    : `${Math.floor(averagePaceSeconds / 60)}:${String(Math.floor(averagePaceSeconds % 60)).padStart(2, '0')} /km`;
  const formatClockTime = (date: Date | null) => date
    ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
    : '--:--:--';

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div className="wr-tracker" style={{ width: '100%', height: 'auto', padding: '16px', boxSizing: 'border-box' }}>
        <h2 style={{ margin: '0 0 8px' }}>{isRunning ? (isPaused ? '잠시 숨을 고르세요' : '지금, 나의 속도로') : '나의 러닝 경로'}</h2>
        {preview ? <button className="wr-primary-button" onClick={onPrepare}>러닝 화면에서 경로 확인하기 →</button> : <div style={{ marginBottom: '10px' }}>
          <p role="status" style={{ margin: '0 0 8px', fontSize: '14px' }}>{locationMessage}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button type="button" onClick={startRun} disabled={isRunning}>
              GPS 러닝 시작
            </button>
            <button
              type="button"
              onClick={() => setIsSelectingRoute((selecting) => !selecting)}
              disabled={isRunning}
            >
              {isSelectingRoute ? '경로 지정 완료' : '지도에서 경로 지정'}
            </button>
            <button type="button" onClick={undoCustomRoutePoint} disabled={isRunning || customRoute.length === 0}>
              마지막 점 취소
            </button>
            <button type="button" onClick={clearCustomRoute} disabled={isRunning || customRoute.length === 0}>
              경로 지우기
            </button>
            <button type="button" onClick={startDemoRun} disabled={isRunning || isSelectingRoute || customRoute.length < 2}>
              데모 이동
            </button>
            <button
              type="button"
              onClick={() => setIsTerritoryEnabled((enabled) => !enabled)}
              aria-pressed={isTerritoryEnabled}
            >
              땅따먹기 {isTerritoryEnabled ? '켜짐' : '꺼짐'}
            </button>
            <button type="button" onClick={togglePause} disabled={!isRunning}>{isPaused ? '계속 달리기' : '일시정지'}</button>
            <button type="button" onClick={() => setConfirmEnd(true)} disabled={!isRunning}>
              러닝 종료
            </button>
          </div>
          {confirmEnd && <div className="wr-notice" role="alert">
            <p>러닝을 종료하고 결과를 확인할까요?</p>
            <div className="wr-actions"><button onClick={() => setConfirmEnd(false)}>계속 달리기</button><button onClick={() => { setConfirmEnd(false); stopRun(); }}>종료하고 결과 보기</button></div>
          </div>}
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#52616b' }}>
            {isSelectingRoute
              ? `지도에서 출발점부터 길의 굴곡마다 클릭해 경유지를 찍으세요. (${customRoute.length}곳)`
              : `직접 지정한 경로 ${customRoute.length}곳 · 땅따먹기 ${isTerritoryEnabled ? '켜짐: 지나간 타일을 점령해요.' : '꺼짐: 점령 기록을 초기화하고 멈춰요.'}`}
          </p>
          <div aria-label="러닝 기록" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <span>활동 시간 <strong>{formatDuration(elapsedSeconds)}</strong></span>
            <span>거리 {(distanceMeters / 1000).toFixed(2)} km</span>
            <span>평균 페이스 {averagePace}</span>
            <span>점령한 영역 {territoryCount}칸</span>
          </div>
          {hasFinishedRun && (
            <section
              aria-live="polite"
              style={{
                marginTop: '12px',
                padding: '12px 16px',
                border: '1px solid #d8d8d8',
                borderRadius: '8px',
                backgroundColor: '#f7f7f7',
              }}
            >
              <h3 style={{ margin: '0 0 8px' }}>러닝 결과</h3>
              <p style={{ margin: '4px 0' }}>시작 {formatClockTime(runStartedAt)} · 종료 {formatClockTime(runEndedAt)}</p>
              <p style={{ margin: '4px 0' }}>이동 거리 {(distanceMeters / 1000).toFixed(2)} km · 시간 {formatDuration(elapsedSeconds)}</p>
              <p style={{ margin: '4px 0' }}>평균 페이스 {averagePace} · 기록 지점 {runningPath.length}개</p>
            </section>
          )}
        </div>}
        <div style={{ width: '100%', height: '320px', marginTop: '10px' }}>
          <MapContainer
            center={mapCenter}
            zoom={16}
            style={{ height: '100%', width: '100%' }}
          >
            <MapInvalidator />
            <MapFollower position={position} route={runningPath} hasFinishedRun={hasFinishedRun} />
            <RoutePointPicker enabled={isSelectingRoute} onPick={addCustomRoutePoint} />
            <TerritoryLayer
              route={runningPath}
              hasFinishedRun={hasFinishedRun}
              enabled={isTerritoryEnabled}
              onTerritoryCountChange={setTerritoryCount}
            />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {customRoute.length > 1 && runningPath.length === 0 && !isRunning && (
              <Polyline positions={customRoute} color="#1769ff" weight={4} dashArray="8 8" />
            )}
            {(!isDemoPlayback || hasFinishedRun) && customRoute.map((point, index) => (
              <CircleMarker
                key={`route-point-${index}`}
                center={point}
                radius={index === 0 || index === customRoute.length - 1 ? 8 : 5}
                pathOptions={{
                  color: '#ffffff',
                  weight: 2,
                  fillColor: index === 0 ? '#168653' : index === customRoute.length - 1 ? '#e54343' : '#1769ff',
                  fillOpacity: 1,
                }}
              >
                <Popup>{index === 0 ? '출발점' : index === customRoute.length - 1 ? '도착점' : `경유지 ${index}`}</Popup>
              </CircleMarker>
            ))}
            {position && <Marker position={position}>
              <Popup>
                현재 위치입니다.
              </Popup>
            </Marker>}
            {runningPath.length > 1 && (!isDemoPlayback || hasFinishedRun) && (
              <Polyline positions={runningPath} color="red" weight={5} />
            )}
          </MapContainer>
        </div>
      </div>
    </>
  );
};

export default MapScreen;
