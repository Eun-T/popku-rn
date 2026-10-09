# POPKU Color Management & Theme Audit

> 진단일: 2026-10-08 · 대상: C:\dev\popku-rn 현재 작업 트리.
> 읽기 전용 정적 감사이며 생성한 파일은 docs/THEME_AUDIT.md뿐이다. 기존 보고서는 없었다. 소스·번역 JSON·설정·패키지·테스트·DESIGN.md·기존 사용자 변경을 보존했다. native build/기기 실행은 수행하지 않았다.
> **다크 색상과 구현 방법은 미구현 제안**이다. 확인한 코드, 향후 변경 시 위험, 기기 검증 필요를 구분한다.

## 1. 현재 테마 아키텍처

**다크모드 도입은 가능하지만, 현재 구현은 고정 라이트 팔레트다.** 공통 색상 재사용은 충분히 많아 기존 디자인/구조를 유지하며 단계적으로 전환할 수 있다. 단순한 colors.background 변경이나 OS automatic 설정만으로 완성되지 않는다.

| 집계 | 결과·정의 |
| --- | --- |
| 조사 화면 | **28개 native route**. 작성/수정은 동일 route의 두 mode. 공통 UI·지도 검색/바텀시트·로딩/실패/빈 상태 포함 |
| 하드코딩 색상 사용 위치 | **140개 = 활성 native 의존 모듈135 + app.json2 + 생성 Android 리소스3**. JSX/StyleSheet/상수의 HEX/RGB/RGBA literal 각각1개. 같은 행 color/fill은 별개 AST 위치 |
| 추가 구분 | transparent4개는 색상 치환 대상에서 제외. 중앙 팔레트 정의25개 literal도 사용 위치와 별도. 미사용 mock2개 색상은 활성 집계 제외 |
| 공통 색상 | tokens.ts16개 필드(gradient2색 포함), communityColors.ts8개 필드. 활성 의존 모듈에서 **22개 필드620회 직접 참조** |
| 현재 테마 기능 | useColorScheme / Appearance / ThemeProvider / useTheme 호출 없음. light/dark/system 설정·저장·복원 없음 |
| 설정 준비 | app.json:9 userInterfaceStyle=automatic. 이미 expo-system-ui·expo-status-bar·expo-splash-screen·SecureStore 설치 |
| 검사 | TypeScript 통과. 기존 관련6개 test 파일 **57건 중55통과/2실패**(§14). 실기기 다크모드/FPS 검증 아님 |

파일 목록→라우트 import/export 의존 관계→관련 색상 literal/토큰 속성→실제 소비 경로 순으로 조사했다. 기존 TypeScript parser를 메모리에서 사용했으며 새 감사 스크립트/테스트 파일은 만들지 않았다. src의133개 TS/TSX 파일 중 native 라우트 의존 모듈127개가 도달 가능하다. 도달 가능성은 매 상태에서 전부 렌더된다는 의미가 아니며 스타일 선언/조건 분기 모두 집계한다. 주석·문서·test 문자열·이미지 픽셀·node_modules 구현 색상은 사용 위치 집계에 넣지 않았다.

| 계층 | 실제 경로·현재 구현 | 적용 시 역할 |
| --- | --- | --- |
| 글로벌 토큰 | src/theme/tokens.ts:1–18, typography/spacing/radius:20–53 | light 값 유지. palette만 mode별로 선택하고 크기/간격/글꼴 값 보존 |
| 커뮤니티 토큰 | src/theme/communityColors.ts:1–10 | 전용 색상 의도 유지. review·댓글·my cards·헤더도 현재 참조하므로 함께 추적 |
| Root Native Stack | src/app/_layout.tsx:5–43; 상세5개에 contentStyle=B | navigator 유지; theme 상태와 screen background 옵션만 연동 |
| Tabs / 하위 Stack | src/app/(tabs)/_layout.tsx:6–18, places/_layout.tsx:4, profile/_layout.tsx:4 | 기존 navigation/gesture 유지; 부모 theme로 배경 전파 |
| 화면 스타일 | 예: src/screens/PlaceScreen.tsx:604, MoreButton.tsx:24; 모듈 최상위 StyleSheet.create | static 생성값은 나중에 palette를 바꿔도 갱신되지 않음. 색상 의존 style만 resolved palette로 재생성 |
| 공유 style export | InquiryLayout.tsx:22–43, NoticeLayout.tsx:15–23 | layout wrapper만 테마화하면 자식 import style은 남음. 공유 style 소비도 같은 theme로 생성 |
| 네이티브 외형 | app.json:9 automatic, Android DayNight theme | JS palette와 OS Alert/키보드/Glass 밝기가 독립적인 현재 상태를 해소 |
| 언어·API | src/locales/index.ts:4–8 고정ko; 데이터 hooks/캐시 별도 | themePreference와 localePreference·국가/인증 분리. 테마 변경으로 API 재요청/화면 remount 유발하지 않기 |

앱 자체 테마 owner/Provider는 없지만 **이미 설치된 Expo Router가 ThemeProvider/DefaultTheme/DarkTheme를 export**한다(node_modules/expo-router/build/exports.d.ts:22–24). 새 navigation 라이브러리나 별도 NavigationContainer 추가가 필요하다는 근거는 없다.

## 2. 전체 색상 사용 현황

### 2.1 역할별 처리 원칙

| 역할 | 실제 예 | 판정·테마 전략 |
| --- | --- | --- |
| 화면/카드/입력/본문/구분선 | B/S/T/M/E, 안내카드 #F7F8FA, skeleton #F1F3F5 | theme 대상. 같은 HEX라도 역할을 확인하여 semantic alias로 분리 |
| 브랜드 | #22C55E, brandGradient | 메인 브랜드 고정. primaryLight/primaryDark가 면/텍스트로 쓰이는 역할은 mode별 파생 쌍을 검토 |
| 상태·반응 | 찜 #FF5A6E, review star #FACC15, 오류 #B91C1C/#DC2626, info badge 쌍 | 의도 있는 색이다. 회색으로 일괄 치환하지 않기. 명암비·상태 의미는 양쪽 검증 |
| 사진 위 glyph/문자 | Hero 흰 버튼·banner 흰 caption·photo count | onImage와 검정 shade 고정 우선. 화면 배경 token과 분리 |
| 지도 마커 | MapScreen.native.tsx:114–124의11색 | 카테고리 identity 유지. 마커 흰 ring/glyph·라벨 halo는 지도 밝기와 함께 검증 |
| 브랜드 채널 | OfficialChannelIcon.tsx:12–33 | 다색 브랜드 고유색 유지. X/Threads처럼 검정 단색은 공식 밝은 버전/안전한 표면 필요 |
| 반투명 재질 | 탭바 Glass/Blur·white tint/border·gray indicator | resolvedTheme 및 실제 뒤 배경 대비로 별도 component token |
| shadow/backdrop | #000, rgba(0,0,0,.4) 등 | 고정해도 정상인 역할. dark에서 depth 인지가 부족하면 border/elevation 조합 검수; 이번 값 변경 없음 |
| native launch/icon | app.json:20,36; Android colors.xml:2–4 | UI 색상과 다른 build-time 역할. 신규 mode별 native 기준은 미확정 |

서버 배너 타입에 backgroundColors 필드가 있지만(src/lib/mainBanners.ts:9), 활성 HomeBanner에서 소비 경로를 찾지 못했다. 서버 palette로 이미 다크가 구현됐다고 판단하지 않는다.

### 2.2 색상 선택/계산 경로

| 경로 | 실제 근거 | 성격·향후 주의 |
| --- | --- | --- |
| markerStyleFor | src/screens/MapScreen.native.tsx:127–130,695 | category 이름→고정 palette/icon lookup. theme 변경으로 category/카메라/필터 값 변경하지 않기 |
| statusColor/statusBackground | src/components/map/MapPopupListSheet.tsx:49–60, MapPopupPreviewCard.tsx:59–61 | 운영 status에 따른 ternary palette 선택. 상태 의미와 foreground/background 쌍 유지 |
| favorite/selected fill | src/components/place/PopupGridCard.tsx:99–108, FloatingTabBar.tsx:404–408 | 사용자 상태에 따른 색/채움. theme가 상태값을 대신하거나 바꾸지 않기 |
| shade/pulse | src/components/home/HomeBanner.tsx:66–83, SkeletonBlock.tsx:19–22 | 고정 shade 색+opacity, pulse opacity. 색 interpolation으로 애니메이션을 새로 만들 필요 없음 |

src에서 interpolateColor/processColor/DynamicColorIOS/PlatformColor 호출은 발견하지 못했다. 현재는 주로 상수 lookup·조건 선택이며, 실제 RGB를 계산하는 복잡한 theme 변환 함수는 없다.

### 2.3 고유색·중복 집계

아래 §3은 전체140개 위치의 역할과 조치다. 동일 값을 모았다고 수정해야 할 버그 수가 되는 것은 아니다. 중앙 참조620회가 모두 독립 색상은 아니며 사용량은 정적 값이다. web 안내(MapScreen.web.tsx:13–22), PlaceMapPreview.web.tsx:14도 별도 확인했으나 native 화면28개·135위치 집계에서는 제외했다. HomeQuickMenu/PlaceholderTabScreen/placePopupMocks는 활성 native 의존 경로에서 소비를 찾지 못했다.

## 3. 화면별 하드코딩 색상

### 3.1 28개 활성 화면의 색상 역할

약어: B=#FFFFFF background, S=#F8FAFC surface, MB=#F7F8FC moreButtonBackground, T=#111827 text, M=#6B7280 secondaryText, I=#9CA3AF inactiveText, E=#E5E7EB border, G=#22C55E, W=#FFFFFF 고정 흰색. 커뮤니티 CB=#FFFFFF/CT=#252D3A/CM=#818B9B/CD=#E8EBF0/CS=#F1F3F7/CC=#303A49/CW=#FFFFFF. PINK=#FF5A6E. INFO/BRAND는 현재 배지 foreground/background 쌍. “부모면/투명”은 별도 색상 없음이며 —은 해당 요소 없음이다. **B와 W는 현재 HEX가 같아도 테마에서 다른 역할**이다.

