# 뭅 · moov. — MOVE TOGETHER

연세대학교 미래캠퍼스 스포츠 매칭 앱의 **전체 소스 저장소**입니다. 배포된 **Sites 버전 5(2차 피드백)**를 기준으로 팀원이 각자 PC에서 이어서 개발할 수 있도록 구성했습니다.

## 바로 실행하기

Git과 **Node.js 26.13.0**을 설치한 후 실행하세요.

```sh
git clone https://github.com/taeu1250-bit/move-online-.git
cd move-online-
npm ci
npm run dev:demo
```

[로컬 앱 열기](http://127.0.0.1:5188/.sites-runtime/qa/index.html)

이 모드는 실제 회원가입 없이 로컬 검증 계정을 전환해 화면과 기능을 시험할 수 있습니다. 각 컴퓨터의 임시 DB를 사용하며 종료하면 초기화됩니다. 실제 온라인 사이트의 회원·경기 데이터에는 영향을 주지 않습니다.

## 포함된 코드

| 경로 | 내용 |
|---|---|
| `src/` | React·TypeScript 화면, 라우팅, 정책, 데이터 접근 계층 |
| `server/` | Firebase 토큰 검증, 경기/팀/신고 API, 정원·권한·원자적 처리 |
| `db/`, `drizzle/` | D1 스키마와 전체 누적 마이그레이션 |
| `public/` | PWA manifest, 아이콘 |
| `scripts/` | 빌드, service worker, 로컬 D1·인증 에뮬레이터, 검증 앱 |
| `tests/` | 인증·권한·동시성·경기 운영·매너 기능 테스트 |
| `tools/lifecycle-scheduler/` | 아직 연결하지 않은 외부 분 단위 예약 Worker 준비 코드 |
| `docs/` | 팀 개발 방법과 소스 출처 |

## 실행 명령

```sh
npm run dev:demo      # 로그인 없이 로컬 기능 개발
npm run verify        # TypeScript 검사 + 전체 빌드 + 자동 테스트
npm run dev:emulator  # 별도로 실행한 Firebase Auth Emulator와 연결
```

실제 인증 흐름 테스트, 환경 설정, 브랜치와 Pull Request 작업 방법은 **[팀 공동 개발 가이드](docs/TEAM-DEVELOPMENT.md)**를 참고하세요. 실제 Firebase 연결용 설정 예시는 `.dev.vars.example`에 있습니다.

## 기능과 검증 범위

경기 검색·모집·개인/회원 기반 단체 신청, 농구 포함 친선경기, 회원 초대와 경기별 동의, 최소·최대 인원, 모집자 승인·권한 위임, 취소 정책, 출석·칭찬·신고·매너 기록, 앱 내부 알림, 모바일 PWA를 포함합니다.

**[2차 기능 상세](V2-IMPLEMENTATION.md)** · **[소스 출처와 보존 범위](docs/SOURCE-PROVENANCE.md)** · [온라인 개발 사이트](https://moov-mirae-online-dev.jj04020985.chatgpt.site)

- v5 기준 자동 테스트 45개 통과.
- 새 경기 운영 엔진은 v2 신규 경기부터 적용합니다. 기존 이름 입력 명단을 실제 계정에 임의 연결하지 않습니다.
- 무접속 분 단위 자동 실행은 외부 예약 서비스 연결이 남아 있습니다.
- 실제 학교 메일 발송·여러 휴대폰의 전체 흐름·홈 화면 설치는 별도로 확인해야 합니다.

## 공동 작업과 배포

각자 브랜치를 만들어 작업한 뒤 Pull Request로 변경을 합치세요. 저장소 소유자가 팀원의 GitHub 계정을 **Settings → Collaborators**에 등록하면 직접 push/PR할 수 있습니다.

이 저장소에 push하는 것만으로 기존 Sites에 자동 배포되지는 않습니다. 실제 회원 DB 덤프·서버 비밀키·개인 로그인 정보는 포함하지 않았습니다. 온라인 D1과 Firebase 연결 권한은 저장소 접근 권한과 별도로 관리합니다.
