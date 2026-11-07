import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

export type LocationPosition = [number, number];
export type LocationUpdate = {
  position: LocationPosition;
  accuracy: number;
  timestamp: number;
  speed: number | null;
  simulated: boolean;
};

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
export const nativeTracking = Capacitor.getPlatform() === 'android';

// 호출 즉시 해제 함수를 반환. 권한 창이 열린 사이 취소해도 추적기가 남지 않음.
export function watchLocation(
  onLocation: (update: LocationUpdate) => void,
  onError: (message: string, fatal?: boolean) => void,
): (() => void) | null {
  if (nativeTracking) {
    let cancelled = false;
    let watcherId: string | undefined;
    void (async () => {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
      if (cancelled) return;
      if (permission.display !== 'granted') throw new Error('백그라운드 러닝을 위해 알림 권한을 허용해 주세요.');
      const id = await BackgroundGeolocation.addWatcher({
        backgroundTitle: 'WannaRun 러닝 측정 중',
        backgroundMessage: '화면을 꺼도 위치를 기록해요. 앱에서 종료하면 측정이 멈춰요.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      }, (location, error) => {
        if (cancelled) return;
        if (error) {
          onError(error.code === 'NOT_AUTHORIZED'
            ? '앱 설정에서 정확한 위치 권한을 허용해 주세요.' : error.message,
            error.code === 'NOT_AUTHORIZED');
          return;
        }
        if (location) onLocation({
          position: [location.latitude, location.longitude],
          accuracy: location.accuracy,
          timestamp: location.time ?? Date.now(),
          speed: location.speed,
          simulated: location.simulated,
        });
      });
      if (cancelled) await BackgroundGeolocation.removeWatcher({ id });
      else watcherId = id;
    })().catch(error => { if (!cancelled) onError(error instanceof Error ? error.message : '위치 서비스를 시작하지 못했어요.', true); });
    return () => {
      cancelled = true;
      if (watcherId) void BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
  }
  if (!navigator.geolocation) {
    onError('이 브라우저에서는 위치 기능을 사용할 수 없어요.');
    return null;
  }
  const id = navigator.geolocation.watchPosition(({ coords, timestamp }) => onLocation({
    position: [coords.latitude, coords.longitude], accuracy: coords.accuracy,
    timestamp, speed: coords.speed, simulated: false,
  }), error => onError(({
    1: '사이트 설정에서 위치 권한을 허용해 주세요.',
    2: '기기의 위치 서비스를 켜 주세요.',
    3: '위치 수신을 기다리고 있어요. GPS가 잘 잡히는 곳으로 이동해 주세요.',
  } as Record<number, string>)[error.code] ?? '위치를 확인하지 못했어요.', error.code === 1),
  { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  return () => navigator.geolocation.clearWatch(id);
}
