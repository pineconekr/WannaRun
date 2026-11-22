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
  /** 다른 러너의 칸. 누구의 칸인지 구분하지 않고 한 색으로 내 칸 아래에 그립니다. */
  rivals?: Territory;
};

/** 고리 하나짜리 다각형의 배열 = 멀티폴리곤(배열 하나만 감싸면 첫 칸 외에는 구멍으로 그려집니다). */
function multiPolygon(cells: Territory, skip: (key: string) => boolean): Position[][][] {
  const polygons: Position[][][] = [];
  for (const key in cells) if (!skip(key)) polygons.push([cells[key].positions]);
  return polygons;
}

function TerritoryLayer({ cells, fresh = NONE, stagger = false, rivals }: Props) {
  // 이미 가진 칸은 SVG 경로 하나(멀티폴리곤)로 묶어 칸이 수천 개여도 DOM 노드는 하나입니다.
  const settled = useMemo(() => {
    const freshKeys = new Set(fresh);
    return multiPolygon(cells, key => freshKeys.has(key));
  }, [cells, fresh]);
  // 내가 방금 지나간 칸(달리는 중 포함)은 내 칸으로 그리므로 다른 러너의 칸에서 뺍니다.
  const others = useMemo(() => rivals ? multiPolygon(rivals, key => key in cells) : [], [rivals, cells]);

  // className·interactive는 Leaflet 생성 옵션이라 pathOptions가 아닌 prop으로 넘겨야 실제 SVG에 붙습니다.
  return <>
    {others.length > 0 && <Polygon positions={others} className="wr-hex is-rival" interactive={false} />}
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
