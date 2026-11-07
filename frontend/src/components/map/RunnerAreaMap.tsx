// 러너가 달린 지역을 약 2km 칸 단위 마커로 보여주고, 가까운 마커는 묶어서 표시합니다.
import React, { useEffect, useState } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import { divIcon, marker, markerClusterGroup, type MarkerCluster } from 'leaflet';
import 'leaflet.markercluster';
import { useAuth } from '../AuthProvider';
import { authRequest } from '../../services/auth';
import { DEFAULT_CENTER, MAX_ZOOM, MapTiles } from './MapTiles';

type Area = { lat: number; lng: number; runs: number };

const pinSize = (runs: number) => runs >= 10 ? 'is-l' : runs >= 3 ? 'is-m' : 'is-s';

function AreaClusters({ areas }: { areas: Area[] }) {
  const map = useMap();
  useEffect(() => {
    const group = markerClusterGroup({
      maxClusterRadius: 56,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      disableClusteringAtZoom: 14,
      iconCreateFunction: (cluster: MarkerCluster) => divIcon({
        className: 'wr-area-cluster',
        html: `<span>${cluster.getChildCount()}</span>`,
        iconSize: [44, 44],
      }),
    });
    for (const area of areas) {
      group.addLayer(marker([area.lat, area.lng], {
        keyboard: false,
        icon: divIcon({ className: `wr-area-pin ${pinSize(area.runs)}`, html: '<span></span>', iconSize: [28, 28] }),
      }).bindPopup(`이 근처를 ${area.runs}번 달렸어요`));
    }
    map.addLayer(group);
    const fit = () => {
      map.invalidateSize();
      if (areas.length) map.fitBounds(group.getBounds(), { padding: [36, 36], maxZoom: 13, animate: false });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => { observer.disconnect(); map.removeLayer(group); };
  }, [map, areas]);
  return null;
}

export default function RunnerAreaMap({ userId, username }: { userId: string; username: string }) {
  const { token } = useAuth();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setAreas(null);
    setError('');
    authRequest<{ areas: Area[] }>(`/users/${encodeURIComponent(userId)}/areas`, {}, token ?? undefined)
      .then(value => { if (active) setAreas(value.areas); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '활동 지역을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [userId, token, attempt]);

  if (error) return <div className="wr-error" role="alert">{error}<button type="button" className="wr-secondary-button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></div>;
  if (areas === null) return <p className="wr-notice" role="status">{username}님의 활동 지역을 불러오고 있어요…</p>;
  if (areas.length === 0) return <p className="wr-description">{username}님은 아직 GPS로 달린 지역이 없어요.</p>;
  return <>
    <div className="wr-territory-map wr-area-map" role="group" aria-label={`${username}님의 활동 지역 지도, ${areas.length}곳`}>
      <MapContainer center={DEFAULT_CENTER} zoom={12} maxZoom={MAX_ZOOM} attributionControl={false} zoomControl={false}
        scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <MapTiles />
        <AreaClusters areas={areas} />
      </MapContainer>
    </div>
    <p className="wr-muted">경로 대신 약 2km 범위로만 보여줘요. 묶인 숫자는 지역 수예요.</p>
  </>;
}
