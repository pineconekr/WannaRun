"""모든 사용자의 영토와 칸 주인을 러닝 기록에서 다시 만듭니다(H3 해상도 11).

DATABASE_URL 설정 후:  uv run python -m backend.backfill_territory --yes
--yes가 없으면 대상 DB만 출력합니다. 다시 실행해도 결과는 같습니다(기존 영토를 지우고 다시 계산).
칸마다 그 칸을 지나간 가장 최근 러닝의 주인이 가집니다. 영토를 지운 사용자는 지운 뒤에 시작한 러닝만 셉니다.
"""

import argparse

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from backend.migrate import migrate
from backend.models import User
from backend.territory import rebuild_all


def backfill(engine: Engine) -> dict[str, int]:
    migrate(engine)  # territory_cells 테이블이 없으면 만듭니다.
    with Session(engine) as db, db.begin():
        owned = rebuild_all(db)
        return {user.username: owned.get(user.id, 0) for user in db.scalars(select(User).order_by(User.username))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="DATABASE_URL에 실제로 쓰기")
    args = parser.parse_args()

    from backend.database import engine

    if engine is None:
        raise RuntimeError("DATABASE_URL 설정 필요.")
    if not args.yes:
        print(f"대상: {engine.url.render_as_string(hide_password=True)}\n영토를 다시 계산할 예정. 실제로 쓰려면 --yes를 붙이세요.")
        return
    try:
        for username, count in backfill(engine).items():
            print(f"{username}: {count}칸")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
