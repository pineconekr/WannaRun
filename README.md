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
로컬 계정은 `backend/auth-test.sqlite3`에 저장되며 배포 DB와 별개입니다.

시연용 데모 러너 7명과 GPS 기록(최근 5주)을 넣거나 지우기:

```powershell
uv run python -m backend.seed_demo --sqlite backend/auth-test.sqlite3 --password <8자 이상>
uv run python -m backend.seed_demo --sqlite backend/auth-test.sqlite3 --remove
```

Neon에는 `DATABASE_URL`을 설정하고 `--yes`를 붙여 실행합니다(없으면 대상만 출력). 데모 기록은 랭킹에 실제 기록처럼 집계되므로 운영 DB 대신 Neon 시연용 브랜치를 권장합니다.

## API

API 문서·테스트: https://wannarun-drab.vercel.app/docs
