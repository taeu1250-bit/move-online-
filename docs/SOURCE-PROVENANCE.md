# 소스 출처

- 앱: 뭅(moov.) — MOVE TOGETHER
- 기준: 2026-11-24 배포한 Sites 버전 9
- Sites 소스 커밋: `0309a57c2cd398b857294051ba04c4688fcc4cc4`
- 온라인 개발 사이트: https://moov-mirae-online-dev.jj04020985.chatgpt.site

v9 Git 추적 소스를 모두 가져왔다. React/TypeScript 화면, Worker 서버, 인증 연동, 7개 누적 DB 마이그레이션과 메타데이터, PWA 아이콘·manifest, 빌드·로컬 개발 스크립트, 테스트를 포함한다.

GitHub용 공동 개발 README/가이드, Node 버전 지정, 로컬 실행 편의 명령, 환경 변수 예시 및 비활성 외부 예약 Worker 준비 코드를 유지한다. 실제 서비스 기능 코드는 원본 v9와 동일하다. 원본 README는 `SITES-ORIGINAL-README.md`에 보존하며 과거 구현 설명을 포함하므로 현재 정책은 [V9-UPDATE.md](V9-UPDATE.md)를 우선 확인한다.

기존 GitHub 기준 커밋은 `1b784d126689dbcf518b912f6d4d092320cd9c17`이다. 최초 v5 가져오기 이후의 공동 개발 문서 변경을 보존했고, 기존 소스 이력을 덮어쓰거나 초기화하지 않았다.

`node_modules`, 빌드 결과, Firebase 로그인 상태, 서버 비밀값, 실제 회원·경기 DB 덤프는 소스 배포 대상이 아니다. DB 구조는 포함하지만 개인정보가 들어 있는 실제 데이터는 기존 D1에 보존한다.

원본 v9는 빌드와 자동 테스트 68개를 통과했다. 이번 GitHub 동기화는 기존 사이트 재배포, 실제 D1 데이터 변경, Firebase 인증 데이터 변경을 수행하지 않는다. 외부 예약 실행은 연결하지 않았으며 무접속 정시 처리를 보장하지 않는다. 여러 실제 휴대폰과 홈 화면 설치 환경에서의 최종 검증은 별도 필요하다.
