# POPKU Troubleshooting

## 기록 원칙

- POPKU 개발 중 실제로 발생하고 원인과 해결 방법이 확인된 문제만 기록한다.
- 증상, 환경, 원인, 해결 방법, 필요하면 재발 방지 내용을 함께 작성한다.
- 미확인 추정이나 이전 프로젝트의 문제는 기록하지 않는다.

## 현재 기록

### RN Web 팝업 상세에서 API 요청 없이 오류 표시

- 증상: 목록 API와 `/places/{publicId}` 이동은 정상이나 상세 API 요청 없이 오류 화면이 표시된다.
- 원인: 상세 effect는 `getAuthSession()` 이후 API를 호출한다. 토큰 읽기가 Web에서 지원되지 않는 `expo-secure-store`의 `getValueWithKeyAsync`를 호출해 예외가 발생하고, effect의 catch가 요청 전에 오류 상태를 설정했다. 설치된 SecureStore Web 구현으로 fetch 0건과 해당 예외를 재현했다.
- 수정: `getSavedAccessToken()`에서 `SecureStore.isAvailableAsync()`가 false이면 null을 반환해 공개 상세 요청을 진행한다. 지원되는 Native 환경의 토큰 읽기 및 오류 처리는 유지한다. Web 로그인/토큰 저장 구현을 추가한 것은 아니다.
- 검증: 설치된 Expo Router 파서와 local param hook에서 `/places/{publicId}`의 id가 string임을 확인했다. Web SecureStore를 사용한 KO/JA 상세 호출·렌더링, Native 401 재시도, id 변경·stale 응답 및 effect cleanup/replay 회귀 테스트를 추가했다. 실제 Chrome 세션의 Network 확인은 별도로 필요하다.
- 별도 이슈: `PlaceWeeklyPopupList`의 카드 Pressable 안에 찜 Pressable이 있어 Web에서 nested button 경고가 발생할 수 있다. 위 토큰 읽기 실패와는 별개이며 이 수정에는 포함하지 않는다.
