# 소스 출처

- 앱: 뭅(moov.) — MOVE TOGETHER
- 기준: 2026-11-20 배포한 Sites 버전 5
- Sites 소스 커밋: `183bcd8cf30dab192c8c0556be6d4c9c7c67fdf4`
- 온라인 개발 사이트: https://moov-mirae-online-dev.jj04020985.chatgpt.site

v5 Git 추적 소스를 모두 가져왔다. React/TypeScript 화면, Worker 서버, 인증 연동, 5개 DB 마이그레이션과 메타데이터, PWA 아이콘·manifest, 빌드·로컬 개발 스크립트, 테스트를 포함한다.

GitHub 이전 시 추가한 것은 공동 개발 README/가이드, Node 버전 지정, 로컬 실행 편의 명령, 환경 변수 예시 및 별도로 준비해 둔 외부 예약 Worker다. 실제 서비스 기능 코드는 원본 v5와 동일하다. 원본 README는 `SITES-ORIGINAL-README.md`에 보존한다.

`node_modules`, 빌드 결과, Firebase 로그인 상태, 서버 비밀값, 실제 회원·경기 DB 덤프는 소스 배포 대상이 아니다. DB 구조는 포함하지만 개인정보가 들어 있는 실제 데이터는 기존 D1에 보존한다.

원본 v5는 빌드와 자동 테스트 45개를 통과했다. 기존 D1 15개 테이블의 59개 기록을 보존하고 테이블 5개를 추가했다. 분 단위 예약은 Sites의 시간당 실행 제한 때문에 추가 연결이 필요하다. 실제 신규 가입 메일·다중 기기 운영·PWA 설치 검증은 별도 남은 작업이다.
