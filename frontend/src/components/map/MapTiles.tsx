// 모든 지도가 쓰는 바탕 타일. 키 없이 쓸 수 있는 OSM 인도주의(HOT) 스타일은 도로·공원 색이 차분해 귤색 영토와 녹색 경로가 묻히지 않습니다.
// (CARTO Voyager는 2026년 기준 API 키가 필요해 쓰지 않습니다.)
import React from 'react';
import { AttributionControl, TileLayer } from 'react-leaflet';
import type { Position } from '../../services/territory';

export const DEFAULT_CENTER: Position = [35.1688, 129.1258];
export const MAX_ZOOM = 19;

/** onLoad: 보이는 타일이 다 그려지면 한 번 불립니다(예: 영토 등장 모션을 타일 뒤에 시작). */
export function MapTiles({ onLoad }: { onLoad?: () => void }) {
  return <>
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · 타일 <a href="https://www.hotosm.org/">HOT</a> · <a href="https://openstreetmap.fr/">OSM France</a>'
      url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
      subdomains="abc"
      maxZoom={MAX_ZOOM}
      eventHandlers={onLoad ? { load: onLoad } : undefined} />
    <AttributionControl position="bottomright" prefix={false} />
  </>;
}
