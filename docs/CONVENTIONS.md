# POPKU Coding Conventions

## 기술 스택
- React Native + Expo + TypeScript
- Expo Router 기반 파일 라우팅
- 함수형 컴포넌트와 React Hooks 사용
- 확정되지 않은 기술은 임의로 도입하지 않는다.

## 문서 관리
- 작업 전 이 문서와 관련 문서만 확인한다.
- 실제 구현이나 확정된 결정이 바뀐 경우에만 문서를 수정한다.
- 단순 변경은 불필요하게 문서화하지 않는다.
- 계획을 구현 완료로 기록하지 않는다.

## React Native 및 TypeScript
- 불필요한 any 사용 금지
- Props 타입 명시
- React Hooks 호출 규칙 준수
- 기존 Expo Router 구조 유지
- 화면과 공통 컴포넌트의 역할 분리
- 불필요한 컴포넌트 분리 금지
- 웹 전용 HTML 및 DOM API 사용 금지

## UI 및 디자인
- docs/DESIGN.md 준수
- 일반 UI 아이콘은 Lucide
- 브랜드 아이콘은 공식 에셋
- 공통 디자인 토큰 재사용
- StyleSheet 사용
- Flexbox 우선, 절대 좌표 남용 금지
- Safe Area와 화면 크기 고려
- iOS 디자인 우선, Android 지원
- 웹 UI 대응은 현재 범위 제외

## 이미지 및 에셋
- 개발 초기에는 로컬 이미지 사용 가능
- 기존 assets 구조 활용
- 이미지 비율 및 잘림 고려
- 미사용 에셋은 참조 확인 후 삭제

## 작업 원칙
- 필요한 파일만 확인
- 불필요한 탐색과 반복 분석 금지
- 관련 없는 코드와 설정 변경 금지
- 불필요한 패키지 및 대규모 리팩터링 금지
- 필요한 구조·안정성 개선은 허용
- 실행 중인 Expo 서버와 에뮬레이터 유지
- 불필요한 별도 터미널 실행 금지

## 검증 및 완료 보고
- 변경 범위에 맞는 최소한의 검증
- 단순 UI 수정 시 전체 빌드 생략
- 필요시 npx tsc --noEmit 실행
- 테스트 미실행 시 명시
- 변경 사항과 검증 결과만 간결하게 보고

## i18n — React Compiler 환경의 UI 작성 규칙

React Compiler는 JSX와 계산 결과를 캐시한다. 전역 `t()`는 내부 전역 언어가 바뀌어도 함수 참조와 인수가 같아 번역 결과가 캐시에 남을 수 있다. 단순히 `useTranslation()`만 호출하고 전역 `t()`를 계속 사용하는 것도 금지한다.

- React UI는 반드시 `const { t } = useTranslation()`의 번역 함수를 사용한다. 이 함수는 `resolvedLanguage`가 바뀌면 참조가 바뀌고, 같은 적용 언어에서는 참조가 유지된다. 컴포넌트에서 직접 구독하면 `React.memo`로 부모 props가 유지되어도 언어 변경을 전달받는다.
- `src/locales`의 전역 `t()`를 React UI에서 직접 호출하지 않는다. 순수 유틸리티·React 외부의 호출은 허용하되, UI에서 호출하는 유틸에는 Hook의 `t` 또는 현재 언어를 명시적으로 전달한다. 예: `formatCommunityTime(createdAt, now, t)`.
- 모듈 최상위에 번역 결과를 계산하거나 번역 문자열을 고정 `useState` 초기값으로 저장하지 않는다. 오류 상태에는 오류 코드/번역 키를 저장하고 렌더링할 때 번역한다. 사용자 입력은 원문 상태로 보관한다.
- `useMemo`/`useCallback`에서 Hook의 `t`를 참조하면 의존성 배열에 `t`를 포함한다. 지역·태그 유틸에서 `resolvedLanguage`를 참조하면 해당 언어도 의존성에 포함한다. 메모이제이션을 일괄 제거하지 않는다.
- 비동기 작업 완료 후 Alert를 표시하는 콜백은 시작 시 언어를 캡처할 수 있다. 필요한 경우 Hook의 `t`를 `useRef`에 보관하고 `[t]` Effect로 갱신하여 완료 시점의 함수를 호출한다. ref는 이벤트/비동기 콜백 안에서만 읽고 JSX 번역은 Hook의 `t`를 직접 사용한다. 이미 열린 네이티브 Alert는 생성 당시 문구를 유지하며 다음 호출에 새 언어가 적용된다.
- 지역·태그는 `filterLabels.ts`를 재사용하고 현재 `resolvedLanguage`를 명시적으로 전달한다. 숫자 ID·국가 코드·필터값과 표시 라벨을 분리한다. 이름 추측 매핑, 번역 라벨의 API 파라미터 사용, 서버 객체 덮어쓰기를 금지한다.
- 고정 UI·placeholder·앱 검증 메시지만 번역한다. 리뷰 본문·닉네임·팝업명·서버 자유 텍스트는 자동번역하지 않는다. 기존 한국어 문구(공백·문장부호 포함)와 디자인을 보존하고 양쪽 리소스의 키/치환 변수를 일치시킨다.
- 새로 번역하거나 수정한 UI는 **마운트한 상태의 ko→ja→ko 즉시 전환 테스트가 필수**다. system의 적용 언어 변경도 확인한다. 실제 Compiler 출력을 사용하는 테스트를 우선하고, Compiler가 기존 코드를 최적화하지 않은 경우 이를 구분하여 보고한다. 키 존재 검사만으로 반응성을 검증했다고 주장하지 않는다.
- 언어 변경 전후 입력·별점·이미지 순서·필터·탭·캐러셀·메뉴 상태 및 API 호출 횟수를 비교한다. 강제 리로드, 화면/Stack key 변경, navigation reset, 언어 때문에 데이터 재조회하는 방식으로 우회하지 않는다.

```tsx
const { t, resolvedLanguage } = useTranslation();
const title = useMemo(() => t('home.trending.title'), [t]);
const regionName = getRegionDisplayName(region, resolvedLanguage);
return <Text>{title} {regionName}</Text>;
```

기존 테스트 프레임워크의 `tests/i18nCompiler.test.cjs`, `tests/reviewI18n.test.cjs`가 실제 React Compiler를 실행한다. `tests/i18nUiConventions.test.cjs`는 직전 수정 대상과 리뷰 대상에서 전역 번역 호출, 명백한 의존성 누락, 번역된 초기 상태를 정적으로 검사한다. 복잡한 데이터 흐름은 자동 차단하지 않고 코드 리뷰와 전환 테스트로 확인한다. 후속 i18n 작업은 검사 대상에 해당 컴포넌트를 추가한다.
