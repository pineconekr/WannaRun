# 땅따먹기: 러닝 경로가 지나간 H3 칸(해상도 11, 변 약 29m)을 사용자별 영토로 저장합니다.
# 프론트(frontend/src/services/territory.ts)가 같은 알고리즘으로 미리 계산해 보여주고, 서버가 정본을 저장합니다.

from collections.abc import Iterable, Sequence

import h3
from fastapi import APIRouter, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.auth import CurrentSession, Db
from backend.models import Run, TerritoryCell
from backend.schemas import TerritoryResponse

H3_RESOLUTION = 11
# 이보다 짧은 러닝(미터)은 영토에 더하지 않습니다. 프론트의 MIN_CLAIM_METERS와 같아야 합니다.
MIN_CLAIM_METERS = 50
# 이웃한 두 GPS 점이 이보다 멀면 중간 칸을 채우지 않습니다. 프론트의 MAX_GAP_METERS와 같아야 합니다.
MAX_GAP_METERS = 1000
INSERT_CHUNK = 500

router = APIRouter(prefix="/api/users/me/territory", tags=["영토"])


def cells_along(path: Sequence[Sequence[float]]) -> list[str]:
    """경로가 지나간 칸을 처음 지난 순서대로 돌려줍니다(중복 없음).

    점이 하나면 그 칸만, 둘 이상이면 이웃한 점 사이의 칸을 모두 이어 붙입니다.
    """
    cells: dict[str, None] = {}
    previous: str | None = None
    previous_point: tuple[float, float] | None = None
    for lat, lng in path:
        current = h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
        if previous is None or previous == current:
            cells.setdefault(current)
        else:
            cells.setdefault(previous)
            between = [current]
            # 두 점이 MAX_GAP_METERS보다 멀면 GPS 튐으로 보고 중간 칸을 채우지 않습니다.
            if h3.great_circle_distance(previous_point, (lat, lng), unit="m") <= MAX_GAP_METERS:
                try:
                    between = h3.grid_path_cells(previous, current)
                except h3.H3BaseException:
                    pass
            for cell in between:
                cells.setdefault(cell)
        previous, previous_point = current, (lat, lng)
    return list(cells)


def is_claimable(run: Run) -> bool:
    return run.source != "legacy" and run.distance_m >= MIN_CLAIM_METERS and run.duration_s > 0


def _insert_ignore(db: Session, rows: list[dict]) -> int:
    """이미 있는 칸은 건너뛰고 새 칸만 넣습니다. 동시에 저장해도 충돌하지 않습니다."""
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    added = 0
    for start in range(0, len(rows), INSERT_CHUNK):
        result = db.execute(insert(TerritoryCell).values(rows[start : start + INSERT_CHUNK]).on_conflict_do_nothing())
        added += result.rowcount
    return added


def claim_run(db: Session, run: Run) -> int:
    """러닝이 지나간 칸을 영토에 더하고 새로 얻은 칸 수를 돌려줍니다. 호출한 쪽이 commit합니다."""
    if not is_claimable(run):
        return 0
    return _insert_ignore(
        db,
        [
            {"user_id": run.user_id, "cell_id": cell, "first_run_id": run.id, "captured_at": run.started_at}
            for cell in cells_along(run.path or [])
        ],
    )


def rebuild_user(db: Session, user_id: str) -> int:
    """사용자의 영토를 러닝 기록에서 처음부터 다시 만듭니다. 칸 수를 돌려줍니다."""
    db.execute(delete(TerritoryCell).where(TerritoryCell.user_id == user_id))
    runs = db.scalars(select(Run).where(Run.user_id == user_id).order_by(Run.started_at, Run.id))
    for run in runs:
        claim_run(db, run)
    return count_cells(db, user_id)


def count_cells(db: Session, user_id: str) -> int:
    return db.scalar(select(func.count()).select_from(TerritoryCell).where(TerritoryCell.user_id == user_id)) or 0


def user_cells(db: Session, user_id: str) -> Iterable[str]:
    return db.scalars(
        select(TerritoryCell.cell_id).where(TerritoryCell.user_id == user_id).order_by(TerritoryCell.captured_at, TerritoryCell.cell_id)
    )


@router.get("", response_model=TerritoryResponse)
def get_my_territory(db: Db, session: CurrentSession):
    cells = list(user_cells(db, session.user_id))
    return TerritoryResponse(resolution=H3_RESOLUTION, total=len(cells), cells=cells)


@router.delete("", status_code=204)
def clear_my_territory(db: Db, session: CurrentSession):
    """영토만 지웁니다. 러닝 기록은 그대로입니다."""
    db.execute(delete(TerritoryCell).where(TerritoryCell.user_id == session.user_id))
    db.commit()
    return Response(status_code=204)