| 화면 / route | 배경 | 카드·표면 | 기본/보조 글자 | 경계 | 버튼 | 아이콘 | 상태 | 입력 | 정의 위치 | dark 주의 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 커뮤니티 목록<br>`src/app/(tabs)/community.tsx` | CB | CS(avatar·사진·badge) | CT / CM; header T 혼합 | CD·E | 쓰기 T/CW; chip T/B | CC·CM·PINK·별 yellow | review 별/배지 | 댓글 CB/CT; placeholder CM | `src/screens/CommunityScreen.tsx:444–497; src/components/community/CommunityPostItem.tsx:468–575` | 공통/커뮤니티 둘 다 갱신; white는 이미지용 유지 |
| 홈<br>`src/app/(tabs)/index.tsx` | B | S(빈 상태·이미지 로딩) | T / M | E | 선택 T/W; 더보기 MB/T | T·M; 찜 PINK | badge INFO/BRAND | 없음 | `src/screens/HomeScreen.tsx:27; src/components/home/HomeTrendingSection.tsx:119–157` | banner onImage 고정; mounted 탭 재렌더 |
| 지도·검색·목록 바텀시트<br>`src/app/(tabs)/map.tsx` | SDK 지도/앱 surface 별도 | B(검색·목록·preview) | T / M | E | CTA G/W; filter T/W | 마커 고정11색·흰 glyph | 마커/cluster | B/T; placeholder | `src/screens/MapScreen.native.tsx:609–610,945–1218` | SDK 최초 생성/테마변경 제약·bitmap marker 재캡처 |
| 플레이스 탐색/전체<br>`src/app/(tabs)/places/index.tsx` | B | B·S; applied GREEN tint | T / M·I | E | 선택 T/W | T·M; 찜 PINK | INFO/BRAND·종료 회색 | B 상속/T; placeholder I | `src/screens/PlaceScreen.tsx:609–711; src/components/place/PopupGridCard.tsx:240–291` | 탐색/전체 subtree 유지; 배지 쌍·정렬 계산 보존 |
| 찜한 팝업<br>`src/app/(tabs)/profile/favorites.tsx` | B | S placeholder | T / M | E·CD header | retry G; 하트 G | T·G | 목록 상태 | 없음 | `src/app/(tabs)/profile/favorites.tsx:103–125` | 필드 역할 분리·뒤로가기 경로 유지 |
| 마이페이지<br>`src/app/(tabs)/profile/index.tsx` | B | B; 로그인 light Blur | T / M | E | G/B 로그인 | PINK·#F5B82E·#5B8DEF | 비로그인 상태 | 없음 | `src/app/(tabs)/profile/index.tsx:153–187,267–377` | light blur/tint·overlay·CTA text 역할 분리 |
| 문의 목록<br>`src/app/(tabs)/profile/inquiries/index.tsx` | B | 답변 S(상세) | T / M | E·CD | G/B; write T/B; selected T/B | T·M | error M | 투명/T; placeholder M(작성) | `src/components/profile/InquiryLayout.tsx:22–43; src/app/(tabs)/profile/inquiries/index.tsx:69–77` | exported inquiryStyles도 반응형 생성; 3route 공유 |
| 문의 작성<br>`src/app/(tabs)/profile/inquiries/write.tsx` | B | 답변 S(상세) | T / M | E·CD | G/B; write T/B; selected T/B | T·M | error M | 투명/T; placeholder M(작성) | `src/components/profile/InquiryLayout.tsx:22–43; src/app/(tabs)/profile/inquiries/index.tsx:69–77` | exported inquiryStyles도 반응형 생성; 3route 공유 |
| 문의 상세<br>`src/app/(tabs)/profile/inquiries/[id].tsx` | B | 답변 S(상세) | T / M | E·CD | G/B; write T/B; selected T/B | T·M | error M | 투명/T; placeholder M(작성) | `src/components/profile/InquiryLayout.tsx:22–43; src/app/(tabs)/profile/inquiries/index.tsx:69–77` | exported inquiryStyles도 반응형 생성; 3route 공유 |
| 로그인<br>`src/app/(tabs)/profile/login.tsx` | B | 부모면 | T / M | E | G/B; Google B/T | T·M | 오류 #B91C1C | 투명/T; placeholder M | `src/app/(tabs)/profile/login.tsx:141–151,180–217` | CTA 글자 B를 primaryText로 분리; keyboard appearance |
| 닉네임 변경<br>`src/app/(tabs)/profile/nickname.tsx` | B | 부모면 | T / M | E | G/B | T·M | error #DC2626; success greenText | 투명/T; placeholder M | `src/components/profile/AccountSettingsScreen.tsx:125–174` | 공유 nickname/password; password 값 유지·보안 blur 정책 유지 |
| 공지 목록<br>`src/app/(tabs)/profile/notices/index.tsx` | B | 부모면 | T / M | E·CD | retry G; link greenText | T | 공지 loading/error | 없음 | `src/components/profile/NoticeLayout.tsx:15–23` | exported noticeStyles도 반응형 생성 |
| 공지 상세<br>`src/app/(tabs)/profile/notices/[id].tsx` | B | 부모면 | T / M | E·CD | retry G; link greenText | T | 공지 loading/error | 없음 | `src/components/profile/NoticeLayout.tsx:15–23` | exported noticeStyles도 반응형 생성 |
| 비밀번호 변경<br>`src/app/(tabs)/profile/password.tsx` | B | 부모면 | T / M | E | G/B | T·M | error #DC2626; success greenText | 투명/T; placeholder M | `src/components/profile/AccountSettingsScreen.tsx:125–174` | 공유 nickname/password; password 값 유지·보안 blur 정책 유지 |
| 내가 쓴 게시글<br>`src/app/(tabs)/profile/posts.tsx` | B | CB·CS feed | T / M; CT / CM 카드 | E·CD | retry G | T·M·feed icon | feed 별·좋아요 | 없음 | `src/app/(tabs)/profile/posts.tsx:120–131; src/components/community/CommunityPostItem.tsx:468` | 같은 카드 재사용·사용자별 cache 보존 |
| 내가 쓴 리뷰<br>`src/app/(tabs)/profile/reviews.tsx` | B | CB·CS feed | T / M; CT / CM 카드 | E·CD | retry G | T·M·별 | feed 별·좋아요 | 없음 | `src/app/(tabs)/profile/reviews.tsx:109–120; src/components/community/CommunityPostItem.tsx:148` | 리뷰 재사용팔레트·삭제목록 동기화 보존 |
| 설정<br>`src/app/(tabs)/profile/settings.tsx` | B | 부모면 | T / I | E·CD | 탈퇴 #DC2626 | T·I; spinner G | destructive | 없음 | `src/app/(tabs)/profile/settings.tsx:123–168` | 현재 테마 메뉴 없음; native Alert 일치 |
| 회원가입<br>`src/app/(tabs)/profile/signup.tsx` | B | 부모면 | T / M | E; 선택 G | G/B; 보조 greenText | T·check B | 오류 #B91C1C | 투명/T; placeholder M | `src/app/(tabs)/profile/signup.tsx:481–577,650–716` | 체크·코드·비활성·오류 단계 모두검증 |
| 회원탈퇴<br>`src/app/(tabs)/profile/withdrawal.tsx` | B | 부모면 | T / M | — | G/B | T | 확인/실패 native Alert | 없음 | `src/app/(tabs)/profile/withdrawal.tsx:103–117` | 인증정리 유지·theme preference는 별도key |
| 게시글 작성·수정<br>`src/app/community/write.tsx` | CB | CS(비활성 등록) | CT / CM | CD·E | 등록 T/CW; 선택 T/B | CT·CC; 제거 CW | 오류 #B91C1C | 투명/CT; placeholder CM | `src/app/community/write.tsx:267–342` | draft·이미지 미리보기 유지; 사진 제거 white 별도 |
| 게시글 상세/댓글·대댓글<br>`src/app/community/[id].tsx` | CB | CS(사진·badge) | CT / CM | CD | 메뉴/댓글 CC; 좋아요 | CC·CM | primaryLight badge | 댓글 CB/CT; placeholder CM | `src/app/community/[id].tsx:420–494; src/components/community/CommunityComments.tsx:491,581–605` | native Alert/compact Modal·작성 입력 유지 |
| 팝업 상세/방문 리뷰 목록<br>`src/app/places/[id].tsx` | B | B; #F5F6F8·#F0FDF4 일부 | T / M | E | PINK/W 고정 CTA | Hero W; PINK·yellow·blue | Tag INFO/BRAND | 없음 | `src/app/places/[id].tsx:462–470,835–1060` | Hero·CTA onImage/primaryText를 B와 분리 |
| 약관·정책 목록<br>`src/app/profile/policies/index.tsx` | B | 부모면 | T / — | E·CD | — | T·I | — | 없음 | `src/app/profile/policies/index.tsx:43–52` | 구분선 커뮤니티토큰 혼용 |
| 위치기반서비스 정책<br>`src/app/profile/policies/location.tsx` | B | 부모면 | T / M(시행일) | CD header | — | T | — | 없음 | `src/components/profile/PolicyDetailScreen.tsx:45–58` | 긴 정책 가독성; 내용/레이아웃 그대로 유지 |
| 개인정보처리방침<br>`src/app/profile/policies/privacy.tsx` | B | 부모면 | T / M(시행일) | CD header | — | T | — | 없음 | `src/components/profile/PolicyDetailScreen.tsx:45–58` | 긴 정책 가독성; 내용/레이아웃 그대로 유지 |
| 이용약관<br>`src/app/profile/policies/terms.tsx` | B | 부모면 | T / M(시행일) | CD header | — | T | — | 없음 | `src/components/profile/PolicyDetailScreen.tsx:45–58` | 긴 정책 가독성; 내용/레이아웃 그대로 유지 |
| 방문 리뷰 작성·수정<br>`src/app/reviews/write.tsx` | CB | 부모면·CS 사진 | CT / CM | CD | header CC | 별 #FACC15/CM; 제거 CW | 오류 #B91C1C | 투명/CT; placeholder CM | `src/app/reviews/write.tsx:125,149–167` | 등록/수정 동일 화면; rating·draft 유지 |
| 방문 리뷰 상세<br>`src/app/reviews/[id].tsx` | CB | CS(사진 contain) | CT / CM | CD | CC; 좋아요 | CC·CM; 별 #FACC15 | INFO badge·별 | 댓글 CB/CT | `src/app/reviews/[id].tsx:405–470; src/components/community/CommunityImageCarousel.tsx:48–51` | 별색·사진·comment 동일팔레트 검증 |

route wrapper는 실제 renderer/import 경로로 추적했다. 지도 검색/목록/preview, 상세의 리뷰 탭, 댓글, modal, empty/loading/error는 별도 route 수를 늘리지 않고 아래 공통 의존 표로 조사했다.

| 공통/하위 UI | 현재 색상 정의 위치 | dark 주의 |
| --- | --- | --- |
| FilterChips / QuickFilterBar / RegionFilterGroup | `src/components/common/FilterChips.tsx:61–73`, `src/components/place/QuickFilterBar.tsx`, `RegionFilterGroup.tsx` | selected background/text 쌍. mode 변경 시 filter 값 유지 |
| MoreButton / Tag | `src/components/common/MoreButton.tsx:31–45`, `Tag.tsx:28–33` | primaryText를 B와 분리. info/brand 쌍 |
| FloatingTabBar / SVG icons | `src/components/navigation/FloatingTabBar.tsx:105,355–407,449–495`, `FilledTabIcons.tsx:6,32,39–40` | §7 재질/내부 fill 모두 |
| 지도 검색 / 목록 / preview | `src/components/map/MapSearchOverlay.tsx:113–149`, `MapPopupListSheet.tsx:51–60,156–206`, `MapPopupPreviewCard.tsx:59–61,106–141` | 지도 style과 앱 표면/오류/attribution 따로 |
| Place sheet / Community compact menu | `src/components/place/PlaceFilterSheet.tsx:278–352`, `src/components/community/CommunityPostMenu.tsx:84–95` | Modal·backdrop·handle. 기존 fade/slide/dismiss 보존 |
| 댓글 / Author / ImageCarousel | `src/components/community/CommunityComments.tsx:546–605`, `CommunityAuthor.tsx`, `CommunityImageCarousel.tsx:48–51` | avatar fallback·input·reply·pagination·삭제 Alert |
| Skeleton 및 empty | `src/components/common/SkeletonBlock.tsx:15–45`, `PopupDetailSkeleton.tsx:63`, `HomeTrendingSection.tsx:138–157` | 면 대비만 mode별. shared pulse·cleanup 유지 |
| Header / 정책·공지·문의 / 계정 입력 | `src/components/profile/PolicyDetailScreen.tsx:45–58`, `NoticeLayout.tsx:15–23`, `InquiryLayout.tsx:22–43`, `AccountSettingsScreen.tsx:156–174` | shared/exported StyleSheet·SafeArea·placeholder 모두 |
| Poster/소개 이미지 | `src/components/place/PopupHeroImage.tsx:40–42`, `IntroductionImageCarousel.tsx:104–105`, `HomeBanner.tsx:66–83` | 원본 사진 색상/캐시 유지. wrapper/onImage/gradient만 역할 확인 |

### 3.2 하드코딩140개 위치 전수 목록

번호는 색상 literal별이다. 같은 행의 color/fill 두 속성도 실제 두 위치이므로 별개다. “유지”는 하드코딩이 결함이라는 뜻이 아니며, “테마화”도 현재 light 디자인을 바꾸라는 뜻이 아니다.

#### src/app/(tabs)/profile/index.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C001 | `src/app/(tabs)/profile/index.tsx:153` | `#FF5A6E` | iconColor | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C002 | `src/app/(tabs)/profile/index.tsx:154` | `#FF5A6E` | iconFill | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C003 | `src/app/(tabs)/profile/index.tsx:164` | `#F5B82E` | iconColor | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C004 | `src/app/(tabs)/profile/index.tsx:165` | `#F5B82E` | iconFill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C005 | `src/app/(tabs)/profile/index.tsx:174` | `#5B8DEF` | iconColor | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C006 | `src/app/(tabs)/profile/index.tsx:175` | `#5B8DEF` | iconFill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |

#### src/app/(tabs)/profile/inquiries/index.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C007 | `src/app/(tabs)/profile/inquiries/index.tsx:74` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |

#### src/app/(tabs)/profile/login.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C008 | `src/app/(tabs)/profile/login.tsx:196` | `#B91C1C` | color | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |

#### src/app/(tabs)/profile/settings.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C009 | `src/app/(tabs)/profile/settings.tsx:165` | `#DC2626` | color | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |

#### src/app/(tabs)/profile/signup.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C010 | `src/app/(tabs)/profile/signup.tsx:697` | `#B91C1C` | color | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |

#### src/app/community/write.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C011 | `src/app/community/write.tsx:318` | `#B91C1C` | color | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |

#### src/app/places/[id].tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C012 | `src/app/places/[id].tsx:512` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C013 | `src/app/places/[id].tsx:513` | `#FF5A6E` | fill | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C014 | `src/app/places/[id].tsx:523` | `#F5B800` | color | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C015 | `src/app/places/[id].tsx:523` | `#F5B800` | fill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C016 | `src/app/places/[id].tsx:532` | `#5B8DEF` | color | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C017 | `src/app/places/[id].tsx:532` | `#5B8DEF` | fill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C018 | `src/app/places/[id].tsx:851` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C019 | `src/app/places/[id].tsx:866` | `#FF5A6E` | backgroundColor | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C020 | `src/app/places/[id].tsx:867` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C021 | `src/app/places/[id].tsx:946` | `#F5F6F8` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C022 | `src/app/places/[id].tsx:1060` | `#F0FDF4` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/app/reviews/write.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C023 | `src/app/reviews/write.tsx:125` | `#FACC15` | color | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C024 | `src/app/reviews/write.tsx:125` | `#FACC15` | fill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C025 | `src/app/reviews/write.tsx:167` | `#B91C1C` | color | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |

#### src/app/reviews/[id].tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C026 | `src/app/reviews/[id].tsx:310` | `#FACC15` | color | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C027 | `src/app/reviews/[id].tsx:310` | `#FACC15` | fill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |

