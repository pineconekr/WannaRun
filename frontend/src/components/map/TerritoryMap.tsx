// 영토를 보여주는 고정 지도. 홈·러닝 결과·프로필에서 씁니다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, useMap } from 'react-leaflet';
import { latLngBounds, type LeafletEvent, type Path } from 'leaflet';
import TerritoryLayer from './TerritoryLayer';
import { DEFAULT_CENTER, MAX_ZOOM, MapTiles } from './MapTiles';
import type { Position, Territory } from '../../services/territory';

function FitToContent({ points }: { points: Position[] }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (points.length) map.fitBounds(latLngBounds(points), { padding: [28, 28], maxZoom: 17, animate: false });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, points]);
  return null;
}

type Props = {
  cells: Territory;
  fresh?: string[];
  route?: Position[];
  label: string;
  className?: string;
  /** 바탕 타일이 그려져 영토 등장 모션이 시작될 때 한 번 불립니다. */
  onReady?: () => void;
};

// 타일이 늦게 오거나 끝내 오지 않아도 영토는 이 시간 뒤에 드러납니다.
const READY_FALLBACK_MS = 1200;

// 경로를 그리는 애니메이션이 길이와 상관없이 같은 속도로 끝나도록 SVG 경로 길이를 1로 맞춥니다.
const drawHandlers = {
  add: (event: LeafletEvent) => { (event.target as Path).getElement()?.setAttribute('pathLength', '1'); },
};

export default function TerritoryMap({ cells, fresh, route, label, className = '', onReady }: Props) {
  const [ready, setReady] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const markReady = useRef(() => setReady(true)).current;

  useEffect(() => {
    const timer = window.setTimeout(markReady, READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [markReady]);

  useEffect(() => { if (ready) onReadyRef.current?.(); }, [ready]);

  const points = useMemo(() => {
    const focus = fresh?.length ? fresh.map(key => cells[key]).filter(Boolean) : Object.values(cells);
    const corners = focus.flatMap(cell => cell.positions);
    return corners.length ? corners : route ?? [];
  }, [cells, fresh, route]);

  // data-ready 전에는 영토 등장·경로 그리기 모션이 멈춰 있어 빈 회색 바탕 위에서 끝나 버리지 않습니다.
  return <div className={`wr-territory-map ${className}`} role="group" aria-label={label} data-ready={ready || undefined}>
    <MapContainer center={DEFAULT_CENTER} zoom={15} maxZoom={MAX_ZOOM} attributionControl={false} zoomControl={false}
      dragging={false} touchZoom={false} scrollWheelZoom={false} doubleClickZoom={false} boxZoom={false} keyboard={false}
      style={{ height: '100%', width: '100%' }}>
      <FitToContent points={points} />
      <MapTiles onLoad={markReady} />
      {route && route.length > 1 && <Polyline positions={route} className="wr-route is-draw" interactive={false} eventHandlers={drawHandlers} />}
      <TerritoryLayer cells={cells} fresh={fresh} stagger />
    </MapContainer>
  </div>;
}
