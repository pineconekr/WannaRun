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

- 칸은 [H3](https://h3geo.org) 해상도 11 육각형(변 약 29m)입니다. 로그인하면 영토는 서버에 저장되고, 로그인 없이 둘러볼 때만 이 브라우저에 저장됩니다(게스트는 경쟁하지 않음).
- 칸마다 주인은 한 명(`territory_owners`)입니다. 그 칸을 지나간 가장 최근 러닝(시작 시각, 같으면 러닝 ID가 큰 쪽)의 주인이 가지므로, 다른 러너가 더 늦게 지나가면 빼앗깁니다. 늦게 올린 옛 러닝은 그 뒤에 달린 사람의 칸을 빼앗지 못합니다. GPS·데모 러닝 모두 해당하고 legacy·50m 미만 러닝은 제외합니다.
- `territory_cells`는 사용자별 "지나간 칸" 기록이라 빼앗겨도 남고, 빼앗긴 칸 수(`lost`)를 세는 데 씁니다. 칸별 주인 이력은 따로 남기지 않습니다.
- 러닝을 계정에 저장(`POST /api/runs`)하면 서버가 같은 트랜잭션에서 칸을 계산해 주인을 정합니다. 내 영토는 `GET /api/users/me/territory`(지금 가진 칸과 `lost`)입니다.
- `DELETE /api/users/me/territory`는 내가 가진 칸을 주인 없는 빈 칸으로 만들고 지나간 칸 기록도 지웁니다(러닝 기록은 유지). 지운 시각보다 먼저 시작한 러닝은 다시 영토가 되지 않습니다.
- 지도 영역의 칸은 `GET /api/territory?south=&west=&north=&east=`(한 변 0.25도 이하)로 받습니다. 내 칸(`mine`)과 다른 러너의 칸(`others`)으로만 나누고 주인은 밝히지 않습니다. 영토 랭킹은 `GET /api/leaderboard/territory`(지금 가진 칸 수)입니다.
- 달리는 동안의 실시간 표시는 프론트(`frontend/src/services/territory.ts`)가 서버(`backend/territory.py`)와 같은 규칙으로 미리 계산합니다. 두 구현은 `frontend/tests/territory-golden.json`으로 같은 칸을 고르는지 양쪽 테스트가 검사하니, 규칙을 바꿀 때는 둘을 함께 고치세요.
- 경쟁 영토로 올릴 때는 `uv run python -m backend.migrate`를 한 번 실행하세요. `territory_owners` 표와 `users.territory_cleared_at` 열을 더하고, 기존 `territory_cells`로 칸 주인을 채웁니다(기존 데이터는 지우지 않음).
- 러닝 기록으로 모든 영토와 칸 주인을 다시 만들려면 `uv run python -m backend.backfill_territory --yes`를 실행합니다(지나간 칸 기록도 다시 만듭니다).

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