#### src/components/common/SkeletonBlock.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C028 | `src/components/common/SkeletonBlock.tsx:45` | `#F1F3F5` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/community/CommunityPostItem.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C029 | `src/components/community/CommunityPostItem.tsx:148` | `#FACC15` | color | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C030 | `src/components/community/CommunityPostItem.tsx:149` | `#FACC15` | fill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C031 | `src/components/community/CommunityPostItem.tsx:202` | `#FACC15` | color | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C032 | `src/components/community/CommunityPostItem.tsx:202` | `#FACC15` | fill | 상태/기능 icon | 별·게시글 identity 유지; 대비/표기 일관성 검수 |
| C033 | `src/components/community/CommunityPostItem.tsx:499` | `#f0fdf4` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C034 | `src/components/community/CommunityPostItem.tsx:545` | `rgba(0, 0, 0, 0.45)` | backgroundColor | 사진 위 count/overflow | 검정 shade/CW 글자 유지 |
| C035 | `src/components/community/CommunityPostItem.tsx:568` | `rgba(0, 0, 0, 0.65)` | backgroundColor | 사진 위 count/overflow | 검정 shade/CW 글자 유지 |

#### src/components/community/CommunityPostMenu.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C036 | `src/components/community/CommunityPostMenu.tsx:11` | `#DC2626` | expression | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |
| C037 | `src/components/community/CommunityPostMenu.tsx:86` | `rgba(0, 0, 0, 0.4)` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/home/HomeBanner.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C038 | `src/components/home/HomeBanner.tsx:66` | `#000000` | stopColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C039 | `src/components/home/HomeBanner.tsx:72` | `#000000` | stopColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C040 | `src/components/home/HomeBanner.tsx:80` | `#000000` | stopColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C041 | `src/components/home/HomeBanner.tsx:83` | `#000000` | stopColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C042 | `src/components/home/HomeBanner.tsx:231` | `#FFFFFF` | color | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C043 | `src/components/home/HomeBanner.tsx:290` | `#000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C044 | `src/components/home/HomeBanner.tsx:305` | `#FFFFFF` | color | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C045 | `src/components/home/HomeBanner.tsx:306` | `rgba(0,0,0,0.45)` | textShadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C046 | `src/components/home/HomeBanner.tsx:313` | `#FFFFFF` | color | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C047 | `src/components/home/HomeBanner.tsx:314` | `rgba(0,0,0,0.45)` | textShadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C048 | `src/components/home/HomeBanner.tsx:340` | `rgba(255,255,255,0.45)` | backgroundColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C049 | `src/components/home/HomeBanner.tsx:342` | `#FFFFFF` | backgroundColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C050 | `src/components/home/HomeBanner.tsx:343` | `#252525` | backgroundColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |
| C051 | `src/components/home/HomeBanner.tsx:351` | `rgba(0,0,0,0.28)` | backgroundColor | 사진 overlay/onImage | 흰 caption·검정 gradient/shade 유지; 실제 이미지 대비 검사 |

#### src/components/home/NewPopupCard.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C052 | `src/components/home/NewPopupCard.tsx:55` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C053 | `src/components/home/NewPopupCard.tsx:62` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C054 | `src/components/home/NewPopupCard.tsx:64` | `#FF5A6E` | fill | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C055 | `src/components/home/NewPopupCard.tsx:104` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C056 | `src/components/home/NewPopupCard.tsx:155` | `#F3F4F6` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C057 | `src/components/home/NewPopupCard.tsx:159` | `#4B5563` | color | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/home/PopupRankingCard.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C058 | `src/components/home/PopupRankingCard.tsx:64` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C059 | `src/components/home/PopupRankingCard.tsx:65` | `#FF5A6E` | fill | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C060 | `src/components/home/PopupRankingCard.tsx:106` | `rgba(0, 0, 0, 0.55)` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C061 | `src/components/home/PopupRankingCard.tsx:137` | `#F3F4F6` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C062 | `src/components/home/PopupRankingCard.tsx:143` | `#4B5563` | color | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/icons/FilledTabIcons.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C063 | `src/components/icons/FilledTabIcons.tsx:6` | `#000000` | fill | glyph 내부 fill: 테마 대상 | 선택 아이콘 색상과 내부 Path/Circle fill 같이 연동 |
| C064 | `src/components/icons/FilledTabIcons.tsx:32` | `#000000` | fill | glyph 내부 fill: 테마 대상 | 선택 아이콘 색상과 내부 Path/Circle fill 같이 연동 |
| C065 | `src/components/icons/FilledTabIcons.tsx:39` | `#000000` | fill | glyph 내부 fill: 테마 대상 | 선택 아이콘 색상과 내부 Path/Circle fill 같이 연동 |
| C066 | `src/components/icons/FilledTabIcons.tsx:40` | `#000000` | fill | glyph 내부 fill: 테마 대상 | 선택 아이콘 색상과 내부 Path/Circle fill 같이 연동 |

#### src/components/map/MapPopupListSheet.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C067 | `src/components/map/MapPopupListSheet.tsx:60` | `#F3F4F6` | expression | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/map/MapSearchOverlay.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C068 | `src/components/map/MapSearchOverlay.tsx:113` | `#5E5E5E` | color | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/navigation/FloatingTabBar.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C069 | `src/components/navigation/FloatingTabBar.tsx:105` | `#000000` | color | 탭 foreground: 테마 대상 | tabIcon 색상·selectedFill 연동 |
| C070 | `src/components/navigation/FloatingTabBar.tsx:355` | `rgba(0, 0, 0, 0.06)` | tintColor | 재질 전용 tint | Glass colorScheme 및 tint의 양쪽 대비 검증 |
| C071 | `src/components/navigation/FloatingTabBar.tsx:407` | `#000000` | expression | 탭 foreground: 테마 대상 | tabIcon 색상·selectedFill 연동 |
| C072 | `src/components/navigation/FloatingTabBar.tsx:455` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C073 | `src/components/navigation/FloatingTabBar.tsx:466` | `rgba(255, 255, 255, 0.42)` | borderColor | 재질 전용 token | border/tint/indicator만 모드별; 치수·spring 유지 |
| C074 | `src/components/navigation/FloatingTabBar.tsx:467` | `rgba(255, 255, 255, 0.58)` | borderTopColor | 재질 전용 token | border/tint/indicator만 모드별; 치수·spring 유지 |
| C075 | `src/components/navigation/FloatingTabBar.tsx:471` | `rgba(255, 255, 255, 0.08)` | backgroundColor | 재질 전용 token | border/tint/indicator만 모드별; 치수·spring 유지 |
| C076 | `src/components/navigation/FloatingTabBar.tsx:494` | `rgba(0, 0, 0, 0.09)` | backgroundColor | 재질 전용 token | border/tint/indicator만 모드별; 치수·spring 유지 |

#### src/components/place/AppliedFilterBar.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C077 | `src/components/place/AppliedFilterBar.tsx:121` | `#F0FDF4` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C078 | `src/components/place/AppliedFilterBar.tsx:126` | `#BBF7D0` | borderColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C079 | `src/components/place/AppliedFilterBar.tsx:159` | `#D1D5DB` | color | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/place/IntroductionImageCarousel.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C080 | `src/components/place/IntroductionImageCarousel.tsx:104` | `rgba(0, 0, 0, 0.55)` | backgroundColor | 사진 위 counter | 검정 shade/흰 문자를 배경 token과 분리 |
| C081 | `src/components/place/IntroductionImageCarousel.tsx:105` | `#FFFFFF` | color | 사진 위 counter | 검정 shade/흰 문자를 배경 token과 분리 |

#### src/components/place/OfficialChannelIcon.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C082 | `src/components/place/OfficialChannelIcon.tsx:14` | `#E4405F` | color | 고정 브랜드 glyph | 다색 유지; X/Threads는 밝은 전용표면/공식 밝은 glyph 검수 |
| C083 | `src/components/place/OfficialChannelIcon.tsx:18` | `#111827` | color | 고정 브랜드 glyph | 다색 유지; X/Threads는 밝은 전용표면/공식 밝은 glyph 검수 |
| C084 | `src/components/place/OfficialChannelIcon.tsx:22` | `#FF0033` | color | 고정 브랜드 glyph | 다색 유지; X/Threads는 밝은 전용표면/공식 밝은 glyph 검수 |
| C085 | `src/components/place/OfficialChannelIcon.tsx:26` | `#111827` | color | 고정 브랜드 glyph | 다색 유지; X/Threads는 밝은 전용표면/공식 밝은 glyph 검수 |
| C086 | `src/components/place/OfficialChannelIcon.tsx:30` | `#0866FF` | color | 고정 브랜드 glyph | 다색 유지; X/Threads는 밝은 전용표면/공식 밝은 glyph 검수 |

#### src/components/place/PlaceFilterSheet.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C087 | `src/components/place/PlaceFilterSheet.tsx:278` | `rgba(0, 0, 0, 0.4)` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/place/PlaceInterestSection.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C088 | `src/components/place/PlaceInterestSection.tsx:78` | `#000000` | stopColor | 사진 위 shade | 검정 gradient/18% overlay 유지; 밝은 포스터도검수 |
| C089 | `src/components/place/PlaceInterestSection.tsx:79` | `#000000` | stopColor | 사진 위 shade | 검정 gradient/18% overlay 유지; 밝은 포스터도검수 |
| C090 | `src/components/place/PlaceInterestSection.tsx:80` | `#000000` | stopColor | 사진 위 shade | 검정 gradient/18% overlay 유지; 밝은 포스터도검수 |

#### src/components/place/PlaceRegionSection.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C091 | `src/components/place/PlaceRegionSection.tsx:183` | `rgba(0, 0, 0, 0.18)` | backgroundColor | 사진 위 shade | 검정 gradient/18% overlay 유지; 밝은 포스터도검수 |

#### src/components/place/PlaceWeeklyPopupList.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C092 | `src/components/place/PlaceWeeklyPopupList.tsx:148` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C093 | `src/components/place/PlaceWeeklyPopupList.tsx:149` | `#FF5A6E` | fill | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |

#### src/components/place/PopupDetailSkeleton.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C094 | `src/components/place/PopupDetailSkeleton.tsx:63` | `#F5F6F8` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/place/PopupGridCard.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C095 | `src/components/place/PopupGridCard.tsx:99` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C096 | `src/components/place/PopupGridCard.tsx:106` | `#FF5A6E` | color | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C097 | `src/components/place/PopupGridCard.tsx:108` | `#FF5A6E` | fill | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C098 | `src/components/place/PopupGridCard.tsx:203` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C099 | `src/components/place/PopupGridCard.tsx:241` | `#1D4ED8` | color | 상태 badge 쌍 | 상태 의미 유지; foreground/background 함께검토 |
| C100 | `src/components/place/PopupGridCard.tsx:244` | `#15803D` | color | 상태 badge 쌍 | 상태 의미 유지; foreground/background 함께검토 |
| C101 | `src/components/place/PopupGridCard.tsx:247` | `#6B7280` | color | 상태 badge 쌍 | 상태 의미 유지; foreground/background 함께검토 |
| C102 | `src/components/place/PopupGridCard.tsx:250` | `#DBEAFE` | backgroundColor | 상태 badge 쌍 | 상태 의미 유지; foreground/background 함께검토 |
| C103 | `src/components/place/PopupGridCard.tsx:253` | `#DCFCE7` | backgroundColor | 상태 badge 쌍 | 상태 의미 유지; foreground/background 함께검토 |
| C104 | `src/components/place/PopupGridCard.tsx:256` | `#F3F4F6` | backgroundColor | 상태 badge 쌍 | 상태 의미 유지; foreground/background 함께검토 |
| C105 | `src/components/place/PopupGridCard.tsx:288` | `#F3F4F6` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |
| C106 | `src/components/place/PopupGridCard.tsx:291` | `#4B5563` | color | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/place/PopupGuidanceCarousel.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C107 | `src/components/place/PopupGuidanceCarousel.tsx:166` | `#F7F8FA` | backgroundColor | 표면/텍스트/경계: 테마 대상 | 역할에 맞는 semantic palette; light 기준값 보존 |

#### src/components/place/TodayOpeningCarousel.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C108 | `src/components/place/TodayOpeningCarousel.tsx:262` | `#000000` | stopColor | 사진 caption/shade | onImage 유지; dark Blur는의도적 |
| C109 | `src/components/place/TodayOpeningCarousel.tsx:265` | `#000000` | stopColor | 사진 caption/shade | onImage 유지; dark Blur는의도적 |
| C110 | `src/components/place/TodayOpeningCarousel.tsx:379` | `#ff2f47` | backgroundColor | 반응/상태 의미 | 찜/마감 역할 유지; 같은 색으로 무조건 합치지 않기 |
| C111 | `src/components/place/TodayOpeningCarousel.tsx:391` | `#F3F4F6` | color | 사진 caption/shade | onImage 유지; dark Blur는의도적 |

#### src/components/profile/AccountSettingsScreen.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C112 | `src/components/profile/AccountSettingsScreen.tsx:173` | `#DC2626` | color | error/destructive 의미 | 텍스트·아이콘 의미 유지; dark danger foreground 쌍 검토 |

#### src/screens/CommunityScreen.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C113 | `src/screens/CommunityScreen.tsx:488` | `#000000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |

