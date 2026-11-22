# 땅따먹기: 러닝 경로가 지나간 H3 칸(해상도 11, 변 약 29m)을 차지합니다. 칸마다 주인은 한 명이고,
# 그 칸을 지나간 가장 최근 러닝(시작 시각, 같으면 러닝 ID 순)의 주인이 가집니다. 다른 러너가 더 늦게 지나가면 빼앗깁니다.
# 프론트(frontend/src/services/territory.ts)가 같은 알고리즘으로 칸을 미리 계산해 보여주고, 서버가 정본을 저장합니다.

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Annotated, Protocol

import h3
from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.orm import Session

from backend.auth import CurrentSession, Db
from backend.models import Run, TerritoryCell, TerritoryOwner, User
from backend.schemas import TerritoryAreaResponse, TerritoryResponse

H3_RESOLUTION = 11
# 이보다 짧은 러닝(미터)은 영토에 더하지 않습니다. 프론트의 MIN_CLAIM_METERS와 같아야 합니다.
MIN_CLAIM_METERS = 50
# 이웃한 두 GPS 점이 이보다 멀면 중간 칸을 채우지 않습니다. 프론트의 MAX_GAP_METERS와 같아야 합니다.
MAX_GAP_METERS = 1000
INSERT_CHUNK = 500
# 지도 영역 조회: 한 변이 이보다 넓으면(도) 거절하고, 칸이 이보다 많으면 잘라서 돌려줍니다.
MAX_AREA_SPAN_DEG = 0.25
MAX_AREA_CELLS = 5000
# 칸 중심으로 영역을 고르므로 가장자리에 걸친 칸도 오도록 이만큼(도, 약 55m) 넓혀 찾습니다.
AREA_PAD_DEG = 0.0005

router = APIRouter(prefix="/api/users/me/territory", tags=["영토"])
area_router = APIRouter(prefix="/api/territory", tags=["영토"])


class Executor(Protocol):
    """Session과 Connection 모두 받습니다(마이그레이션은 Connection으로 부릅니다)."""

    def execute(self, statement, *args, **kwargs): ...


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


def _utc(value: datetime) -> datetime:
    # SQLite는 시간대를 저장하지 않으므로 읽은 값은 UTC로 봅니다.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def is_claimable(run: Run, cleared_at: datetime | None = None) -> bool:
    """legacy·50m 미만 러닝과, 영토를 지우기 전에 시작한 러닝은 칸을 차지하지 않습니다."""
    if run.source == "legacy" or run.distance_m < MIN_CLAIM_METERS or run.duration_s <= 0:
        return False
    return cleared_at is None or _utc(run.started_at) >= _utc(cleared_at)


def _insert(db: Session):
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    return insert


def _chunks[T](rows: list[T]) -> Iterable[list[T]]:
    for start in range(0, len(rows), INSERT_CHUNK):
        yield rows[start : start + INSERT_CHUNK]


def _owner_row(cell: str, user_id: str, run_id: str | None, captured_at: datetime) -> dict:
    lat, lng = h3.cell_to_latlng(cell)
    return {"cell_id": cell, "user_id": user_id, "run_id": run_id, "captured_at": captured_at, "lat": lat, "lng": lng}


@dataclass
class Claim:
    """한 러닝으로 새로 내 것이 된 칸 수와, 그중 다른 러너에게서 빼앗은 칸 수."""

    added: int = 0
    stolen: int = 0


