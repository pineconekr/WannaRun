# WannaRun

혼잡도 기반 코스 추천과 게임 요소를 결합한 러닝 앱.

## 주요 기능

- 아이디 회원가입·로그인, 로그인 없이 둘러보기
- 지도에서 현재 위치와 이동 경로 표시
- 러닝 시간·거리·평균 페이스와 속도 그래프, GPS 일시정지·재개
- GPS 러닝과 직접 지정한 경로 시연, 수영강 A 왕복 코스
- 땅따먹기: 지나간 구역 점령과 내 영토 지도
- 러닝 기록 저장·조회, 주간·월간·전체 리더보드
- 러너별 대략적인 활동 지역, 프로필 배지·출석, 부산 대회 일정

개발 예정: 혼잡도 기반 코스 추천, 펫 육성

## 구조

| 폴더 | 내용 |
| --- | --- |
| `frontend` | React + Vite |
| `backend` | FastAPI + PostgreSQL(Neon) |

## 땅따먹기(영토)

- 칸은 [H3](https://h3geo.org) 해상도 11 육각형(변 약 29m)입니다. 로그인하면 영토는 서버(`territory_cells` 테이블)에 저장되고, 로그인 없이 둘러볼 때만 이 브라우저에 저장됩니다.
- 러닝을 계정에 저장(`POST /api/runs`)하면 서버가 같은 트랜잭션에서 경로가 지나간 칸을 계산해 저장합니다(50m 미만 러닝은 제외). 내 영토는 `GET /api/users/me/territory`, 지우기는 `DELETE`(러닝 기록은 유지)입니다.
- 달리는 동안의 실시간 표시는 프론트(`frontend/src/services/territory.ts`)가 서버(`backend/territory.py`)와 같은 규칙으로 미리 계산합니다. 두 구현은 `frontend/tests/territory-golden.json`으로 같은 칸을 고르는지 양쪽 테스트가 검사하니, 규칙을 바꿀 때는 둘을 함께 고치세요.
- 기존 러닝 기록으로 영토를 다시 만들려면 `uv run python -m backend.backfill_territory --yes`를 실행합니다.

## 로컬 실행

처음 한 번:

```powershell
uv sync
cd frontend
npm.cmd ci
```

터미널 두 개에서 각각 실행:

```powershell
cd frontend
npm.cmd run dev:api
```

```powershell
cd frontend
npm.cmd run dev
```

http://localhost:5173 접속.
개발·배포 모두 공유 Neon DB를 사용합니다. `backend/.env.example`을 `backend/.env`로 복사해 `DATABASE_URL`(`postgresql+psycopg://...`)을 설정해야 API가 동작합니다.

시연용 데모 러너 7명과 GPS 기록(최근 5주)을 넣거나 지우기:

```powershell
uv run python -m backend.seed_demo --password <8자 이상> --yes
uv run python -m backend.seed_demo --remove --yes
```

`--yes`가 없으면 대상 DB만 출력하고 종료합니다. 데모 기록은 랭킹에 실제 기록처럼 집계되므로 공유 DB에 넣을 때 주의하세요.

## API

API 문서·테스트: https://wannarun-drab.vercel.app/docs
