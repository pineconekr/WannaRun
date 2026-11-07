// 영토 칸을 지도에 그립니다. 색과 등장 모션은 base.css의 .wr-hex가 담당합니다.
import React, { useMemo } from 'react';
import { Polygon } from 'react-leaflet';
import type { Position, Territory } from '../../services/territory';

const STAGGER_STEPS = 12;
const NONE: string[] = [];

type Props = {
  cells: Territory;
  /** 이번에 새로 차지한 칸. 강조 색과 등장 모션을 받습니다. */
  fresh?: string[];
  /** 새 칸을 경로 순서대로 차례차례 드러냅니다. */
  stagger?: boolean;
};

function TerritoryLayer({ cells, fresh = NONE, stagger = false }: Props) {
  // 이미 가진 칸은 SVG 경로 하나(멀티폴리곤)로 묶어 칸이 수천 개여도 DOM 노드는 하나입니다.
  const settled = useMemo(() => {
    const freshKeys = new Set(fresh);
    const polygons: Position[][][] = [];
    // 고리 하나짜리 다각형의 배열 = 멀티폴리곤(배열 하나만 감싸면 첫 칸 외에는 구멍으로 그려집니다).
    for (const key in cells) if (!freshKeys.has(key)) polygons.push([cells[key].positions]);
    return polygons;
  }, [cells, fresh]);

  // className·interactive는 Leaflet 생성 옵션이라 pathOptions가 아닌 prop으로 넘겨야 실제 SVG에 붙습니다.
  return <>
    {settled.length > 0 && <Polygon positions={settled} className="wr-hex" interactive={false} />}
    {fresh.map((key, index) => {
      const cell = cells[key];
      if (!cell) return null;
      const step = Math.floor(index / fresh.length * STAGGER_STEPS);
      return <Polygon key={key} positions={cell.positions} interactive={false}
        className={stagger ? `wr-hex is-new wr-hex-d${step}` : 'wr-hex is-new'} />;
    })}
  </>;
}

// 달리는 동안 1초마다 부모가 다시 그려도, 칸이 그대로면 다시 계산하지 않습니다.
export default React.memo(TerritoryLayer);
