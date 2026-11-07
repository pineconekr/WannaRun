# 담당: 서솔빈
# 기존 데이터 보존형 스키마 마이그레이션. 서버 실행과 별도로 실행.

from backend.database import engine
from backend.migrate import migrate


def main():
    if engine is None:
        raise RuntimeError("DATABASE_URL 설정 필요.")
    try:
        migrate(engine)
        print("스키마 준비 완료: 계정·기존 기록 유지")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
