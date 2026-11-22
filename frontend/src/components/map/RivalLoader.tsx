// 지도가 보여주는 영역 안의 다른 러너 칸을 받아 옵니다. 로그인했을 때만 받고, 그리는 것은 TerritoryLayer가 합니다.
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { useAuth } from '../AuthProvider';
import { loadRivalArea } from '../../services/territorySync';

// 지도를 움직이는 동안에는 기다렸다가 멈추면 한 번만 받습니다.
const SETTLE_MS = 400;
// 화면 가장자리 바깥도 조금 받아 두어 살짝 움직일 때 빈 곳이 보이지 않게 합니다.
const PAD_RATIO = 0.2;

export default function RivalLoader() {
  const map = useMap();
  const { token } = useAuth();
  useEffect(() => {
    if (!token) return;
    let timer = 0;
    const load = () => {
      const bounds = map.getBounds().pad(PAD_RATIO);
      loadRivalArea(token, {
        south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast(),
      }).catch(() => { /* 다른 러너의 칸은 다음에 지도를 움직이면 다시 받습니다. */ });
    };
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(load, SETTLE_MS); };
    map.whenReady(schedule);
    map.on('moveend', schedule);
    // 러닝을 저장하면 칸 주인이 바뀌었을 수 있으니 다시 받습니다.
    window.addEventListener('wannarun:records', schedule);
    return () => {
      window.clearTimeout(timer);
      map.off('moveend', schedule);
      window.removeEventListener('wannarun:records', schedule);
    };
  }, [map, token]);
  return null;
}
