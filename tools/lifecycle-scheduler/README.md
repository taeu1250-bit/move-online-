# moov. 분 단위 예약 연결 준비물

아직 계정 연결·배포·비밀값 설정을 하지 않은 별도 예약 Worker 예제다. 기존 Sites 앱이나 D1을 새로 생성하지 않는다. Sites의 시간당 1회 제한 때문에 정확한 경기 운영 시각을 위한 대안으로 준비했다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에서 사용할 계정을 선택한다. 요금·사용 한도는 해당 계정에서 확인한다. 유료 전환은 자동 수행하지 않는다.
2. [Cron Triggers 공식 안내](https://developers.cloudflare.com/workers/configuration/cron-triggers/)에 따라 1분 주기 Worker를 배포한다. 이 폴더의 wrangler.jsonc에는 `* * * * *`가 설정돼 있다.
3. `MOOV_JOB_KEY`와 `SITES_SERVICE_TOKEN`을 Worker secret으로 등록한다. 공개 변수나 소스코드에 넣지 않는다. Sites 인증 토큰과 현재 moov. 서버 작업키가 필요하므로 설정 시 보안 도구로 전달한다. 기존 Firebase 키·비밀번호는 필요하지 않다.
4. 첫 수동 scheduled 테스트에서 200 응답을 확인한다. 일반 HTTP 접근은 404여야 한다. 상태 처리 중복 실행은 moov. 서버의 revision 검증으로 보호한다.
5. 별도 테스트 경기에서 앱을 닫은 채 -2시간, -1시간, +30분, 종료 시각을 넘어가며 실제 DB 기록과 Worker 실행 로그를 비교한다. 이 검증 전에는 무접속 자동 처리를 완료로 표시하지 않는다.

분 단위 예약도 분 경계와 실행 지연이 있으므로 초 단위 정확성을 보장하지 않는다. 실패 감시·자격증명 갱신·운영 알림 수신자는 출시 전에 설정한다. GitHub Actions는 이 요구의 분 단위 실행을 대신하도록 연결하지 않았다.
