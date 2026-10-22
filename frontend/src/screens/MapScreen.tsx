// 담당: 김근형
// 지도·현재 위치·이동 궤적 표시
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

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
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [map]);
  return null;
}

type Position = [number, number];

function MapFollower({ position }: { position: Position | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }, [map, position]);

  return null;
}

const MapScreen = () => {
  const mapCenter: [number, number] = [35.1688, 129.1258];
  const [position, setPosition] = useState<Position | null>(null);
  const [runningPath, setRunningPath] = useState<Position[]>([]);
  const [locationMessage, setLocationMessage] = useState('현재 위치를 확인하고 있습니다. 브라우저의 위치 권한을 허용해 주세요.');

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationMessage('이 브라우저에서는 위치 기능을 사용할 수 없습니다.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const nextPosition: Position = [coords.latitude, coords.longitude];
        setPosition(nextPosition);
        setRunningPath((path) => {
          const lastPosition = path[path.length - 1];
          if (lastPosition && lastPosition[0] === nextPosition[0] && lastPosition[1] === nextPosition[1]) {
            return path;
          }
          return [...path, nextPosition];
        });
        setLocationMessage(`실시간 위치를 표시 중입니다. 정확도 약 ${Math.round(coords.accuracy)}m`);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: '위치 권한이 거부되었습니다. 브라우저 사이트 설정에서 위치 권한을 허용해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. 기기의 위치 서비스를 확인해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        };
        setLocationMessage(messages[error.code] ?? '현재 위치를 확인하지 못했습니다.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div style={{ width: '100%', height: '100vh', padding: '20px', boxSizing: 'border-box' }}>
        <h2>실시간 러닝 경로</h2>
        <div style={{ width: '100%', height: 'calc(100vh - 100px)', marginTop: '10px' }}>
          <p role="status" style={{ margin: '0 0 8px', fontSize: '14px' }}>{locationMessage}</p>
          <MapContainer
            center={mapCenter}
            zoom={16}
            style={{ height: '100%', width: '100%' }}
          >
            <MapInvalidator />
            <MapFollower position={position} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {position && <Marker position={position}>
              <Popup>
                현재 위치입니다.
              </Popup>
            </Marker>}
            {runningPath.length > 1 && <Polyline positions={runningPath} color="red" weight={5} />}
          </MapContainer>
        </div>
      </div>
    </>
  );
};

export default MapScreen;
