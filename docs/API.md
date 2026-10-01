# POPKU API

## 현재 구현

회원가입 화면에서 다음 API를 사용한다. Android 에뮬레이터의 base URL은 `http://10.0.2.2:8080`이다.

| API | 요청 | 성공 응답 |
| --- | --- | --- |
| `GET /api/users/check-email` | query `email` | `200 { "available": boolean }` |
| `GET /api/users/check-nickname` | query `nickname` | `200 { "available": boolean }` |
| `POST /api/auth/email-verifications` | JSON `{ "email": string }` | `202`, 본문 없음 |
| `POST /api/auth/email-verifications/verify` | JSON `{ "email": string, "code": string }` | `204`, 본문 없음 |
| `POST /api/users` | JSON `{ "email": string, "password": string, "nickname": string, "consents": { "termsOfService": boolean, "privacyPolicy": boolean, "marketing": boolean } }` | `201`, 사용자 정보 JSON |

인증번호는 6자리 숫자이며, 인증번호 유효 시간 기본값은 300초다. 발송·검증 실패는 백엔드의 HTTP 상태 코드로 처리한다. 회원가입 성공 후 자동 로그인은 하지 않는다.

## 계획

팝업스토어 목록, 상세 정보, 국가 및 지역 필터에 필요한 데이터 연동 방식은 제품 및 기술 설계가 확정된 뒤 정의한다.

## 미정 사항

- API 제공 여부와 통신 방식
- 엔드포인트와 요청·응답 형식
- 인증 및 권한 정책
- 오류 응답 규격

미정 항목은 실제 설계 또는 구현이 이루어지기 전까지 임의로 확정하지 않는다.