#### src/screens/MapScreen.native.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C114 | `src/screens/MapScreen.native.tsx:114` | `#8B5CF6` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C115 | `src/screens/MapScreen.native.tsx:115` | `#2563EB` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C116 | `src/screens/MapScreen.native.tsx:116` | `#DB2777` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C117 | `src/screens/MapScreen.native.tsx:117` | `#374151` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C118 | `src/screens/MapScreen.native.tsx:118` | `#FB7185` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C119 | `src/screens/MapScreen.native.tsx:119` | `#F97316` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C120 | `src/screens/MapScreen.native.tsx:120` | `#0D9488` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C121 | `src/screens/MapScreen.native.tsx:121` | `#EAB308` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C122 | `src/screens/MapScreen.native.tsx:122` | `#84A98C` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C123 | `src/screens/MapScreen.native.tsx:123` | `#38BDF8` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C124 | `src/screens/MapScreen.native.tsx:124` | `#9CA3AF` | backgroundColor | 고정 category marker | 11개 identity 유지; 지도 dark 위 대비 |
| C125 | `src/screens/MapScreen.native.tsx:733` | `#FFFFFF` | fill | 마커 고정 white | 화이트 glyph/ring 유지 우선; SDK bitmap 재캡처 검증 |
| C126 | `src/screens/MapScreen.native.tsx:742` | `#FFFFFF` | color | 마커 고정 white | 화이트 glyph/ring 유지 우선; SDK bitmap 재캡처 검증 |
| C127 | `src/screens/MapScreen.native.tsx:1007` | `#FFFFFF` | backgroundColor | 마커 고정 white | 화이트 glyph/ring 유지 우선; SDK bitmap 재캡처 검증 |
| C128 | `src/screens/MapScreen.native.tsx:1011` | `#000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C129 | `src/screens/MapScreen.native.tsx:1047` | `#111827` | color | 지도 라벨/halo 전용 | 단순 text 반전 금지; dark map label/white halo 같이검수 |
| C130 | `src/screens/MapScreen.native.tsx:1049` | `rgba(255, 255, 255, 0.9)` | textShadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C131 | `src/screens/MapScreen.native.tsx:1141` | `#000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C132 | `src/screens/MapScreen.native.tsx:1167` | `#000` | shadowColor | 고정 shadow/halo | 명암 조합 검수; shadow 수치·레이아웃 보존 |
| C133 | `src/screens/MapScreen.native.tsx:1210` | `#22C55E` | backgroundColor | 고정 브랜드 | G 유지; primary 재사용 가능 |
| C134 | `src/screens/MapScreen.native.tsx:1215` | `#FFFFFF` | color | onPrimary 글자 | white/brand 2.28:1; 별도 foreground 디자인 검토 |

#### src/screens/PlaceScreen.tsx

| ID | 위치 | 값 | 속성/역할 | 분류 | 향후 조치 |
| --- | --- | --- | --- | --- | --- |
| C135 | `src/screens/PlaceScreen.tsx:633` | `#000000` | borderBottomColor | 선택 indicator: 테마 대상 | foreground와 명암 쌍; 탭 크기/위치 유지 |

#### 설정과 생성 native 리소스

| ID | 위치 | 값 | 분류·향후 조치 |
| --- | --- | --- | --- |
| C136 | `app.json:20` | `#E6F4FE` | Adaptive icon 배경. 화면 표면 색과 분리; 브랜드 asset 검수 |
| C137 | `app.json:36` | `#208AEF` | splash 배경. light/dark native splash 확정 필요 |
| C138 | `android/app/src/main/res/values/colors.xml:2` | `#208AEF` | 생성 splash 색. app.json 반영 build와 일치 확인 |
| C139 | `android/app/src/main/res/values/colors.xml:3` | `#E6F4FE` | 생성 adaptive icon. app.json과 같은 출처 |
| C140 | `android/app/src/main/res/values/colors.xml:4` | `#023c69` | 생성 native colorPrimary. G와 다름; native widget accent 영향 확인 |

Android 폴더는 Git ignore되는 생성 산출물이다. 세 native 색을 다른 앱 화면의 확정 브랜드로 취급하지 않는다. `android/app/src/main/res/values-night/colors.xml:1`은 `<resources/>`로 비어 있고 XML 읽기 검사 정상이며 night 색상 override는 없다. iOS native 프로젝트가 이 workspace에 없어 Info.plist/launch storyboard의 실제 빌드 산출물은 확인하지 못했다.

## 4. 기존 공통 색상 구조

| 중앙 정의 | 현재 필드 / 값 | 실제 소비·평가 |
| --- | --- | --- |
| src/theme/tokens.ts:2–6 | primary #22C55E / primaryLight #DCFCE7 / primaryDark #15803D / infoLight #DBEAFE / infoDark #1D4ED8 | 브랜드·배지 의미가 있는 정상 정의. primaryDark는 강조 글자 역할도 있음 |
| src/theme/tokens.ts:7–9 | background #FFFFFF / surface #F8FAFC / moreButtonBackground #F7F8FC | 주요 theme 전환 지점. background는 foreground용 흰색까지 겸하므로 분리 |
| src/theme/tokens.ts:10–13 | text #111827 / secondaryText #6B7280 / inactiveText #9CA3AF / inactiveTabText #B8BEC8 | 선택 가능한 inactive/placeholder와 비활성 handle/counter 역할 구분 |
| src/theme/tokens.ts:14–16 | border #E5E7EB / paginationActive #494B4F / paginationInactive #E5E7EB | 값이 같아도 border·pagination은 다른 역할 |
| src/theme/tokens.ts:17 | brandGradient #22C55E → #86EFAC | 현재 활성 consumer 미발견. 정상 보유 token; 자동 제거 안 함 |
| src/theme/communityColors.ts:2–7 | background #FFFFFF / text #252D3A / secondaryText #818B9B / divider #E8EBF0 / mutedSurface #F1F3F7 / charcoal #303A49 | DESIGN의 전용 palette를 재사용. dark variant는 별도 승인 필요 |
| src/theme/communityColors.ts:8–9 | placeLink #526071 / white #FFFFFF | placeLink 실제 참조 미발견. white는 onImage·고정 채움 역할이라 dark background처럼 바꾸면 안 됨 |

16+8개 필드 중22개가 활성 코드에서 직접 참조된다. 620회는 정적 property access 수이며 runtime 사용 횟수가 아니다. import alias/destructuring으로 다른 이름을 사용하는 경우를 모두 포함한 숫자로 주장하지 않는다.

| 활성 직접 참조 | 횟수 |
| --- | --- |
| `colors.text` | 143 |
| `colors.secondaryText` | 100 |
| `colors.background` | 92 |
| `colors.border` | 45 |
| `colors.primary` | 36 |
| `communityColors.secondaryText` | 34 |
| `communityColors.text` | 29 |
| `communityColors.charcoal` | 24 |
| `communityColors.divider` | 22 |
| `colors.primaryDark` | 18 |
| `colors.surface` | 12 |
| `colors.inactiveText` | 12 |
| `communityColors.white` | 9 |
| `communityColors.mutedSurface` | 8 |
| `communityColors.background` | 7 |
| `colors.infoDark` | 7 |
| `colors.primaryLight` | 6 |
| `colors.infoLight` | 6 |
| `colors.paginationActive` | 3 |
| `colors.inactiveTabText` | 3 |
| `colors.moreButtonBackground` | 2 |
| `colors.paginationInactive` | 2 |

같은 HEX를 서로 다른 역할에 쓰는 것은 정상이다. 예: B가 화면 배경뿐 아니라 MoreButton.tsx:45·로그인 submitText·상세 Hero icon의 흰색이다. colors.text는 foreground/selected 배경뿐 아니라 profile/index.tsx:292의 shadowColor에도 쓰인다. 색상을 통째로 반전하면 shadow가 밝은 glow가 되는 등 의도하지 않은 변화가 생길 수 있다.

communityColors.divider는 favorites/settings/공지·문의·정책 header에도 쓰여 전용 palette 변경이 다른 화면으로 전파된다. 모듈 colors 객체를 mutate하는 방식은 StyleSheet 생성값·memo·shared export·native options를 함께 갱신하지 못한다. 색상 의존 style에만 작은 factory/Hook을 적용하고 spacing/typography/radius·Animated refs는 그대로 둔다.

## 5. 라이트/다크 토큰 제안

아래 dark HEX는 비교용 **후보 예시**이며 확정 디자인이 아니다. DESIGN 승인·명암 검사·기기 검수 후 결정한다. light 값과 레이아웃은 우선 그대로 보존한다. 이름은 기존 naming을 유지한 semantic alias여도 된다.

| 역할 | 현재 light / 연결 근거 | dark 후보·최소 전략 | 도입 판단 |
| --- | --- | --- | --- |
| background | B; src/screens/HomeScreen.tsx:27 등 | #101318 후보 | 필수 |
| surface | S; src/components/common/Tag.tsx:28 / placeholder | #1A2029 후보 | 필수 |
| surfaceSecondary | 커뮤니티 CS, 안내 #F7F8FA, skeleton #F1F3F5 | #232B36 후보; community variant 유지 | 면별 필요. 글로벌 한 색으로 강제 통합 안 함 |
| textPrimary | T, 커뮤니티 CT | #F3F4F6 후보; community foreground 별도 | 필수 |
| textSecondary | M, 커뮤니티 CM | #A7AFBD 후보 | 필수 |
| textMuted / inactiveText | I / inactiveTabText 각각 역할 | #8C96A8 후보 + disabled/handle 별도 | placeholder·선택 가능한 텍스트와 disabled 구분 |
| border / divider | E / CD | #384152 후보; 의미 alias 분리 가능 | hairline/두께 유지 |
| inputBackground | 현재 대다수 투명/부모 B 상속 | background/surface alias | 입력 면을 새로 채워 light 디자인 바꾸지 않기 |
| inputBorder | E/CD | border alias | 새 고유색은 불필요 |
| primary | G | **#22C55E 유지** | 브랜드 변경 없음 |
| primaryText / onPrimary | 현재 대부분 B(흰색), 지도 W | dark #111827 후보. light white는 현 기준 유지하되 2.28:1 별도 검토 | 역할 분리 필수. foreground 변경은 디자인 결정 |
| brandText / brandSubtleSurface | primaryDark/primaryLight; applied #F0FDF4/#BBF7D0 | 밝은 green foreground + dark green surface 후보 | G 자체와 구분; 면/글자 쌍 검수 |
| danger/error | #B91C1C 또는 #DC2626 | #F87171 후보 | 오류·탈퇴·삭제 실제 존재. 하나로 합칠지는 의미 검수 |
| success | src/components/profile/AccountSettingsScreen.tsx:150,174 성공 메시지 primaryDark | brandText alias 가능 | 기능 존재; 새 고유색 필수 아님 |
| warning | 표준 warning palette 미발견; 마감 badge 별도 | 현재 추가 보류 | 별점 yellow를 warning으로 오해하지 않기 |
| overlay | sheet/menu black0.4; image shade 별도 | modalScrim 고정 우선, dark alpha 검수 | 기존 fade/translate 유지 |
| onImage / imageShade / shadow | white captions/black shade/black shadow | 양쪽 고정 우선 | background와 분리 필수 |
| selectedControlBackground/Text | 현재 T/W, 일부CC/CW | 밝은 neutral/어두운 foreground 등 승인 쌍 | charcoal를 밝게 바꾸면서 CW를 유지하면 흰 글자 사라짐 |
| pagination/placeholder | tokens pagination 및 skeleton 회색 | mode별 대비쌍 | indicator 크기·줄수·opacity pulse 유지 |
| component: tabBar/marker/status | glass tint/border/indicator; category marker; info/open 배지 | 별도 component 역할 유지 | 전역 반전 제외. §7–8 |

가장 먼저 분리할 것은 **화면 배경 / onImage / onPrimary / selectedControlText**다. communityColors.white를 검정으로 바꾸지 않는다. communityColors.charcoal도 텍스트와 버튼 배경을 겸하므로 역할별로 나눈다.

## 6. 테마 선택 및 저장 구조

### 6.1 현재 없는 기능과 최소 구현안

| 항목 | 현재 코드 확인 | 향후 최소안 |
| --- | --- | --- |
| 기본값/3모드 | 설정 화면은 계정 메뉴뿐(src/app/(tabs)/profile/settings.tsx:61–114) | 저장 preference light/dark/system. 저장 없음은system |
| 시스템 감지 | useColorScheme/Appearance 소비 없음 | RN 기본 useColorScheme 사용. 별도 감지 패키지 불필요 |
| resolved mode | 고정 light 팔레트 | system이면 기기 dark/light, null/불명은light; 명시 선택이면override |
| 저장/복원 | theme 저장 없음. SecureStore는 auth만(src/lib/auth.ts:156–238) | 이미 설치된 SecureStore(package.json:23)에 독립 theme preference key 저장. 인증 key와 분리 |
| AsyncStorage | 설치·사용 미발견 | 이 기능 하나 때문에 추가할 필요는 없음. 이미 있는 SecureStore의 device preference 저장으로 시작 가능 |
| 즉시 갱신 | static StyleSheet·상수 | Root theme state + 작은 useAppTheme Hook/Context; 색상 의존 style 생성. primitive theme mode별 객체 안정성 유지 |
| 시작 깜빡임 | hydration gate/SplashScreen 수동 제어 없음 | 초기 저장값 복원·native 외형·root background 준비 후 UI/스플래시 전환. 실패/손상 값은system으로 복구 |
| 시스템 변경 | app.json automatic뿐 | system 모드에서 구독 갱신. foreground 복귀/OS 변경 테스트 |
| 로그인/로그아웃 | auth의 token key 제거와 별도 preference 없음 | theme는 device 설정으로 유지; 계정 전환/로그아웃에도 보존 |
| 언어 독립 | i18n는 고정ko(src/locales/index.ts:4–8) | 향후 locale와 theme를 독립 state/key로 구성. 국가 필터와도 분리 |
| Router 연동 | src/app/_layout.tsx:7 Stack; theme provider 없음 | 설치된 expo-router ThemeProvider/DefaultTheme/DarkTheme로 navigation 색만 연결. 브랜드 primary+background/card/text/border 매핑 |
| native 외형 | OS automatic이라 앱 palette와 달라질 수 있음 | manual mode에서 RN Appearance app override를 동기화; system으로 돌아갈 때 override 해제 |

