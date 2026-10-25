// 담당: 김근형
// 러닝 경로가 지나간 지도 격자를 점령 영역으로 표시하고 브라우저에 저장(땅따먹기)
import React, { useEffect, useRef, useState } from 'react';
import { Polygon } from 'react-leaflet';

type Position = [number, number];

type TerritoryCell = {
  positions: Position[];
};

type TerritoryLayerProps = {
  route: Position[];
  hasFinishedRun: boolean;
  enabled: boolean;
  onTerritoryCountChange: (count: number) => void;
};

const STORAGE_KEY = 'wannarun-captured-territories-v2';
const LEGACY_STORAGE_KEY = 'wannarun-captured-territories-v1';
const HEX_RADIUS_METERS = 35;
const SAMPLE_DISTANCE_METERS = 10;
const EARTH_RADIUS_METERS = 6_378_137;

function toMercator([latitude, longitude]: Position): [number, number] {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;

  return [
    EARTH_RADIUS_METERS * longitudeRadians,
    EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  ];
}

function fromMercator(x: number, y: number): Position {
  const longitude = (x / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const latitude = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * (180 / Math.PI);
  return [latitude, longitude];
}

function cubeRound(q: number, r: number): [number, number] {
  const x = q;
  const z = r;
  const y = -x - z;
  let roundedX = Math.round(x);
  let roundedY = Math.round(y);
  let roundedZ = Math.round(z);
  const xDifference = Math.abs(roundedX - x);
  const yDifference = Math.abs(roundedY - y);
  const zDifference = Math.abs(roundedZ - z);

  if (xDifference > yDifference && xDifference > zDifference) roundedX = -roundedY - roundedZ;
  else if (yDifference > zDifference) roundedY = -roundedX - roundedZ;
  else roundedZ = -roundedX - roundedY;

  return [roundedX, roundedZ];
}

function getHexCellAt(q: number, r: number): [string, TerritoryCell] {
  const centerX = Math.sqrt(3) * HEX_RADIUS_METERS * (q + r / 2);
  const centerY = 1.5 * HEX_RADIUS_METERS * r;
  const positions: Position[] = Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return fromMercator(
      centerX + HEX_RADIUS_METERS * Math.cos(angle),
      centerY + HEX_RADIUS_METERS * Math.sin(angle),
    );
  });
  return [`${q}:${r}`, { positions }];
}

function getHexCell(position: Position): [string, TerritoryCell] {
  const [x, y] = toMercator(position);
  const [q, r] = cubeRound(
    (Math.sqrt(3) / 3 * x - y / 3) / HEX_RADIUS_METERS,
    (2 / 3 * y) / HEX_RADIUS_METERS,
  );
  return getHexCellAt(q, r);
}

function getCellsAlongRoute(route: Position[]): Record<string, TerritoryCell> {
  const cells: Record<string, TerritoryCell> = {};

  const addCellAt = (position: Position) => {
    const [key, cell] = getHexCell(position);
    cells[key] = cell;
  };

  if (route.length === 1) {
    addCellAt(route[0]);
    return cells;
  }

  for (let index = 1; index < route.length; index += 1) {
    const start = toMercator(route[index - 1]);
    const end = toMercator(route[index]);
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const sampleCount = Math.max(1, Math.ceil(distance / SAMPLE_DISTANCE_METERS));

    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const ratio = sample / sampleCount;
      addCellAt(fromMercator(
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ));
    }
  }

  return cells;
}

export default function TerritoryLayer({ route, hasFinishedRun, enabled, onTerritoryCountChange }: TerritoryLayerProps) {
  const [territories, setTerritories] = useState<Record<string, TerritoryCell>>({});
  const territoriesRef = useRef<Record<string, TerritoryCell>>({});
  const finishHandledRef = useRef(false);

  useEffect(() => {
    try {
      const savedTerritories = window.localStorage.getItem(STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (savedTerritories) {
        const storedTerritories = JSON.parse(savedTerritories) as Record<string, unknown>;
        const parsedTerritories: Record<string, TerritoryCell> = {};
        Object.entries(storedTerritories).forEach(([key, value]) => {
          const cell = value as Partial<TerritoryCell> & { bounds?: [[number, number], [number, number]] };
          if (cell.positions) {
            parsedTerritories[key] = cell as TerritoryCell;
          } else if (cell.bounds) {
            const [[south, west], [north, east]] = cell.bounds;
            const [hexKey, hexCell] = getHexCell([(south + north) / 2, (west + east) / 2]);
            parsedTerritories[hexKey] = hexCell;
          }
        });
        territoriesRef.current = parsedTerritories;
        setTerritories(parsedTerritories);
        onTerritoryCountChange(Object.keys(parsedTerritories).length);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedTerritories));
      }
    } catch {
      // 저장 데이터를 읽을 수 없어도 지도 자체는 계속 사용할 수 있습니다.
    }
  }, [onTerritoryCountChange]);

  useEffect(() => {
    if (enabled) return;

    territoriesRef.current = {};
    setTerritories({});
    onTerritoryCountChange(0);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // 저장 공간을 사용할 수 없어도 현재 화면의 점령 기록은 초기화합니다.
    }
  }, [enabled, onTerritoryCountChange]);

  useEffect(() => {
    if (!hasFinishedRun) {
      finishHandledRef.current = false;
      return;
    }
    if (finishHandledRef.current) return;
    finishHandledRef.current = true;
    if (!enabled) return;

    // 실제 GPS 경로가 지나간 육각형만 점령합니다.
    const newlyVisitedCells = getCellsAlongRoute(route);
    const nextTerritories = { ...territoriesRef.current, ...newlyVisitedCells };
    territoriesRef.current = nextTerritories;
    setTerritories(nextTerritories);
    onTerritoryCountChange(Object.keys(nextTerritories).length);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTerritories));
    } catch {
      // 브라우저 저장 공간을 사용할 수 없어도 이번 실행 중에는 지도에 표시합니다.
    }
  }, [enabled, hasFinishedRun, onTerritoryCountChange, route]);

  return (
    <>
      {enabled && Object.entries(territories).map(([key, cell]) => (
        <Polygon
          key={key}
          positions={cell.positions}
          pathOptions={{
            color: '#168653',
            weight: 1,
            fillColor: '#36c98a',
            fillOpacity: 0.28,
          }}
        />
      ))}
    </>
  );
}
