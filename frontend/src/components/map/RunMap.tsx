// 러닝 화면 지도. 시계가 1초마다 바뀌어도 지도는 위치·경로·칸이 바뀔 때만 다시 그립니다.
import React, { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import TerritoryLayer from './TerritoryLayer';
import { DEFAULT_CENTER, MAX_ZOOM, MapTiles } from './MapTiles';
import { HexIcon } from '../ui';
import type { Position, Territory } from '../../services/territory';

/** 위치가 가운데 영역을 벗어날 때만 따라갑니다. 화면 밖이면 바로 옮기고, GPS는 부드럽게 미끄러집니다. */
function MapViewport({ position, smooth, route, showPlan }: { position: Position | null; smooth: boolean; route: Position[]; showPlan: boolean }) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (showPlan && !position && route.length > 1) map.fitBounds(route, { padding: [24, 24], maxZoom: 16 });
  }, [map, position, route, showPlan]);
  useEffect(() => {
    if (!position) return;
    const bounds = map.getBounds();
    if (bounds.pad(-0.25).contains(position)) return;
    const glide = smooth && bounds.contains(position) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.panTo(position, glide ? { animate: true, duration: .35 } : { animate: false });
  }, [map, position, smooth]);
  return null;
}

function RoutePicker({ enabled, onPick }: { enabled: boolean; onPick: (p: Position) => void }) {
  useMapEvents({ click: event => { if (enabled) onPick([event.latlng.lat, event.latlng.lng]); } });
  return null;
}

type Props = {
  cells: Territory;
  fresh?: string[];
  showTerritory: boolean;
  onToggleTerritory: () => void;
  route: Position[];
  showPlan: boolean;
  showWaypoints: boolean;
  selecting: boolean;
  onPick: (p: Position) => void;
  onUndo: () => void;
  segments: Position[][];
  position: Position | null;
  /** 시작 전 미리보기의 위치 오차(m). 있으면 위치 주변에 원으로 보여줍니다. */
  accuracy: number | null;
  smooth: boolean;
};

function RunMap({
  cells, fresh, showTerritory, onToggleTerritory, route, showPlan, showWaypoints,
  selecting, onPick, onUndo, segments, position, accuracy, smooth,
}: Props) {
  const last = route.length - 1;
  // className·interactive는 Leaflet 생성 옵션이라 pathOptions가 아닌 prop으로 넘겨야 실제 SVG에 붙습니다.
  return <div className="wr-map-card wr-run-map">
    <div className="wr-tracker-map">
      <MapContainer center={DEFAULT_CENTER} zoom={16} maxZoom={MAX_ZOOM} attributionControl={false} style={{ height: '100%', width: '100%' }}>
        <MapViewport position={position} smooth={smooth} route={route} showPlan={showPlan} />
        <RoutePicker enabled={selecting} onPick={onPick} />
        <MapTiles />
        {showTerritory && <TerritoryLayer cells={cells} fresh={fresh} />}
        {showPlan && route.length > 1 && <Polyline positions={route} className="wr-route is-plan" interactive={false} />}
        {showWaypoints && route.map((p, i) => <CircleMarker key={`${i}:${i === 0 ? 's' : i === last ? 'e' : 'm'}`} center={p} radius={i === 0 || i === last ? 8 : 6}
          className={i === 0 ? 'wr-waypoint is-start' : 'wr-waypoint'}>
          <Popup>{i === 0 ? '출발' : i === last ? '도착' : `경유지 ${i}`}</Popup>
        </CircleMarker>)}
        {segments.map((segment, i) => segment.length > 1 && <Polyline key={i} positions={segment} className="wr-route" interactive={false} />)}
        {position && accuracy !== null && <Circle center={position} radius={accuracy} className="wr-accuracy" interactive={false} />}
        {position && <CircleMarker center={position} radius={8} className="wr-me"><Popup>현재 위치</Popup></CircleMarker>}
      </MapContainer>
    </div>
    {selecting && <button type="button" className="wr-map-toggle wr-map-undo" disabled={route.length === 0} onClick={onUndo}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
      경로 {route.length}곳 · 되돌리기
    </button>}
    <button type="button" className="wr-map-toggle" aria-pressed={showTerritory} onClick={onToggleTerritory}>
      <HexIcon />
      영토
    </button>
  </div>;
}

export default React.memo(RunMap);