def claim_run(db: Session, run: Run) -> Claim:
    """러닝이 지나간 칸을 차지합니다. 더 먼저 시작한 러닝이 가진 칸은 빼앗습니다. 호출한 쪽이 commit합니다."""
    cleared_at = db.scalar(select(User.territory_cleared_at).where(User.id == run.user_id))
    if not is_claimable(run, cleared_at):
        return Claim()
    cells = cells_along(run.path or [])
    if not cells:
        return Claim()
    insert = _insert(db)
    before: dict[str, str] = {}
    for ids in _chunks(cells):
        before.update(db.execute(
            select(TerritoryOwner.cell_id, TerritoryOwner.user_id).where(TerritoryOwner.cell_id.in_(ids))
        ).tuples().all())
        db.execute(insert(TerritoryCell).values([
            {"user_id": run.user_id, "cell_id": cell, "first_run_id": run.id, "captured_at": run.started_at} for cell in ids
        ]).on_conflict_do_nothing())
    for chunk in _chunks([_owner_row(cell, run.user_id, run.id, run.started_at) for cell in cells]):
        statement = insert(TerritoryOwner).values(chunk)
        new = statement.excluded
        # 동시에 저장해도 칸마다 원자적으로 비교합니다. 더 늦게 시작한 러닝(같으면 ID가 큰 러닝)이 이깁니다.
        db.execute(statement.on_conflict_do_update(
            index_elements=[TerritoryOwner.cell_id],
            set_={"user_id": new.user_id, "run_id": new.run_id, "captured_at": new.captured_at},
            where=or_(
                TerritoryOwner.captured_at < new.captured_at,
                and_(
                    TerritoryOwner.captured_at == new.captured_at,
                    or_(TerritoryOwner.run_id.is_(None), TerritoryOwner.run_id < new.run_id),
                ),
            ),
        ))
    owned: set[str] = set()
    for ids in _chunks(cells):
        owned.update(db.scalars(
            select(TerritoryOwner.cell_id).where(TerritoryOwner.cell_id.in_(ids), TerritoryOwner.user_id == run.user_id)
        ))
    added = [cell for cell in cells if cell in owned and before.get(cell) != run.user_id]
    return Claim(added=len(added), stolen=sum(1 for cell in added if cell in before))


@dataclass
class _Rebuild:
    visits: dict[tuple[str, str], dict] = field(default_factory=dict)
    owners: dict[str, dict] = field(default_factory=dict)


def _replay(executor: Executor, keep: set[tuple[str, str]] | None = None) -> _Rebuild:
    """모든 러닝을 시작 시각 순으로 다시 달려 칸 주인을 정합니다. keep이 있으면 그 (사용자, 칸)만 씁니다."""
    cleared = dict(executor.execute(select(User.id, User.territory_cleared_at)).tuples().all())
    result = _Rebuild()
    runs = executor.execute(
        select(Run.id, Run.user_id, Run.started_at, Run.distance_m, Run.duration_s, Run.source, Run.path)
        .order_by(Run.started_at, Run.id)
    )
    for run in runs:
        if not is_claimable(run, cleared.get(run.user_id)):
            continue
        for cell in cells_along(run.path or []):
            if keep is not None and (run.user_id, cell) not in keep:
                continue
            result.visits.setdefault((run.user_id, cell), {
                "user_id": run.user_id, "cell_id": cell, "first_run_id": run.id, "captured_at": run.started_at,
            })
            # 시작 시각·ID 오름차순이라 나중에 본 러닝이 이깁니다(claim_run과 같은 규칙).
            result.owners[cell] = _owner_row(cell, run.user_id, run.id, run.started_at)
    return result


def _write(executor: Executor, rebuilt: _Rebuild, visits: bool) -> None:
    if visits:
        for chunk in _chunks(list(rebuilt.visits.values())):
            executor.execute(TerritoryCell.__table__.insert(), chunk)
    for chunk in _chunks(list(rebuilt.owners.values())):
        executor.execute(TerritoryOwner.__table__.insert(), chunk)


def rebuild_all(db: Session) -> dict[str, int]:
    """모든 사용자의 영토를 러닝 기록에서 처음부터 다시 만듭니다. 사용자 ID별 가진 칸 수를 돌려줍니다.

    영토를 지운 사용자는 지운 뒤에 시작한 러닝만 셉니다. 그래서 지울 때 빈 칸이 되었던 칸이라도
    그 칸을 더 먼저 지나간 다른 러너가 있으면 그 러너에게 돌아갑니다.
    """
    db.execute(delete(TerritoryOwner))
    db.execute(delete(TerritoryCell))
    rebuilt = _replay(db)
    _write(db, rebuilt, visits=True)
    totals: dict[str, int] = {}
    for owner in rebuilt.owners.values():
        totals[owner["user_id"]] = totals.get(owner["user_id"], 0) + 1
    return totals


