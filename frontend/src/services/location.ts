// 담당: 김근형
// 브라우저 GPS 위치 추적과 오류 메시지 처리

export type LocationPosition = [number, number];

type LocationUpdate = {
  position: LocationPosition;
  accuracy: number;
};

/** GPS 위치 추적을 시작하고, 반환된 함수를 호출하면 추적을 종료합니다. */
export function watchLocation(
  onLocation: (update: LocationUpdate) => void,
  onError: (message: string) => void,
): (() => void) | null {
  if (!navigator.geolocation) {
    onError('이 브라우저에서는 위치 기능을 사용할 수 없습니다.');
    return null;
  }

  const watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      onLocation({
        position: [coords.latitude, coords.longitude],
        accuracy: coords.accuracy,
      });
    },
    (error) => {
      const messages: Record<number, string> = {
        1: '위치 권한이 거부되었습니다. 브라우저 사이트 설정에서 위치 권한을 허용해 주세요.',
        2: '현재 위치를 확인할 수 없습니다. 기기의 위치 서비스를 확인해 주세요.',
        3: '위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      };
      onError(messages[error.code] ?? '현재 위치를 확인하지 못했습니다.');
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
