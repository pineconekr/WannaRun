# 담당: 서솔빈
# 없는 테이블만 생성. 서버 실행과 별도로 실행.

from backend.database import engine
from backend.models import Base


def main():
    if engine is None:
        raise RuntimeError("DATABASE_URL 설정 필요.")
    try:
        Base.metadata.create_all(engine)
        print("테이블 준비 완료:", ", ".join(Base.metadata.tables))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