device preference 비동기 쓰기는 마지막 선택을 보존하도록 serialize/generation을 사용한다. 이전 복원 응답이 사용자의 새 선택을 덮지 않도록 하며 theme 복원 때문에 auth 부트스트랩/세션 요청의 순서를 바꾸지 않는다. 별도 ThemeProvider 구현은 다음 작업 제안이며 이번에는 추가하지 않았다.

### 6.2 설치 버전 주의

현재 RN0.86.3(package.json:32)의 Appearance는 **setColorScheme('light'|'dark'|'unspecified')**이며 system 복귀는 'unspecified'로 처리한다. 설치 코드(node_modules/react-native/Libraries/Utilities/Appearance.js:96–106; node_modules/react-native/src/private/specs_DEPRECATED/modules/NativeAppearance.js:15–23)와 RN0.86 문서를 확인했다. 최신 RN 문서의 'auto' 예제를 그대로 복사하지 않는다. [React Native 0.86 Appearance](https://reactnative.dev/docs/0.86/appearance)

Appearance override 후 useColorScheme/getColorScheme은 앱 override의 영향을 받는다. system mode로 전환할 때 반드시 먼저 native override를 해제하고 기기 값을 다시 해석하는 흐름이 필요하다. native 동기화와 JS preference를 같은 state로 혼동하거나 change event를 사용자 선택 저장으로 되먹임하지 않는다.

app.json:9 automatic와 설치된 expo-system-ui(package.json:27)는 기본 native 지원 준비다. **실제 JS 디자인 토큰 자동 전환은 별도**다. [Expo Color themes](https://docs.expo.dev/develop/user-interface/color-themes/)

expo-router가 이미 필요한 ThemeProvider를 export하므로 별도 NavigationContainer나 root JS Stack을 새로 만들지 않는다. Root/탭/하위 Stack의 options 배경만 resolved palette에 연결한다. [Expo Stack Toolbar의 ThemeProvider 예시](https://docs.expo.dev/router/advanced/stack-toolbar/)

### 6.3 상태 보존 원칙

테마 값을 navigator key/MapView key/전체 앱 key로 사용해 remount하지 않는다. route history, 뒤로 스와이프, 탭 스크롤 위치, list cursor, draft, marker 선택, 카메라, Reanimated shared value를 유지하며 색상만 반영한다. ThemeProvider value가 매 렌더 바뀌어 데이터 hooks의 refetch 조건까지 전달되지 않도록 theme state와 business state를 분리한다.

## 7. FloatingTabBar 대응

### 7.1 실제 구현과 색상 소비

사용자 설명과 달리 **현재 FloatingTabBar의 애니메이션은 RN Animated/PanResponder**다(src/components/navigation/FloatingTabBar.tsx:23–31,77–99,193–203,324–333). 지도 목록은 Reanimated다. 둘 다 현재 구조를 유지하고 animation library를 바꾸지 않는다. 정적 감사에서 FPS를 측정하지 않았다.

| 항목 | 실제 코드 | 확인·향후 색상 조치 |
| --- | --- | --- |
| 지원 분기 | FloatingTabBar.tsx:117–120 iOS + isLiquidGlassAvailable + isGlassEffectAPIAvailable | 현재 capability/fallback 로직 유지 |
| iOS glass | :353–357 regular, black0.06 tint; colorScheme 미지정 | 설치 GlassView.types.ts:43–46은 auto 기본이며 수동테마 override 지원. resolvedTheme colorScheme 연동 가능 |
| fallback Blur | :360–364 intensity15 / tint=light / dimezisBlurViewSdk31Plus | dark에서는 tint dark 후보; 강도·geometry 변경 대상 아님. Android blur 불가 구간 재질 fallback 대비 |
| 캡슐 경계/tint | :466–471 white0.42/0.58 border, transparent base, white0.08 tint | mode별 tabBarBorder/highlight/tint; 실배경으로 검수 |
| indicator | :490–494 black0.09, 폭72/높이50 | dark에서 인지 가능한 gray/white translucency 후보. 폭/높이/움직임 유지 |
| 아이콘 stroke | :105 black | tabIcon foreground 연동 |
| 선택 fill | :404–408 places/community만 black fill, 나머지 fill none + 별도 filled glyph | path 내부 fill도 함께 처리. 부모 color만 변경하면 검정 채움은 남음 |
| 내부 glyph | src/components/icons/FilledTabIcons.tsx:6,32,39–40 black path/circle | 모양은 그대로, fill만 theme foreground/currentColor 등의 방식으로 통일 |
| 글자/접근성 | FloatingTabBar.tsx:409–415 title을 accessibilityLabel로 사용 | 눈에 보이는 tab text 없음. 번역 예정 label과 색상 설정 독립 |
| 위치/애니메이션 | :59–64,195–200,324–329,347,452–454 | 현재 HEIGHT60/좌우22/spring750·44·0.7/indicator72 유지. DESIGN의64/20으로 이번 교정 금지 |

내부 fill이 부모 props를 덮는 근거는 설치된 lucide-react-native/dist/cjs/Icon.js:111–119의 attribute 병합 순서이며, child attrs가 나중에 적용된다. 부모 fill만 바꾸는 최소 수정은 충분하지 않다.

GlassView의 auto는 시스템 외형을 따를 수 있으나, 현재 JS 고정 light 색/검정 아이콘과의 dark 조합은 아직 검증되지 않았다. 앱 manual mode와 native Appearance, Glass colorScheme이 서로 다른 mode가 되지 않도록 한다. [Expo GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/)

Blur tint는 반투명 color layer를 포함한다. Android의 blurMethod 및 OS별 지원을 유지하고 실제 뒤 콘텐츠가 흰 포스터/검정 사진/채도 높은 이미지일 때 icon/indicator 대비를 확인해야 한다. [Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/)

사용자 스프링·indicator 이동·drag preview·tabPress 재선택·onLayout 측정값에 theme를 의존성으로 넣어 transition을 재시작하지 않는다. theme key로 bar를 remount하지 않는다. 색상 style/props만 갱신한다.

## 8. 지도 및 Static Map 대응

### 8.1 native/웹/static 구성 분리

| 대상 | 확인한 구현 | 현재 dark 상태·필요 조치 |
| --- | --- | --- |
| Google Maps native | src/screens/MapScreen.native.tsx:86–89 iOS/Android 각각 Map ID; :609–610 provider Google + googleMapId | customMapStyle/userInterfaceStyle 앱 prop 없음. cloud style의 현재 light/dark 설정은 workspace에서 확인 불가 |
| 네이티브 library 지원 | node_modules/react-native-maps/src/MapView.tsx:122,219,677,1176–1192 | customMapStyle/googleMapId/userInterfaceStyle type·native 전송 존재. type 존재만으로 dynamic dark 완료 판단 안 함 |
| 웹 지도 | src/screens/MapScreen.web.tsx:5–22는 native 안내 Text; MapScreen.tsx:1 web export | 실제 web interactive map 없음. 새로운 web 지도 도입은 범위 밖 |
| 상세 Static Map(native+web) | src/components/place/PlaceMapPreview.tsx:8–14, .web.tsx:8–14 → StaticMapImage.tsx:12–35 | 동일 RN Image/URL 사용. env 키 없으면 surface container; 키 실제 값/호출 성공 미확인 |
| overlay | MapScreen.native.tsx:951,968,1064,1137,1164,1182 | background/search/action/list/preview를 앱 theme로 전환 |
| marker | :114–124 11색; :710 tracksViewChanges=false; :733/742 white glyph; :1007 white ring | category palette 유지. label/halo/cluster는 양쪽 대비·native snapshot 업데이트 검증 |
| 검색 attribution | MapSearchOverlay.tsx:18–31,113 | Google Maps/사업자 표시 유지. #5E5E5E의 dark 대비 별도 검수 |
| 목록 Reanimated | MapScreen.native.tsx:280–283,550–557 | translateY shared value·400ms timing·cleanup 유지. surface/text만 theme 처리 |

### 8.2 설치된 native 구현에서 확인한 중요한 제약

**Android 실행 중 userInterfaceStyle prop 변경은 현재 library에서 그대로 적용되지 않을 가능성이 크다.** 설치된 node_modules/react-native-maps/android/src/main/java/com/rnmaps/fabric/MapViewManager.java:124–132는 최초 옵션에 mapColorScheme을 설정하지만 :478–480의 setter는 “do nothing (initialProp)”이다. 반면 customMapStyleString setter(:483–484)는 실제 map style을 갱신한다. 따라서 light/dark prop를 변경하면 이미 마운트된 지도도 즉시 바뀐다고 보고하면 안 된다.

iOS node_modules/react-native-maps/ios/AirGoogleMaps/RNMapsGoogleMapView.mm:653–662는 변경 prop를 받아 overrideUserInterfaceStyle을 적용하는 경로가 있다. node_modules/react-native-maps/ios/AirGoogleMaps/AIRGoogleMap.mm:671–679에는 GMSMapStyle JSON 적용 경로도 있다. 그러나 실제 기기의 SDK/renderer/cloud style 결과는 정적 소스만으로 입증하지 못했다.

최초 FOLLOW_SYSTEM과 앱 Appearance override/OS uiMode 변경의 조합이 마운트된 Android 지도에 반영되는지 **기존 SDK·기기에서 먼저 확인**한다. 이 동작이 되면 system 기반 구성으로 불필요한 remount를 피할 수 있다. 불가하면 현재 cloud 방식과 local JSON 방식 중 지원되는 정책을 별도 결정한다. MapView를 theme key로 다시 마운트하는 방식은 카메라·목록·선택 state·메모리·onMapReady 흐름을 건드리므로 기본 해법으로 삼지 않는다.

공식 react-native-maps는 Google Provider의 cloud Map ID 및 custom style API를 제공한다. API 표는 capability 확인에 사용했으며 이번 앱의 Cloud Console 스타일이나 runtime 동작을 확인한 것은 아니다. [react-native-maps MapView API](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md)

### 8.3 cloud Map ID / API 키 제약

현재 native Map ID가 이미 플랫폼별로 분리돼 있다. Cloud Console 접근은 하지 않았으며 dark variant 등록·권한·SDK 버전/빌드 결과는 확인 필요다. 지도 자체 dark의 최소 가능성을 검증할 때 **기존 Provider/기존 library/기존 Map ID 구성**을 우선한다.

Google Map ID는 플랫폼별이므로 native iOS/Android ID를 Static Map에 그대로 재사용하면 안 된다. cloud custom styling과 local JSON을 같은 지도에 무작정 겹치지 않는다. API key의 Maps SDK와 Static API 허용/요청 제한·설정은 별개다. 이번에는 key 값·서버 설정을 변경하거나 API를 실제 호출하지 않았다. [Google Map customization](https://developers.google.com/maps/documentation/maps-static/map-ids/customize-maps-overview)

### 8.4 Static Map dark와 이미지 캐시

StaticMapImage.tsx:18 URL에는 center/zoom/size/scale/maptype/markers/key만 있으며 **style/map_id/theme 식별값이 없다**. 현재 앱 테마가 바뀌어도 map image URI는 같아 다크 사진이 새로 생기는 구조가 아니다.

최소 후보는 같은 Static API에서 승인한 dark style 파라미터를 URL에 넣는 방식이다. style을 문자열로 encode하며 road/labels/marker 대비를 같이 정한다. cloud 기반을 택하면 Static 전용 Map ID 계약을 확인하고 local style과 섞지 않는다. cloud JSON과 embedded style schema는 다르다. [Google Static Map styling](https://developers.google.com/maps/documentation/maps-static/styling)

| 캐시 대상 | 현재 근거 | 향후 고려 |
| --- | --- | --- |
| poster/banner | HomeBanner.tsx:43,127 memory-disk cache / :185,199 cover key | 사진 자체는 theme별로 변환하지 않으므로 URL/cache key 유지. 전역 image cache clear 불필요 |
| Static Map | StaticMapImage.tsx:16–28 RN Image, explicit cache policy 없음 | 승인한 light/dark style 차이가 URI에 들어가야 같은 좌표의 이미지가 구분됨. key 값을 보고서/로그에 노출하지 않기 |
| map tiles | Google native SDK 소유 | JS API 캐시와 별도. 타일 캐시·메모리·warm/cold 반응은 기기에서 확인 |
| bitmap marker | tracksViewChanges=false; key는 popup.id/isSelected(MapScreen.native.tsx:701) | theme-dependent marker foreground가 native bitmap에 재반영되는지 테스트. category 색은 고정 우선; 지속적인 tracksViewChanges=true는 기본 제안 아님 |

dark style URL은 새 네트워크 요청/캐시 entry를 만들 수 있다. 과도한 프리로드나 전역 cache 삭제 없이 두 variant의 비용을 측정한다. 지도 선택·onMapReady·Reanimated sheet의 기존 lifecycle은 보존한다.

## 9. 시스템 UI 대응

| 항목 | 현재 근거 | 향후 최소 색상 연동·검증 |
| --- | --- | --- |
| StatusBar | src에서 명시적 StatusBar 컴포넌트/설정 미발견; expo-status-bar 설치(package.json:25) | resolved palette와 맞는 글자색. 일반 dark/light 화면과 poster Hero의 상단 배경을 구분; 스크롤 중 sticky header도 검수 |
| Safe Area | 예: HomeScreen.tsx:27, profile/settings.tsx:125, places/[id].tsx:836 | safe area wrapper·content·root background 일치. edges/insets 값은 변경 안 함 |
| Root 전환 배경 | src/app/_layout.tsx:13,20,27,34,41 contentStyle=B | Stack 공통/해당 options 배경을 theme에 맞춤. tab/하위 Stack 부모 ThemeProvider도 같이 확인 |
| sub Stack | places/_layout.tsx:4, profile/_layout.tsx:4, tabs/_layout.tsx:11 자체 background 지정 없음 | navigation theme의 background/card 연결. 새 route/key/remount 금지 |
| 앱 native root | expo-system-ui 설치(package.json:27), 호출 없음 | 기존 SystemUI.setBackgroundColorAsync로 root background 대응 검토. JS 화면 안의 View 색과 별개 |
| 키보드 | TextInput에는 keyboardAppearance 미발견; KeyboardAvoidingView 다수 | iOS resolved keyboardAppearance/앱 Appearance 연동 검토. 이미 열린 keyboard에서 mode 변경 후 draft/selection 보존 검사 |
| native Alert | 상세 찜 :310, 댓글 :304, 설정 :40 등 | JS View 색으로 Alert 변경 못 함. manual mode에서 native Appearance 일치 확인; destructive/동작 유지 |
| Modal | PlaceFilterSheet.tsx:162–176 / CommunityPostMenu.tsx:53–65 transparent | content/backdrop/handle theme화; status/navigation translucent 기존 유지 |
| Splash | app.json:34–39 blue #208AEF, dark option 없음; 수동 hide/restore gate 없음 | native dark 자원과 JS hydration·첫 root frame 순서 결정. 기존 브랜드 launch 변경은 디자인 검수 후 |
| Android bars | 생성 styles.xml:5–6 transparent; DayNight parent :2; Manifest.xml:20 uiMode 포함 | 실제 system bar 글자/gesture·3button 대비. edge-to-edge에서 deprecated 색 설정만 의존하지 않기 |
| 생성 native primary | android/app/src/main/res/values/colors.xml:4 #023c69 | 앱 G와 다른 native accent의 영향 확인. 생성 XML을 손으로 고쳐 테마 소스로 만들지 않기 |
| iOS Info.plist/launch | workspace iOS native 디렉터리 없음 | 실제 Release build의 외형/스플래시 확인 필요 |

SystemUI는 native root view 배경을 제어하므로 navigator/content 색만 바꾸는 것과 별개의 계층이다. 기존 설치 라이브러리로 검토 가능하다. [Expo SystemUI](https://docs.expo.dev/versions/latest/sdk/system-ui/)

Android edge-to-edge는 시스템 바 배경/콘텐츠 면의 관계를 바꾸므로 transparent 영역 뒤의 면과 아이콘 밝기 둘 다 확인한다. 이번 감사에서 새 navigation bar 패키지를 설치하거나 deprecated background API 적용을 제안하지 않는다. [Expo System bars](https://docs.expo.dev/develop/user-interface/system-bars/)

### 흰 프레임 방지 순서

native splash → native root background → navigation background/card → screen/SafeArea/Modal surface가 같은 resolved mode로 준비되도록 한다. default light가 먼저 표시되고 비동기 저장값 dark가 뒤늦게 적용되는 흐름을 막는다. theme 변경/뒤로 스와이프/취소 gesture에서 각 층을 화면 녹화로 확인한다.

**native splash는 JS SecureStore를 읽기 전에 나타난다.** 따라서 OS 테마와 저장된 manual override가 다를 때 native splash의 첫 frame까지 JS hydration gate만으로 완전히 일치시킬 수 있다고 약속하면 안 된다. neutral/기존 브랜드 launch를 유지할지, native theme 복원까지 별도 설계할지 확정이 필요하다. Expo splash dark 옵션은 시스템 테마용 native 자원이며 바꾸면 native build가 필요하다. [Expo SplashScreen](https://docs.expo.dev/versions/latest/sdk/splash-screen/)

이번에 실제 흰색 flash가 재현된 것은 아니다. 위 내용은 dark 도입 시 노출될 코드 경로와 방지 계획이다. Root Native Stack 전환/뒤로가기 제스처/애니메이션 설정은 변경 대상이 아니다.

## 10. 이미지/텍스트 대비

### 10.1 현재 고정 색 쌍의 정적 명암 계산

sRGB 상대 휘도 공식으로 opaque foreground/background만 계산했다. 스크린샷·실제 blur·이미지·opacity 합성 결과를 측정한 값이 아니다. 보통 본문4.5:1, 큰 글자3:1을 설계 비교 기준으로 사용한다. RN fontSize를 pt로 단순 환산해 큰 글자라고 단정하지 않으며 disabled/장식·브랜드 등 예외는 문맥으로 확인한다. [W3C contrast technique](https://www.w3.org/WAI/WCAG21/Techniques/general/G18)

| 실제 색 쌍 | 비율 | 실제 위치·판정 |
| --- | --- | --- |
| white / G | **2.28:1** | MoreButton.tsx:37,45; login.tsx:203,206; MapScreen.native.tsx:1210–1215. 작은 CTA 글자 가독성 검토 필요; G 임의 변경 금지 |
| T / G | 7.79:1 | onPrimary foreground 비교 후보. 현재 구현값이 아님 |
| white / primaryDark | 5.02:1 | popup rank 등; 현재 색을 브랜드 foreground와 혼동하지 않기 |
| M / white | 4.83:1 | 기본 보조 텍스트. opaque 현재쌍은 기준 이상 |
| I / white | **2.54:1** | PlaceScreen.tsx:638 inactive tab·:456 placeholder. 선택 가능한 정보이므로 disabled 면제라고 일괄 주장 안 함 |
| inactiveTabText / white | 1.87:1 | PlaceFilterSheet.tsx:296 handle, disabled 기간·안내 counter 역할 각각 검토 |
| CM / white | **3.44:1** | CommunityPostItem.tsx:473 metadata·CommunityComments.tsx:491 placeholder. 작은 정상 텍스트 가독성 후보 |
| white / PINK | 3.03:1 | places/[id].tsx:866,876 고정 찜 CTA14px. label 가독성 검토 |
| white / #ff2f47 | 3.65:1 | TodayOpeningCarousel.tsx:378–379 작은 마감 badge. opacity/image 합성 없음 기준 |
| #FACC15 / white | 1.53:1 | reviews/write.tsx:125 별 선택. 별모양·숫자·미선택과 상태 구분을 함께 검수; 문자 기준을 icon에 그대로 적용 안 함 |
| #DC2626 / white | 4.83:1 | settings.tsx:165/AccountSettingsScreen.tsx:173 destructive/error |
| #4B5563 / #F3F4F6 | 6.87:1 | PopupGridCard.tsx:288–291 category tag |
| #1D4ED8 / #DBEAFE | 5.49:1 | PopupGridCard.tsx:241,250 info badge |

라이트 디자인 유지와 대비 개선 요구가 충돌하는 경우 이번 감사에서 색을 바꾸지 않는다. 먼저 가독성 근거를 DESIGN 검토 대상으로 전달하고, 승인한 foreground/표면 변경을 후속 작업에서 적용한다. dark 후보 표는 실제 적용한 명암 검증 결과가 아니다.

### 10.2 이미지·합성에서 추가로 필요한 검수

| 대상 | 실제 코드 근거 | 유지/확인 |
| --- | --- | --- |
| Hero white actions | places/[id].tsx:462–470 / PopupHeroImage.tsx:40–42, cover blur20·opacity0.4 | W onImage 분리. 밝은 원본·placeholder·contain letterbox 모두 확인. geometry/blur/scale 유지 |
| grid poster heart | PopupGridCard.tsx:99–108 / NewPopupCard.tsx:55–64 | 검정 underlay+white stroke+회색 fill 의도 유지. text/background token을 반전하면 외곽 대비구조가 바뀜 |
| banner caption | HomeBanner.tsx:66–83 black gradient0→0.8, :305–314 white caption+shadow | overlay는 사진 밝기와 관련된 고정 역할. dark라서 흰 글자를 검정으로 바꾸지 않기 |
| 지역/관심 이미지 | PlaceRegionSection.tsx:183 black18%; PlaceInterestSection.tsx:78–80 gradient | overlay만으로 모든 밝은 사진에서 대비 보장 못 함. white onImage와 현장 데이터 검수 |
| 종료임박 포스터 | TodayOpeningCarousel.tsx:71–76 dark Blur, :262–266 black0.82 gradient, :373–391 caption | dark Blur는 의도적 사진처리. 시스템light이므로 light Blur로 바꾸지 않기 |
| contain 이미지 배경 | CommunityImageCarousel.tsx:48 CS; PopupHeroImage.tsx:40 B | 주변 surface만 변경. 실제 사진 tint/filter/cache 변경 안 함 |
| 사진 count | CommunityPostItem.tsx:545,568 black0.45/0.65 + CW; IntroductionImageCarousel.tsx:104–105 | fixed image shade/white 유지 |
| disabled/pressed | MoreButton.tsx:34 opacity0.7, login/signup opacity0.6, InquiryLayout.tsx:37 opacity0.4 | alpha 합성은 별도 계산/검수. disabled 의미를 accessibilityState로도 유지 |
| skeleton | SkeletonBlock.tsx:19–22 pulse0.82↔1, :45 #F1F3F5 | 색만 palette 연결. 현재 animation/cleanup 정상 구조 유지 |

다크에서는 검정 shadow만으로 면 분리가 잘 안 될 수 있으므로 승인한 border/표면 단계로 구분한다. 과도한 새 elevation·glow·layout 변화는 기본 계획에 포함하지 않는다.

## 11. 기존 DESIGN.md와 차이

DESIGN.md는 확정 기준이므로 **이번 수정하지 않았다**. v0.1 White-first는 현재 light 기준이며 dark 전체 색상이 확정돼 있다는 뜻은 아니다.

### 11.1 A/B/C/D 비교

| 구분 | 내용·근거 | 판단 |
| --- | --- | --- |
| A: 명세 정의 | docs/DESIGN.md:9–22 G/primaryLight/primaryDark/infoLight/infoDark/B/S/MB/T/M/I/inactiveTabText/E/gradient → tokens.ts:2–17 | 대부분 정확히 연결. light baseline으로 유지 |
| A: 선택 chip | DESIGN.md:26,88,111 선택T/W·미선택B/T/E → FilterChips.tsx:61–73, map/place chips | 현재 의도적 쌍. dark에서는 의미 쌍을 새로 승인 |
| A: applied chip | DESIGN.md:116 #F0FDF4/#BBF7D0·greenText → AppliedFilterBar.tsx:121,126,159 | 해당 tint/edge는 승인된 light 디자인; 하드코딩=불량 아님 |
| A: poster/card | DESIGN.md:129–130 PINK·white stroke·dark underlay·#F3F4F6/#4B5563 → PopupGridCard.tsx:99–108,288–291 | light 현재 외곽 대비 구조 유지 |
| A: 커뮤니티 | DESIGN.md:134,140 CT/CM/CD/CS/CC/placeLink → communityColors.ts:2–9 | 전용 palette 의도 확인 |
| A: 이미지 오버레이 | DESIGN.md:122 black18%, :203 Hero white+shadow | fixed onImage/overlay 역할 유지 |
| B: 문서에 정확한 HEX 없음 | tokens.ts:15 paginationActive #494B4F; SkeletonBlock.tsx:45 #F1F3F5; PopupGuidanceCarousel.tsx:166 #F7F8FA; places/[id].tsx:946 #F5F6F8 | 회색 면/indicator 변형을 역할별로 정리할 후보. 무조건 같은gray로 통합하지 않기 |
| B: 세부 상태/재질 | star3색 #FACC15/#F5B800/#F5B82E; blue icon #5B8DEF; error #B91C1C/#DC2626; tabBar opacity/tint 상세값 | 문맥별 의도 확인 후 코드값을 source of truth로 대조. 이번 승인/교정 없음 |
| B: launch/native | app.json:20 #E6F4FE, :36 #208AEF; 생성 colors.xml:4 #023c69 | 앱 G와 다른 launch/native 역할. 문서에 별도 정의 필요; 임의G로 정규화 안 함 |
| C: 토큰 밖 중복 | PopupGridCard.tsx:241/244/247/250/253 기존 info/brand/M 직접 HEX와 token값 같음; Map CTA :1210 G 중복 | alias 재사용 가능하나 state badge 쌍 의미를 보존 |
| C: 근접 회색/빨강/별 | #F7F8FC/#F7F8FA/#F5F6F8/#F1F3F5; #FF5A6E vs #ff2f47; star3색 | 값 차이 확인. 반응/마감·면이 다르면 다른 토큰이 정상일 수 있음 |
| C: 커뮤니티 전파 | DESIGN.md:134는 다른 화면에 적용하지 않음; favorites/settings/정책/문의/공지 header의 CD, community 제목의 T 사용 | 현재 코드 scope와 명세 간 차이. dark 도입 시 공통 header divider 역할로 분리할지 승인 필요 |
| C: 연결 팝업 링크 | DESIGN.md:140 #526071; CommunityPostItem.tsx:497–505 G border/#F0FDF4/primaryDark; communityColors.placeLink 미사용 | 실제 색상은 문서 예와 다름. 기존 사용자 디자인을 되돌릴 근거 아님 |
| C: 상태 배지 설명 | DESIGN.md:12–13 Info는 운영중 날짜 배지; PopupGridCard.tsx:48–50,241–253는 upcoming blue/open green | 명세 용어와 현재 status 매핑 확인 필요. DESIGN.md:130의 기존배지 유지 원칙 준수 |
| C: tabBar 치수 | DESIGN.md:179 높이64/좌우20; 실제 FloatingTabBar.tsx:59,452–454 높이60/좌우22 | **색상 감사의 변경 대상 아님**. 현재 geometry/animation 유지 |
| D: 미확정 dark | background/surface/foreground/border/input/selected/onPrimary/community/glass/status/map/splash | §5 후보는 확정 아님. 구현·기기 검수 후 반영 |

### 11.2 향후 DESIGN.md 반영 예정 항목

다크 구현 후 **실제 확정된 값만** 문서화한다.

- light/dark semantic token과 alias 관계; 브랜드 G 고정·onImage white/black shade 예외.
- onPrimary foreground 결정 및 기존 light 대비 문제의 승인된 처리.
- community 전용 variant, 공통 header divider의 범위.
- 상태 배지/찜/별/오류/마감별 foreground/background 쌍과 적용 범위.
- FloatingTabBar glass/blur/icon/fill/border/indicator **색상**; 치수/spring은 현행 그대로.
- native 지도/cloud style·marker label/halo·Static Map style의 명암 기준.
- status bar/keyboard/Alert/root background/launch의 시스템·manual mode 정책.
- 원본 포스터/브랜드 glyph·캐시를 변경하지 않는 고정 역할과 테스트 기준.

## 12. 도입 시 위험 요소

| ID | 위험·확인 수준 | 발생 조건 / 영향 | 최소 대응·회귀 범위 |
| --- | --- | --- | --- |
| T01 | 확인: static palette/style와 의미 혼용 | 전역 색만 치환하거나 객체를 mutate하면 일부 면은 light로 남고 Hero/CTA foreground가 어두워짐 | theme Hook/factory와 onImage/onPrimary/selectedText/shadow 분리. 현재 light 시각 기준부터 비교 |
| T02 | 잠재: startup/stack/native 외형 불일치 | 저장 dark 복원 전에 light 렌더, root·하위 Stack·native Alert의 mode 불일치 | root/navigation/screen/native 준비 순서 정렬. Native Stack과 제스처를 유지하며 flash 실기기 확인 |
| T03 | 코드 제약 확인, 실측 필요: 지도 | Android initialProp setter 무동작·cloud 미확인·Static URI 동일·bitmap 갱신 누락 가능 | 기존 Map IDs/Provider 유지. FOLLOW_SYSTEM/Appearance와 지원 style 전략부터 확인; 카메라/선택/sheet/cache 보존 |
| T04 | 잠재: Liquid Glass/Blur/filled glyph 대비 | 앱 override와 Glass auto/fallback light의 불일치, 검정 child fill 잔존 | 색상 props/child fill만 연동. capability 분기·spring refs·drag/indicator 이동 유지 |
| T05 | 확인: 일부 light 저대비, dark 값 미확정 | white/G 2.28·CM/white 3.44·white/PINK 3.03, 새 dark 쌍 검수 없음 | opaque 계산과 실제 사진/기기 검수. G를 유지하며 foreground/표면을 디자인 검토 |
| T06 | 잠재: remount로 상태 유실 | theme를 route/앱/MapView key로 사용 | 색상만 변경하고 refs/keys/cleanup 유지; draft·스크롤·history·shared value 검증 |
| T07 | 잠재: API/locale와 불필요 결합 | theme Context를 query 의존성이나 언어 state와 묶음 | preference별 key/owner 분리. 데이터 캐시 초기화와 refetch를 유발하지 않기 |
| T08 | 확인: 기존 test 기대값/mock 불일치 | ThemeProvider/Hook import가 기존 harness에 추가됨 | 현재 2실패와 새 회귀를 구분. mock 보완·mode별 style 검사 |

실제 dark UI를 실행해 장애를 재현한 것은 아니다. T01/T03/T05/T08은 현재 코드·수치·검사 근거이고, 나머지는 향후 변경 조건에서의 위험이다. 출시를 막는 P0 결함으로 과장하지 않는다.

## 13. 단계별 구현 계획

단계별로 화면을 전환하되 **미완성 dark를 사용자 설정에 먼저 공개하지 않는다**. light baseline을 고정하고 개발 검증 범위에서 mode를 확장한 뒤 전체 검수가 끝나면 설정을 활성화한다.

| 단계 | 향후 수정 대상 | 예상 범위 / 주요 위험 | 검증·완료 기준 |
| --- | --- | --- | --- |
| 1. 역할·light baseline | src/theme/tokens.ts, communityColors.ts; §3 소비 경로 | 기존 값을 유지한 palette/alias. onImage/onPrimary/selected/shadow 분리와 dark 후보 확정 | light geometry·색상 동등, G 불변, 고정 색상 예외 목록 합의 |
| 2. mode/store/root | 작은 theme owner/Hook, src/app/_layout.tsx, profile/settings.tsx, 기존 SecureStore | 3모드 저장·복원·native Appearance·navigation/root 배경. restore 경쟁·flash 주의 | system 기본, 마지막 override 저장, 재시작·system 복귀·logout 유지. route key/history 불변 |
| 3. 공통 UI·shared style | MoreButton/Tag/FilterChips/SkeletonBlock; AccountSettingsScreen/InquiryLayout/NoticeLayout/PolicyDetailScreen | 색상 style 연결·exported style의 소비 갱신. foreground/면 쌍 주의 | empty/loading/error/pressed/disabled·placeholder·header·Modal 양쪽 확인 |
| 4. 홈 시범 | HomeScreen·HomeTrending/New·HomeBanner·NewPopupCard·PopupRankingCard | 배경·카드·텍스트·배지. 포스터 onImage 고정; Heart 외곽·사진 대비 주의 | 밝고 어두운 이미지·placeholder·탭 재진입. API/cache key/scroll 유지 |
| 5. 플레이스·상세 | PlaceScreen·filters/region/weekly/grid; places/[id]·Hero/Guidance/Reviews/소개 | surface·label·status·pagination·sticky/header. 유지되는 subtree·측정 행·선택 쌍 주의 | 탐색/전체·필터 draft/기간·상세 복귀·Hero 레이아웃과 기존 검사 통과 |
| 6. TabBar·지도 | FloatingTabBar/FilledTabIcons; MapScreen.native·map 자식; StaticMapImage | 재질/foreground·SDK/cloud 가능성·Static URI. initialProp/bitmap/camera remount 주의 | iOS Glass/fallback/Android mode 전환 중 카메라/marker/sheet 불변. 기존 spring/timing 불변 |
| 7. 커뮤니티·my·auth | community/reviews·Comments/PostMenu/PostItem; profile 전체/문의/공지/정책 | 전용 palette·form/keyboard·Alert. draft·공유 카드·charcoal CTA 쌍 주의 | 작성/수정/실패/삭제·계정 변경·login/logout·장문·정책 양쪽 확인 |
| 8. native·전체 수용 | 승인된 splash 설정이 필요하면 app.json; Root StatusBar/SystemUI; 실제 build | runtime 외형과 build-time launch 정렬. OS/저장 override·edge-to-edge 주의 | §14 기기 조건 완료, 기존 test 실패 원인 정리, 확정 DESIGN 값 반영 후 공개 |

SystemUI/StatusBar/native Appearance는 단계2부터 검토한다. 단계8까지 미루어 어두운 screen과 흰 root를 장기간 섞지 않는다. 지도 SDK 전환 가능성도 단계1–2와 병행해 뒤늦게 remount를 강요받지 않도록 한다.

**유지할 구조:** Root Native Stack/뒤로 스와이프, 모든 route/navigator, FloatingTabBar 위치·크기·spring·gesture, 지도 Reanimated sheet timing/translate/cleanup, 이미지 viewport/ratio/cache/URL, 목록 query/cursor/인증 세션, API와 백엔드. source 변경은 별도 후속 요청에서만 수행한다.

## 14. 실기기 검증 계획

### 14.1 수용 테스트 매트릭스

| 조건/시나리오 | 기록할 항목·합격 기준 |
| --- | --- |
| 동일 iPhone/Android, Debug/Release 구분 | build·OS·SDK/renderer·기기·저장 mode·OS mode·resolved mode·locale·country 기록 |
| OS light/dark × 설정 light/dark/system | 6조합. system은 OS 추종, manual은 override. foreground 복귀·스케줄 변경 확인 |
| 초기 설치·저장 없음·손상·복원 실패 | system 기본·안전 fallback; 첫 화면·splash·키보드·Alert 불일치 기록 |
| 빠른 light→dark→system 선택 후 재시작 | 마지막 선택 저장; 늦은 restore/write가 덮지 않음 |
| login/logout/다른 계정·locale 변경 | theme 유지·언어 독립·KR/JP 지역/tag state 유지 |
| 홈→상세→back, 리뷰→상세, profile 하위 Stack | 녹화로 root/SafeArea/전환 시 흰 flash 확인; 뒤로 swipe 취소/완료 모두 검수 |
| 탭 반복·목록 scroll→상세→복귀 | route key·scroll·filter·pagination 유지, theme로 추가 data 요청 없음 |
| 지도 pan/zoom/선택 중 mode 변경 | tiles/style/marker label/cluster/bitmap·카메라 유지; SDK 실제 동작 기록 |
| 지도 sheet 전환 중 mode 변경 | 400ms timing·터치 제어·높이·translate·cleanup 동작이 기존과 동등 |
| TabBar Glass/Blur | 지원 iOS/fallback iOS/Android. 밝고 어둡고 고채도인 포스터 뒤 배경에서 fill/indicator/icon 확인 |
| Modal/필터 Sheet/Alert/키보드 | surface·dim·handle·bars·keyboard의 mode 일치; draft/selection·SafeArea 보존 |
| StaticMap 최초 로딩·warm cache·실패·키 없음 | light/dark URI 차이·placeholder·새 style·메모리/네트워크 비용 |
| 사진/브랜드/접근성 | 밝은/어두운/가로/세로 포스터·큰 font·VoiceOver/TalkBack·OS 투명도 줄이기/대비 증가 |
| Android gesture/3button·edge-to-edge | bar 뒤 표면·아이콘 대비, Modal/키보드/launch 연속 확인 |
| background 복귀·OS theme 변경 | system 재반영, manual 선택 유지, 열린 화면 state 유지 |

기록 양식: 화면 / build / OS / 저장 mode / OS mode / resolved mode / 언어 / country / 동작 / 기대 / 실제 / flash·잘림·대비 / route·draft·camera 보존 / 캡처. 성능은 적용 전후 같은 조건으로 비교하며 이번 감사로 FPS·메모리 합격을 주장하지 않는다.

### 14.2 이번 실행한 기존 검사

| 검사 | 실행·결과 | 한계 |
| --- | --- | --- |
| TypeScript | 설치 Node로 node_modules/typescript/bin/tsc --noEmit --incremental false; **exit0** | emit/증분 파일 없음. dark 구현·명암 검증 아님 |
| 기존 CJS6파일 | Node --test --test-reporter=tap; **57건/55통과/2실패**, runner exit1 | navigation lock·Hero geometry·sheet·검색·계정 로직. 실제 테마 기능은 미구현 |
| native XML 읽기 | values-night/colors.xml은 빈 resources; XML parse 정상 | build/renderer 실행 아님. night override 없음 |
| 색상 AST/의존 graph | 메모리 분석·literal/role/소비 대조 | 새 script/test 파일 없음. 이미지 픽셀 색은 집계 제외 |
| 보존 확인 | 감사 시작 hash/Git 상태와 완료 시점 대조 | 기존 source/docs/config/tests 및 생성 native 파일 보존 |
| 미실행 | build/prebuild/formatter/설치/기기/시뮬레이터/실제 Maps API | 산출물 변경 제한과 읽기 전용 범위 준수 |

실행 파일:
tests/popupHeroImage.test.cjs,
tests/popupNavigation.test.cjs,
tests/placeFilterSheetUi.test.cjs,
tests/mapSearch.test.cjs,
tests/endingSoonCarousel.test.cjs,
tests/accountSettings.test.cjs.

| 실패 | 근거·현재 실패 | 해석 |
| --- | --- | --- |
| 계정 설정1건 | tests/accountSettings.test.cjs:92,98 — ../../../theme/communityColors mock 미등록 import assertion 실패 | 현재 작업 트리에 이미 있는 harness 의존성 불일치. 신규 감사 변경으로 생긴 회귀 아님 |
| 종료 배지1건 | tests/endingSoonCarousel.test.cjs:37,53 — 기대 #FF5A6E, 실제 #ff2f47(TodayOpeningCarousel.tsx:379) | 기대값과 코드의 차이 확인. 맞는 값은 디자인 결정 사항; test에 맞춰 source를 변경하지 않음 |

과거 HEAD/CI의 실패 여부는 확인하지 않았다. “기존 실패”는 **보고서 작성 전 현재 작업 트리에서 실행된 결과**라는 의미다. 이6개 파일의 검사는 실제 Glass/Blur, Google native dynamic dark, StatusBar/keyboard/Alert, 사용자 테마 저장/복원 및 실기기 FPS를 검증하지 않는다. 미래 ThemeHook 추가 시 현재 mock 의존성도 보완해야 한다.

## 15. 최종 권장사항

**공통 토큰을 재사용하면서 색상 역할과 반응형 갱신 경로를 보강하는 단계적 도입을 권장한다.** 브랜드 #22C55E와 현행 light UI·Native Stack·지도 Reanimated·탭바 애니메이션을 유지할 수 있는 구조다. 전체 UI 재작성·새 지도 Provider/library의 필요성은 입증되지 않았다.

가장 큰 위험5개는 **T01 역할 혼용·static style, T02 root/native/startup 불일치, T03 지도 최초 prop/Static URI/marker, T04 Glass/Blur/검정 glyph, T05 명암·dark 디자인 미확정**이다. 조건과 대응은 §12에 정리했다.

추천 순서는 **역할 토큰/light baseline → mode·저장·root/native 연동 → 공통 UI → 홈 시범 → 플레이스/상세 → TabBar·지도 → 커뮤니티/my/auth → iOS/Android 수용·DESIGN 확정 반영**이다. 지도 SDK 제약과 초기 flash 검증은 앞 단계와 병행한다.

AsyncStorage나 새 theme/navigation 패키지 도입을 기본 전제로 삼지 않는다. 이미 있는 RN useColorScheme/Appearance, Expo Router ThemeProvider, SecureStore, SystemUI/StatusBar/SplashScreen을 먼저 활용한다. 기기 검수 전에 공개하지 않으며 dark 후보를 DESIGN.md에 확정값으로 먼저 기록하지 않는다.

이번 결과는 현황·도입 가능성·계획의 정적 감사다. 테마 구현·색상 변경·source 리팩터링·디자인 명세 변경·Git commit은 수행하지 않았다.

## 16. D1 공통 테마 기반 구현 결과 (2026-10-09)

기존 감사 내용은 보존하고, 사용자 확정 다크 색상과 현재 코드의 언어 저장 패턴을 기준으로 D1을 구현했다. 개별 화면과 설정 메뉴의 다크모드 적용은 포함하지 않는다.

- 추가 파일: `src/theme/themeColors.ts`, `themeStore.ts`, `themeStorage.ts`, `useTheme.ts`, `ThemeProvider.tsx`, `tests/theme.test.cjs`, `tests/fixtures/themeConsumer.tsx`. 변경 파일: `src/app/_layout.tsx`, 이 문서의 D1 부록.
- 상태/저장: `ThemePreference = system | light | dark`, `ResolvedTheme = light | dark`. 기본 system; Appearance의 현재 테마와 변경 이벤트, foreground 복귀를 반영한다. 현재 언어 설정에서 이미 사용하는 AsyncStorage에 별도 `poparchive.themePreference` 키로 저장하며 언어 store/키/번역 동작은 변경하지 않는다. 선택은 즉시 반영하고 저장은 순차 처리한다. 늦은 복원은 새 선택을 덮어쓰지 않는다. 잘못된 값·읽기 실패·2초 복원 시간 초과·최신 선택의 쓰기 실패는 system으로 fallback한다. 저장 실패 시 디스크의 기존 값이 남을 수 있으며 다음 실행은 실제 저장된 값을 복원한다.
- Light/Dark 토큰: 기존 `tokens.ts`의 colors 16개와 `communityColors.ts`의 8개 값 및 소비자를 그대로 보존했다. 새 불변 semantic palette를 `useTheme().themeColors`로 제공한다. background/onAccent/onImage/imageShade를 분리하고 다크 확정값 전체를 반영했다. light 필터는 기존 미선택 white/text, 선택 text/white를 유지한다. light surfaceSecondary/endedBg는 기존 `#F3F4F6`, navIndicator는 기존 `rgba(0, 0, 0, 0.09)`, 양쪽 navIcon은 현재 실제 코드의 black이다. 기존 전용 communityColors는 그대로 두며 커뮤니티 다크 variant는 추가 확정이 필요하다. 하트·별점·지도 마커·브랜드 아이콘 및 사진 처리는 변경하지 않았다.
- Root: `ThemeProvider → 기존 LanguageProvider → 기존 Stack`. 최초 테마 복원 후 LanguageProvider를 마운트해 기존 splash hide/onLayout이 두 복원 이후 실행되도록 했다. 테마 변경 시 children을 재마운트하지 않으며 route/key/options, 세션, API/cache, 제스처, GlassView는 변경하지 않았다. React Navigation의 DarkTheme 및 StatusBar/SystemUI override는 기존 라이트 화면과 충돌하므로 D1에서 적용하지 않았다. 정상 시작에도 테마 저장 읽기만큼 초기 대기가 추가되며 실제 splash 검수는 필요하다.
- 검증: 설치된 Node v22.23.3 실행 파일로 `tests/theme.test.cjs`(9건), `tests/i18n.test.cjs`(36건), `tests/i18nCompiler.test.cjs`(5건) 총 **50/50 통과**. TypeScript `--noEmit --incremental false` 통과. 실제 React Compiler(target 19)의 Provider/Hook/테스트 소비자 출력을 실행해 마운트 상태의 light↔dark 및 system OS 변경, ko↔ja 독립성, 입력 유지, 테스트 요청 1회 유지, Root Stack의 기존 옵션을 검증했다. 네이티브 렌더링/네비게이션은 mock이며 실제 앱 전체의 요청 횟수나 화면 외관을 실기기로 검증한 결과는 아니다. 전체 테스트/빌드/패키지 설치는 수행하지 않았다.
- 공백 검사: D1 변경 파일 검사 통과. 전체 작업 트리의 `git diff --check`는 기존 미커밋 `docs/FUTURE.md:21` EOF 빈 줄, `docs/IOS_PROMOTION_60HZ_ISSUE.md:377` trailing whitespace 때문에 실패하며 해당 파일은 수정하지 않았다.
- D2 연결: `useTheme`를 직접 구독하고 themeColors를 렌더링/색상 의존 style 생성에 사용한다. 모듈 최상위 StyleSheet 또는 legacy colors의 mutate로 전환하지 않는다. 설정 UI는 `setThemePreference`에 연결하되 화면 전환 준비에 맞춰 공개한다. 공통 화면·네비게이션·시스템 UI를 함께 검토하고 community 전용 역할, Liquid Glass 재질/선택 glyph, 의미 고유색을 보존한다.
- 실기기 확인 필요: iOS/Android OS 테마 변경 및 foreground 복귀, 저장 후 종료/재시작, splash/첫 프레임 깜빡임과 추가 대기, 기존 화면/탭/입력/스크롤/지도 상태 및 실제 API 요청 횟수. 전체 다크 화면, Glass/Blur, 네이티브 Alert·키보드·StatusBar·지도 SDK 전환은 후속 단계에서 검증한다.

## 17. D2-2 홈 다크모드 적용 결과 (2026-10-09)

- 홈 활성 경로만 적용: `HomeScreen`, `HomeBanner`, `HomeTrendingSection`, `HomeNewPopupSection`, `PopupRankingCard`, `NewPopupCard`, `HomePopupSkeleton`. 화면/배너 표면, 제목·설명·오류·찜 재시도·빈 상태, 국가 필터, 카드/태그/배지, Skeleton 및 이미지 fallback을 `useTheme`으로 갱신한다. 별도 SafeAreaView를 추가하지 않고 기존 배너 inset/크기/캐러셀을 유지한다.
- `themeColors.ts`에 light 기존값을 유지하는 cardBackground/moreButtonBackground/skeletonBackground/tagBackground/tagText/inactiveIcon/bannerFallback 역할만 추가했다. 사진 위 white/black shade, 포스터 하트 레이어·찜 빨강, 이미지 소스/cache, 모든 간격·크기·폰트·애니메이션은 유지한다. 카드의 기존 전역 t 참조는 Hook의 t로 연결했다.
- 공유 `FilterChips`/`MoreButton`은 선택적 themeColors prop, `SkeletonBlock`은 선택적 backgroundColor prop으로 홈만 적용한다. 미전달 소비자는 기존 light 스타일과 pulse를 유지한다. Tag는 홈 활성 경로에서 사용하지 않아 수정하지 않았다. 다른 탭/상세/FloatingTabBar/지도 및 D1 저장·D2-1 설정은 변경하지 않았다.
- 검증: 실제 React Compiler(target 19)의 홈/공유 UI 출력으로 수동 light↔dark 및 system OS 전환, ko↔ja, 국가/펼침/배너 page·key 유지, 이미지 데이터/찜·상세 액션, 추가 API 요청 없음, Skeleton pulse 유지, light 복귀 스타일 동일성을 확인했다. 신규 `tests/homeTheme.test.cjs` 4건 및 관련 homeNewPopup/homeI18n/i18nCompiler/theme/i18nUiConventions 포함 **33/33 통과**. 기존 isolated test helper에 light 테마 mock만 보완했다. TypeScript `--noEmit --incremental false`, 변경 파일 공백 검사 통과. 전체 테스트/빌드/실기기 검증은 미실행이다.
- 별도 기존 `tests/mainBanners.test.cjs` 14건 중 11통과/3실패: info.bottom 기대32/기존코드28, 기존 gradient stop 위치 기대 불일치, 비활성 HomeQuickMenu를 기대하는 테스트. 해당 기하·gradient·활성 route는 이번 구현 전 코드 그대로이며 기대에 맞춰 UI 또는 기존 테스트를 변경하지 않았다.
- 실기기 확인 필요: 홈 전체 light 전후 외관, Safe Area/스크롤 overscroll, OS·설정 전환 시 즉시 반영, 실제 세로 스크롤/캐러셀 위치·찜/이미지 로딩·API 횟수, Skeleton/포스터 대비. 후속 화면도 공통 컴포넌트를 명시적으로 opt-in해야 하며 FloatingTabBar와 네이티브 시스템 UI는 아직 별도 후속 범위다.

## 18. 다크모드 임시 비활성화 (2026-10-09)

- 단일 플래그: `src/theme/themeFeature.js`의 `DARK_MODE_ENABLED = false`. Metro/TypeScript와 Expo config가 함께 읽도록 CommonJS JS 모듈로 정의했다. `themeStore`의 resolved 계산만 light로 고정하며 저장된 themePreference는 그대로 복원한다. 비활성화로 AsyncStorage를 삭제하거나 쓰는 작업은 없다. 기존 setter API와 저장·실패 정책은 유지한다.
- 설정의 테마 행 및 해당 행 아래 간격은 플래그로 숨기고, 기존 ThemePreferenceSheet의 visible도 false로 전달한다. 메뉴·시트 구현, 번역, dark palette, D1/D2 코드는 모두 유지하며 홈/다른 탭/Glass/지도/상세 스타일은 변경하지 않는다.
- Native: 기존 ThemeProvider에서 Appearance.setColorScheme(light)로 OS 연동 UI를 고정하고 Expo StatusBar에 dark 스타일(라이트 배경용 아이콘)을 지정한다. Router의 기존 DefaultTheme/Stack 구조는 유지한다. 추가 `app.config.js`가 기존 app.json 전체를 보존하면서 userInterfaceStyle만 light로 계산한다. iOS/Android 빌드 시작부터의 native 설정 반영은 재빌드가 필요하며 생성 native 파일은 직접 수정하지 않았다.
- 재활성화: 플래그를 true로 바꾸고 앱을 reload/rebuild한다. Store는 원래 preference를 다시 적용하고 메뉴가 복구되며 Appearance override는 unspecified로 해제되고 native config는 automatic으로 돌아간다. 기존 테스트는 플래그 true fixture로 유지하고 실제 false 상태의 OS/저장값 조합·설정 숨김·Compiler·언어 독립성·추가 요청/remount 없음 검증을 추가했다.
- 검증: theme/themeSettings/homeTheme/accountSettings **36/36**, accountI18nCompiler/i18nUiConventions **12/12**, 총 **48/48 통과**. TypeScript --noEmit --incremental false 및 변경 파일 공백 검사 통과. 설치된 Expo config loader의 실제 userInterfaceStyle=light 평가와 true fixture의 automatic 복귀를 확인했다. Settings의 기존 logout try/finally Compiler 최적화 생략은 그대로이며 Hook/Provider/홈/시트는 실제 Compiler 출력으로 검사했다. 전체 테스트/빌드/실기기 검증은 수행하지 않았다.
- 실기기 확인 필요: iOS/Android OS dark에서 cold launch/foreground/언어 전환 시 light 유지, 상태바/네비게이션 바·키보드·Alert·Glass의 실제 밝기, 스크롤·지도 상태 보존, 저장값 dark를 유지한 재시작 및 플래그 재활성화 후 복원.