def seed_owners(executor: Executor) -> int:
    """칸 주인 표를 처음 만들 때 기존 영토(territory_cells)로 채웁니다. 마이그레이션이 한 번만 부릅니다.

    이미 지운 영토가 되살아나지 않도록 territory_cells에 남아 있는 (사용자, 칸)만 씁니다.
    """
    keep = set(executor.execute(select(TerritoryCell.user_id, TerritoryCell.cell_id)).tuples().all())
    if not keep:
        return 0
    rebuilt = _replay(executor, keep)
    _write(executor, rebuilt, visits=False)
    return len(rebuilt.owners)


def count_cells(db: Session, user_id: str) -> int:
    return db.scalar(select(func.count()).select_from(TerritoryOwner).where(TerritoryOwner.user_id == user_id)) or 0


def user_cells(db: Session, user_id: str) -> Iterable[str]:
    """지금 내가 가진 칸."""
    return db.scalars(
        select(TerritoryOwner.cell_id).where(TerritoryOwner.user_id == user_id)
        .order_by(TerritoryOwner.captured_at, TerritoryOwner.cell_id)
    )


def lost_cells(db: Session, user_id: str) -> int:
    """지나갔지만 지금은 내 것이 아닌 칸 수(다른 러너에게 빼앗김)."""
    return db.scalar(
        select(func.count()).select_from(TerritoryCell)
        .outerjoin(TerritoryOwner, TerritoryOwner.cell_id == TerritoryCell.cell_id)
        .where(TerritoryCell.user_id == user_id, or_(TerritoryOwner.user_id.is_(None), TerritoryOwner.user_id != user_id))
    ) or 0


@router.get("", response_model=TerritoryResponse)
def get_my_territory(db: Db, session: CurrentSession):
    cells = list(user_cells(db, session.user_id))
    return TerritoryResponse(resolution=H3_RESOLUTION, total=len(cells), cells=cells, lost=lost_cells(db, session.user_id))


@router.delete("", status_code=204)
def clear_my_territory(db: Db, session: CurrentSession):
    """내 영토를 지웁니다. 내가 가진 칸은 빈 칸이 되고, 지금보다 먼저 시작한 러닝은 다시 영토가 되지 않습니다. 러닝 기록은 그대로입니다."""
    db.execute(delete(TerritoryOwner).where(TerritoryOwner.user_id == session.user_id))
    db.execute(delete(TerritoryCell).where(TerritoryCell.user_id == session.user_id))
    db.execute(update(User).where(User.id == session.user_id).values(territory_cleared_at=datetime.now(timezone.utc)))
    db.commit()
    return Response(status_code=204)


Lat = Annotated[float, Query(ge=-90, le=90, allow_inf_nan=False)]
Lng = Annotated[float, Query(ge=-180, le=180, allow_inf_nan=False)]


@area_router.get("", response_model=TerritoryAreaResponse)
def get_area(db: Db, session: CurrentSession, south: Lat, west: Lng, north: Lat, east: Lng):
    """지도 영역 안의 칸을 내 칸과 다른 러너의 칸으로 나눠 돌려줍니다. 다른 칸의 주인은 알려주지 않습니다."""
    if south >= north or west >= east:
        raise HTTPException(status_code=422, detail="영역은 south < north, west < east여야 해요.")
    if north - south > MAX_AREA_SPAN_DEG or east - west > MAX_AREA_SPAN_DEG:
        raise HTTPException(status_code=422, detail="영역이 너무 넓어요. 지도를 더 확대해 주세요.")
    rows = db.execute(
        select(TerritoryOwner.cell_id, TerritoryOwner.user_id).where(
            TerritoryOwner.lat.between(south - AREA_PAD_DEG, north + AREA_PAD_DEG),
            TerritoryOwner.lng.between(west - AREA_PAD_DEG, east + AREA_PAD_DEG),
        ).order_by(TerritoryOwner.cell_id).limit(MAX_AREA_CELLS + 1)
    ).tuples().all()
    truncated = len(rows) > MAX_AREA_CELLS
    mine, others = [], []
    for cell, user_id in rows[:MAX_AREA_CELLS]:
        (mine if user_id == session.user_id else others).append(cell)
    return TerritoryAreaResponse(resolution=H3_RESOLUTION, mine=mine, others=others, truncated=truncated)
