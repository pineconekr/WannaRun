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
/** fatal: 권한이 없어 더 받을 수 없음. signal: 위치 서비스·신호 문제라 다시 잡히면 이어서 받을 수 있음. */
export type LocationError = { message: string; fatal: boolean; signal: boolean };

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
export const nativeTracking = Capacitor.getPlatform() === 'android';

const BROWSER_ERRORS: Record<number, string> = {
  1: '사이트 설정에서 위치 권한을 허용해 주세요.',
  2: '기기의 위치 서비스를 켜 주세요.',
  3: 'GPS 신호를 기다리고 있어요. 하늘이 트인 곳으로 가 보세요.',
};

function browserWatch(onLocation: (update: LocationUpdate) => void, onError: (error: LocationError) => void) {
  const id = navigator.geolocation.watchPosition(({ coords, timestamp }) => onLocation({
    position: [coords.latitude, coords.longitude], accuracy: coords.accuracy,
    timestamp, speed: coords.speed, simulated: false,
  }), error => onError({
    message: BROWSER_ERRORS[error.code] ?? '위치를 확인하지 못했어요.',
    fatal: error.code === 1,
    signal: error.code === 2 || error.code === 3,
  }), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  return () => navigator.geolocation.clearWatch(id);
}

/**
 * 러닝 측정용 위치 추적. 호출 즉시 해제 함수를 반환해, 권한 창이 열린 사이 취소해도 추적기가 남지 않습니다.
 * onNotice: 측정은 계속하지만 알려야 할 일(예: 알림 권한이 없어 화면이 켜진 동안만 기록).
 */
export function watchLocation(
  onLocation: (update: LocationUpdate) => void,
  onError: (error: LocationError) => void,
  onNotice?: (message: string) => void,
): (() => void) | null {
  if (nativeTracking) {
    let cancelled = false;
    let watcherId: string | undefined;
    void (async () => {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
      if (cancelled) return;
      // 알림이 없으면 백그라운드 서비스를 띄울 수 없으니, 화면이 켜진 동안만 받는 추적으로 이어갑니다.
      const background = permission.display === 'granted';
      if (!background) onNotice?.('알림이 꺼져 있어 화면을 켜 둔 동안만 기록해요.');
      const id = await BackgroundGeolocation.addWatcher({
        ...(background ? {
          backgroundTitle: 'WannaRun 러닝 측정 중',
          backgroundMessage: '화면을 꺼도 위치를 기록해요. 앱에서 종료하면 측정이 멈춰요.',
        } : {}),
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      }, (location, error) => {
        if (cancelled) return;
        if (error) {
          const denied = error.code === 'NOT_AUTHORIZED';
          onError({
            message: denied ? '앱 설정에서 정확한 위치 권한을 허용해 주세요.' : 'GPS 신호를 기다리고 있어요. 하늘이 트인 곳으로 가 보세요.',
            fatal: denied,
            signal: !denied,
          });
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
    })().catch(() => {
      if (!cancelled) onError({ message: '위치 기능을 시작하지 못했어요. 앱을 다시 열어 주세요.', fatal: true, signal: false });
    });
    return () => {
      cancelled = true;
      if (watcherId) void BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
  }
  if (!navigator.geolocation) {
    onError({ message: '이 브라우저에서는 위치 기능을 쓸 수 없어요.', fatal: true, signal: false });
    return null;
  }
  return browserWatch(onLocation, onError);
}

/**
 * 시작 전 GPS 준비 상태 미리보기. 이미 위치 권한이 있을 때만 켜서 권한 창을 먼저 띄우지 않고,
 * Android 앱에서도 알림 권한·백그라운드 서비스 없이 WebView 위치만 씁니다.
 * onAvailability: 권한이 있어 위치를 찾기 시작하면 true, 권한이 없거나 확인할 수 없으면 false.
 */
export function previewLocation(
  onLocation: (update: LocationUpdate) => void,
  onError: (error: LocationError) => void,
  onAvailability: (available: boolean) => void,
): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;
  if (!navigator.geolocation || !navigator.permissions?.query) { onAvailability(false); return () => {}; }
  navigator.permissions.query({ name: 'geolocation' }).then(status => {
    if (cancelled) return;
    onAvailability(status.state === 'granted');
    if (status.state === 'granted') stop = browserWatch(onLocation, onError);
  }, () => { if (!cancelled) onAvailability(false); });
  return () => { cancelled = true; stop?.(); };
}
