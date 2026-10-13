# POPKU API

## API 환경 선택과 인증 저장

- `src/constants/api.ts`의 `API_BASE_URL`은 `EXPO_PUBLIC_API_URL`을 사용하며 공백과 URL 끝의 `/`를 제거한다. 개발 번들(`__DEV__`)이고 `EXPO_PUBLIC_APP_ENV`가 production/preview가 아닐 때만 미설정·빈 값을 기존 `http://192.168.50.146:8080`으로 대체한다. 출시 번들은 환경 마커와 관계없이 public HTTPS 주소를 필수로 요구하며 로컬·사설 IP, 인증정보, query/hash가 들어간 주소를 거부한다.
- `eas.json`의 production은 EAS production 환경을 명시적으로 선택하고 `EXPO_PUBLIC_APP_ENV=production`을 주입한다. `EXPO_PUBLIC_API_URL`의 실제 값은 EAS production 환경에 별도로 등록해야 하며 저장소에 자동 설정하지 않는다. `app.config.js`는 production/preview 빌드 프로필·환경 마커 또는 `NODE_ENV=production`에서 같은 주소 검증을 수행하므로 잘못된 값은 설정 해석 단계에서 실패한다. 명시적인 EAS development 프로필에서는 네이티브 의존성 빌드의 `NODE_ENV=production`만으로 개발 기본값을 막지 않는다. preview도 릴리스 번들이므로 유효한 HTTPS 주소가 필요하다.
- Google Places 자동완성·장소 resolve는 개발 환경에서만 가능하다. 출시 환경에서는 화면의 요청 예약과 서비스의 네트워크 요청을 모두 차단한다. 자체 팝업 검색, Google Maps 지도·마커·카메라 및 상세 Static Map은 이 flag와 무관하다.
- 운영 예시는 `EXPO_PUBLIC_API_URL=https://api.popchive.com`이다. 요청 코드가 `/api/...`를 추가하므로 Base URL에 `/api`를 넣지 않는다. 비밀키나 토큰은 `EXPO_PUBLIC_` 변수에 넣지 않는다.
- 기본 로컬 주소의 SecureStore 키는 기존 `accessToken`, `refreshToken`을 유지한다. 다른 API 주소는 URL별 namespace를 사용하며 로컬 토큰으로 fallback하거나 토큰을 복사하지 않는다. 로그인·로그아웃·401 정리는 선택된 환경의 키에만 적용된다.
- 환경변수 변경 후 앱을 전체 Reload하여 주소·인증 상태·메모리 캐시를 새 환경으로 초기화한다. 기존 로컬 `.env`를 유지한 채 테스트 터미널의 `EXPO_PUBLIC_API_URL`을 지정할 수 있다. 빌드된 앱에는 번들 생성 시 선택된 값이 반영된다.

## 홈 메인 배너

- 홈 최상단은 `GET /api/main-banners?languageCode=ko|ja`의 `{ popups: [...] }`를 조회한다. 언어는 `useTranslation().resolvedLanguage`를 사용하며 국가 선택과 독립적이다. 언어별 기존 캐시를 사용하고 이전 언어 응답은 해당 언어 캐시에만 반영한다.
- `placeId`, `publicId`, `name`, `countryCode`, `regionId`, `regionName`, `startDate`, `endDate`, `coverImageUrl`, `coverImageCacheKey`를 기존 응답 그대로 받는다. 날짜·지역·이미지는 null일 수 있다. 국가별 필터·분리·재정렬 없이 서버 순서를 유지한다.
- 높이 380dp / 전체 너비 영역에서 가로 ScrollView의 pagingEnabled로 한 번에 한 배너를 수동 스와이프한다. 각 페이지의 배경·포스터·정보가 함께 이동한다. 하단 중앙에 활성 24×4dp pill / 비활성 4×4dp dot을 8dp 간격으로 표시하고 1개도 pill을 표시한다. 자동 재생은 없다. 터치는 기존 usePopupNavigation에 publicId를 전달한다.
- HomeBanner는 backgroundColors를 시각적으로 사용하지 않는다. 응답 타입·API·백엔드 색상 데이터는 유지한다. 대신 동일한 coverImageUrl과 coverImageCacheKey를 expo-image 배경에 재사용하고 contentFit=cover, blurRadius=50, memory-disk 캐시를 적용한다. 배경을 사방 32dp 확장해 blur 가장자리의 빈 공간을 방지하고 배경 위에 검정 28% overlay를 적용한다. 이미지 누락/로드 실패 시 중립 어두운 배경을 유지한다.
- SVG 하단 gradient는 포스터 위·텍스트 아래 레이어에 배치한다. 배너 높이 58%에서 투명, 70%에서 검정 15%, 82%에서 40%, 최하단에서 80%로 표시한다. foreground 포스터는 top Safe Area 아래 6dp에서 중앙 위쪽 정렬하며 최대 너비는 화면의 70%다. 가용 높이와 원본 비율에 맞춰 contain으로 표시하고 12dp 모서리와 약한 그림자를 유지한다.
- 정보는 좌우 Safe Area + 16dp 여백과 하단 32dp 여백을 적용한다. 팝업명(최대 2줄, 20/700/28), 기간(14/400/20), MapPin + regionName(14/400/20)을 모두 #FFFFFF로 좌측 정렬한다. 날짜는 기존 displayDate를 재사용해 시작일 YY.MM.DD, 같은 연도의 종료일 MM.DD, 다른 연도의 종료일 YY.MM.DD로 표시한다. 누락된 날짜/지역은 빈 값으로 처리하고 지역이 없으면 아이콘도 숨긴다. MapPin은 기존 Lucide outline 아이콘 16dp다.
- 대표 이미지는 응답의 coverImageUrl을 사용한다. 기존 expo-image 패턴처럼 source.cacheKey에 coverImageCacheKey를 전달하고 cachePolicy는 memory-disk다. 이미지 URL을 생성하거나 상세 API를 별도로 호출하지 않는다.
- 메인 배너 hook은 다른 홈 섹션과 독립된 locale별 캐시와 loading/ready/error 상태를 사용한다. 기존 대표 이미지 freshness 상수(4분)로 목록을 갱신하고 갱신 실패 시 받은 배너를 유지한다. 최초 로딩은 기존 높이의 중립 영역, 0개/최초 오류는 배너만 숨긴다. 대표 이미지가 없거나 이미지 로드가 실패하면 Image를 렌더링하지 않는다. 임시 팝업·로컬 배너 이미지는 표시하지 않는다.

## 지도 팝업 제목 언어

- 지도는 `GET /api/popups/map?languageCode=ko|ja`, 팝업 검색은 `GET /api/popups/search?q=...&limit=10&languageCode=ko|ja`를 사용한다. 언어는 `useTranslation().resolvedLanguage`이며 국가·좌표와 독립적이다. 서버가 번역 및 원본 fallback을 적용한 기존 `name`을 그대로 표시한다.
- 언어 변경 시 지도·팝업 검색을 다시 조회하고 이전 요청을 취소한다. 이전 언어의 목록·검색 결과·선택 카드 제목은 새 응답까지 숨기며 선택 ID·검색어·카메라·태그 필터는 유지한다. 같은 언어의 지도 갱신 실패는 기존 데이터를 유지한다.
- 팝업 마커와 제목 높이 측정 key에 언어를 포함하고 언어 변경 시 측정값을 초기화한다. `tracksViewChanges=false`를 유지한다. Google Place 검색과 `getApiLocale()`의 기존 정책은 유지한다.

## 홈 인기·신규 팝업 콘텐츠 언어

- 인기 목록은 `GET /api/home-curations/NOW_HOT?countryCode=KR|JP&languageCode=ko|ja`, 신규 목록은 기존 `GET /api/popups?countryCode=KR|JP&openingFrom=...&openingTo=...&homeNew=true&limit=8`에 `languageCode=ko|ja`를 추가한다. 언어는 `useTranslation().resolvedLanguage`이며 국가 필터와 독립적이다.
- 목록의 10분 캐시 정책은 유지하고 키를 `섹션:국가:언어`로 구분한다. 동일 키 요청은 공유하며 늦은 응답은 원래 키의 캐시에만 반영한다. 전환한 언어의 캐시가 없으면 새 응답까지 이전 언어 목록을 표시하지 않는다. 서버가 반환한 번역 및 원본 fallback을 그대로 사용한다.

## Place 전체 기간 필터

- `GET /api/popups`에 선택적 `visitPeriod=all|today|week|weekend`를 추가한다. 생략/`all`은 기존 query와 동일하며 `custom` 등 다른 값은 400이다. 기존 `openingFrom/openingTo`의 오픈일 조건과 국가·지역·카테고리·상태 조건은 그대로 유지한다.
- 운영 기간은 `popup_place.start_date/end_date`의 DATE 값이다. 서버의 기존 `Asia/Seoul` LocalDate 기준으로 오늘은 당일, 이번 주는 월~일, 이번 주말은 해당 주 토~일을 계산한다. SQL에서 `start_date <= 범위 끝 AND end_date >= 범위 시작`을 기존 조건에 AND로 결합하며 경계일을 포함한다. DATE를 timestamp로 변환하지 않는다.
- 기본 정렬은 `start_date ASC, places.id ASC`다. Place 전체는 아래 `limit=10` cursor pagination을 사용한다. Home 등 기존 limit 없는 호출은 `{ popups: [...] }` 계약을 유지한다. RN 검색은 지금까지 받은 목록에 대한 로컬 검색이며 서버 검색으로 변경하지 않는다.
- RN은 Sheet의 draft 기간을 적용 시 query에 반영하고 재진입 시 적용값을 표시한다. 취소는 draft를 폐기하며 초기화 후 적용/기간 chip 해제/전체 초기화는 기간 조건 없는 기본 조회로 복귀한다.

## Place 탐색 주간 조회 / 전체 pagination

- 탐색 최초 진입은 `GET /api/popups?endingSoon=true`(기존 최대 7개)와 `GET /api/popups?weekStart=YYYY-MM-DD&weekEnd=YYYY-MM-DD`만 요청한다. 탐색·전체 요청에는 `useTranslation().resolvedLanguage`의 `languageCode=ko|ja`를 명시한다. 국가가 선택되면 별도로 `countryCode`를 전달하며 언어와 독립적이다. 서버의 번역 제목과 원본 fallback을 그대로 사용한다. 일반 전체 목록은 미리 요청하지 않는다.
- 주간 날짜는 기존 RN 로컬 날짜 기준 월요일~일요일 선택 동작을 유지한다. Backend는 DATE의 `start_date <= weekEnd AND end_date >= weekStart` 경계를 포함해 조회하고 기존 정렬로 최대 9개를 반환한다. 과거 주도 조회 가능하며 현재 날짜 기준 종료 제외 정책은 주간 조회에 적용하지 않는다. 양쪽 날짜 필수, 월요일부터 정확히 7일인 범위만 허용한다. RN Weekly 내부에 `국가 또는 ALL|weekStart|weekEnd|언어`별 `{ popups, fetchedAt }`을 저장하며 빈 결과도 캐시한다. freshness는 요청 시작 시점부터 4분 미만이고, 재방문/탐색 재표시 시 fresh 캐시는 요청 없이 표시하고 stale 캐시만 재조회한다. 탭을 숨겼다 돌아올 때 같은 키의 진행 중 요청도 유지한다. 주·국가·언어 변경 또는 unmount는 요청을 취소하고 늦은 응답을 무시한다. 팝업 내부 페이지는 3개씩 최대 3페이지이며 페이지 이동은 API를 호출하지 않는다.
- Place 전체 최초 진입은 `GET /api/popups?limit=10`을 요청한다. 응답은 `{ popups: [...], nextCursor: string | null }`이며 null이면 마지막 페이지다. 이후 동일 조건에 `cursor`를 추가한다. limit은 10만 허용하고 endingSoon/주간 모드와 혼합하지 않는다.
- cursor는 마지막 반환 행의 `start_date|places.id`를 UTF-8 Base64URL로 인코딩한다. SQL은 해당 날짜보다 뒤이거나 같은 날짜의 더 큰 id를 조회한다. 11행 lookahead 중 최대 10행만 응답/서명한다. 잘못된 cursor는 400이다. 데이터가 유지되는 동안 같은 날짜의 팝업도 중복/누락 없이 정렬된다. 페이지 조회 사이의 날짜 변경·등록·삭제에 대한 DB snapshot은 제공하지 않는다.
- `limit=10`의 status 미지정은 서울 오늘 기준 `end_date >= today`, 즉 운영중+오픈예정이다. ONGOING/UPCOMING/ENDED 명시 조회와 단일 상태 선택 UI는 유지한다. 미선택을 기본으로 유지하며 기본 정책을 Active Filter chip으로 표시하지 않는다. limit 없는 기존 호출의 기본 정책은 Home 호환을 위해 유지한다.
- 필터·언어를 포함한 queryKey 변경 시 기존 목록/cursor를 초기화하고 이전 요청을 abort한다. 전체 탭이 활성화돼 있으면 새 첫 페이지, 탐색이면 다음 전체 진입 시 요청한다. 단순 탭 전환은 기존 목록/cursor와 진행 중 요청을 유지한다. 하단 접근 시 다음 페이지를 요청하며 ref lock과 abort/queryKey 검사로 중복 요청·오래된 응답을 차단한다. 실패한 페이지는 재시도할 수 있다. 종료 임박 응답도 국가·언어를 구분하며 전환 중 이전 언어 제목을 표시하지 않는다.
- Sheet draft 선택은 목록 요청을 하지 않고 적용 시 기존 queryKey가 바뀐다. 기존 국가·지역·카테고리·상태·기간을 각 페이지에 동일하게 전달한다. 사전예약·혜택은 기존대로 UI 선택만 있고 API 연결은 추가하지 않았다.
- S3 GET TTL은 5분을 유지한다. Place 전체 대표 이미지의 캐시·복구 정책은 아래 항목을 따른다. 다른 이미지 응답의 freshness 정책은 변경하지 않는다.

## Place 전체 대표 이미지 캐시 / URL 복구

- Public popup 목록·상세에 `coverImageCacheKey: string | null`을 추가한다. `popku-cover-v1-` + S3 object key의 SHA-256 hex이며 signed URL과 독립적이다. 같은 object는 같은 식별자, UUID를 포함한 새 object로 대표 이미지를 교체하면 다른 식별자를 반환한다. 이미지가 없으면 null이다. raw S3 경로나 응답 시각을 추가하지 않는다.
- PopupGridCard 대표 이미지는 expo-image의 `memory-disk`, `contentFit="cover"`를 사용하고 source의 `cacheKey`에 서버 식별자를 전달한다. transition은 추가하지 않는다. 식별자가 없는 기존 데이터는 URL 기반 캐시로 동작한다.
- Place 전체는 페이지 요청 시작 시각을 각 항목의 RN 전용 `coverImageFetchedAt`에 기록한다. 4분 미만은 fresh이며 추가 페이지가 기존 항목의 시각을 갱신하지 않는다. 새 이미지 identity가 표시되거나 freshness 상태가 stale로 바뀌는 render에서 disk cache를 검사하며 매 render마다 반복 검사하지 않는다.
- stale 이미지의 `Image.getCachePathAsync(cacheKey)`가 경로를 반환하면 cached file을 표시하고 API를 호출하지 않는다. cache miss이면 기존 `GET /api/popups/{publicId}`로 fresh URL을 확보한다. fresh URL은 기존 source로 다운로드한다. 이미지 오류는 error 문자열 대신 URL age를 판단하며 stale일 때만 복구를 허용한다.
- 복구 시도는 현재 Place 목록의 popup/image identity당 최대 1회이며 동시 요청은 동일 promise를 공유한다. 성공하면 같은 항목의 URL·cache key·시각만 병합한다. 목록 순서·cursor·load-more·scroll은 초기화하지 않는다. 필터 변경/unmount는 복구 요청을 abort하고 늦은 응답을 무시한다.
- 전체 목록 polling이나 focus/foreground 전체 refetch는 없다. 1차 구현은 카드 mount/관련 render와 onError를 검사 계기로 사용한다. 실패한 1회 복구를 자동 반복하지 않으며 실제 기기의 cache eviction·disk write 시점에 따른 차이는 실기기 검증 대상이다.

## 팝업 상세 콘텐츠

- 상세는 `GET /api/popups/{publicId}?languageCode=ko|ja`를 호출한다. `languageCode`는 `useTranslation().resolvedLanguage`이며 팝업 국가/GPS와 독립적이다. 제목·소개·혜택·공지·운영시간 등 서버가 반환한 번역 및 원본 fallback을 그대로 사용한다.
- `averageRating`은 해당 place의 전체 reviews.rating 평균, `reviewCount`는 전체 방문 후기 수다. 상세 SQL에서 함께 집계하며 후기가 없으면 `averageRating: 0.0`, `reviewCount: 0`을 반환한다. RN은 평균을 소수점 한 자리로 표시하고 후기 수가 1 이상일 때만 `후기 N개`를 표시한다. 리뷰 pagination과 독립적이며 RN에서 재조회하거나 평균을 계산하지 않는다.
- `summary: string | null`, `highlights: { type, text }[] | null`을 사용한다. 구조화 소개의 다국어 fallback은 Backend가 담당한다. RN은 null 배열을 빈 표시 목록으로 처리하며 과거 소개 텍스트 필드를 사용하지 않는다.
- highlights는 Backend 순서대로 표시한다. 고정 type 8종의 제목은 `place.detail.highlights`의 KO/JA 리소스에서 가져온다. 알 수 없는 type은 HIGHLIGHT 제목, blank text는 표시 생략이다. title/emoji를 서버에 요구하지 않는다.
- 상세는 캐시 라이브러리 없이 `(id, languageCode)` 요청 상태와 AbortController를 사용한다. 앱 언어가 달라지면 이전 요청을 취소하고 해당 언어로 재조회한다. 이전 응답은 무시하고 새 응답까지 이전 언어 상세를 표시하지 않는다. 인증 만료 후 anonymous 재조회에도 같은 언어를 전달한다.
- `socialLinks`는 public JSON 객체의 `website`, `instagram`, `x`, `youtube`, `threads`, `facebook` 키를 사용한다. 유효한 http/https URL만 기존 공식 채널 UI에서 표시한다. URL은 번역하지 않으며 외부 링크 열기 실패는 안내한다.

## 현재 구현

회원가입 화면에서 다음 API를 사용한다. 모든 플랫폼의 base URL은 위 API 환경 선택 규칙을 따른다. Android 에뮬레이터에서 호스트 PC의 개발 서버를 사용하려면 `EXPO_PUBLIC_API_URL=http://10.0.2.2:8080`을 명시한다.

커뮤니티 메인 피드는 `GET /api/community/feed`를 인증 없이 조회한다. `category`는 `ALL`(기본값), `REVIEW`, `QUESTION`, `FREE`; `sort`는 `LATEST`(기본값), `POPULAR`; `limit`은 기본 20, 최대 50이다. 응답은 `{ "items": [...], "nextCursor": string | null }`이며 다음 페이지에는 같은 필터와 정렬에 `cursor`를 전달한다. 인기순은 좋아요 수 내림차순이다. 각 항목에는 `type`, `id`, `category`, `author`, `content`, `createdAt`, `regionName`, `popup`, `rating`, `images`, `likeCount`, `commentCount`, `viewCount`가 포함된다.

피드 첫 페이지는 최초 진입, category/sort 변경, 명시적 재시도, 작성 성공 후 복귀, pull-to-refresh에서 요청한다. 상세 복귀에서는 기존 목록과 cursor를 유지하고 focus만으로 다시 요청하지 않는다. 작성 성공은 메모리의 변경 revision으로 구분하며 작성 취소·실패는 revision을 변경하지 않는다. Pull-to-refresh는 현재 필터의 첫 페이지로 목록과 pagination을 교체하며 중복 요청과 load-more 동시 실행을 막고 성공·실패 후 refreshing을 해제한다.

Pull-to-refresh는 서버의 최신 item 전체 값으로 목록을 교체한다. Load-more에서 겹치는 type/id도 기존 위치를 유지하면서 최신 서버 값으로 교체한다. Refresh UI는 요청 시작부터 최소 1000ms 유지하고, API가 더 오래 걸리면 완료 즉시 해제한다. 이 시간 동안 중복 refresh/load-more를 막으며 필터 변경·unmount는 기존 요청과 남은 대기를 취소한다. 상대시간은 화면별 하나의 60초 tick을 feed item에 전달해 재계산하며 refresh 시작/응답, 화면 focus, foreground 복귀에서도 현재 시각을 갱신한다. 상세 작성자 표시도 같은 상대시간 formatter를 사용한다.

| API | 요청 | 성공 응답 |
| --- | --- | --- |
| `GET /api/users/check-email` | query `email` | `200 { "available": boolean }` |
| `GET /api/users/check-nickname` | query `nickname` | `200 { "available": boolean }` |
| `POST /api/auth/email-verifications` | JSON `{ "email": string }` | `202`, 본문 없음 |
| `POST /api/auth/email-verifications/verify` | JSON `{ "email": string, "code": string }` | `204`, 본문 없음 |
| `POST /api/users` | JSON `{ "email": string, "password": string, "nickname": string, "consents": { "termsOfService": boolean, "privacyPolicy": boolean, "marketing": boolean } }` | `201`, 사용자 정보 JSON |

인증번호는 6자리 숫자이며, 인증번호 유효 시간 기본값은 300초다. 발송·검증 실패는 백엔드의 HTTP 상태 코드로 처리한다. 회원가입 성공 후 자동 로그인은 하지 않는다.

## 팝업 방문 리뷰 작성·목록

- `GET /api/popups/{publicId}/reviews?cursor={reviewId}`: public 조회. `{ items, nextCursor }`이며 item은 기존 community REVIEW 계약과 같다. 팝업별 id 내림차순, 페이지당 20개, 사진·프로필은 signed GET URL이다. 잘못된 cursor 400, 없는/POPUP이 아닌 장소 404다.
- `POST /api/popups/{publicId}/reviews`: Bearer 인증. `{ rating: 1..5 정수, content: string, uploadToken?: string }` → `201 { id }`. 작성자는 PopkuPrincipal이며 userId나 imageKey는 받지 않는다. 기존 reviews/review_images에만 저장하고 community REVIEW UNION에 그대로 포함된다.
- rating은 기존 DECIMAL(2,1)에 정수 점수로 저장하며 0.5점은 새 작성 API에서 허용하지 않는다. 기존 리뷰 API가 없고 schema는 TEXT NOT NULL이라 빈 문자열을 허용한다. 내용은 그대로 보존하며 MySQL TEXT의 UTF-8 65,535바이트 한도를 서버·RN에서 검증한다. rating/content 오류 400, 비로그인 401, 없는 팝업 404, 기존 `(user_id, place_id)` UNIQUE 중복은 409다. migration은 없다.
- `POST /api/popups/{publicId}/review-image-uploads`: `{ count: 1..5, contentType: "image/webp" }` → `201 { uploadToken, images: [{ imageKey, uploadUrl, contentType, sortOrder }] }`. 기존 S3 presigned PUT을 사용하되 별도 리뷰 서명 키와 popup claim으로 게시글 토큰 및 다른 팝업을 분리한다. 키는 `community/reviews/{userId}/{UUID}/{0..4}.webp`다.
- `DELETE /api/popups/{publicId}/review-image-uploads`: `{ uploadToken }` → `204`. 등록된 이미지 409, 다른 사용자/팝업 토큰 403, 잘못된 토큰 400, 정리 실패 500. 생성은 사용자 행 잠금·S3 HEAD(WebP) 검증·DB transaction으로 리뷰/사진을 원자적으로 저장한다. 동일 이미지 토큰 재시도는 같은 리뷰 id를 반환한다. rollback은 미등록 S3 객체만 best effort 정리한다.
- RN은 팝업 상세의 방문 리뷰 탭에서 `/reviews/write?publicId=...`로 진입한다. 비로그인은 기존 로그인으로 이동한다. 작성 성공은 이전 팝업의 리뷰 탭으로 돌아가 해당 팝업 목록만 갱신하며, 기존 community 작성 revision을 증가시킨다. 네트워크/5xx로 이미지 리뷰 등록 결과가 불명확하면 원래 popup/rating/content/uploadToken을 유지해 재시도한다. 401은 기존 generation-safe auth helper로 처리한다. REVIEW 자체 삭제는 아래 DELETE 계약을 사용한다.

## 방문 리뷰 상세

- `GET /api/community/reviews/{reviewId}`: public 단건 조회, 없는 리뷰는 404. POST와 별도 namespace로 reviews만 조회한다. 선택적 PopkuPrincipal로 liked/isOwner를 계산한다.
- 응답: `{ id, type: "REVIEW", rating, content, createdAt, updatedAt, author: { id, nickname, avatarUrl }, popup: { publicId, title } | null, images: [{ id, url }], likeCount, commentCount, liked, isOwner }`. 기존 비팝업 리뷰는 popup이 null이다.
- 작성자는 JOIN, 이미지는 sort_order/id 순서의 일괄 조회와 기존 signed GET URL을 사용한다. review_likes/comments.review_id로 count를 조회한다. 조회수 및 updated_at은 변경하지 않는다. 좋아요는 아래 REVIEW 전용 API를 사용한다.
- 팝업 리뷰 목록과 community REVIEW 카드는 `/reviews/[id]`로 이동한다. 단순 back/focus는 목록·피드 revision이나 cache를 변경하지 않는다. 상세 public 요청도 기존 generation-safe session helper를 사용한다.

## 방문 리뷰 수정

- `GET /api/community/reviews/{reviewId}/edit`: Bearer 인증, owner만 `200` 기존 REVIEW Detail을 반환한다. 미인증 401, 타인 403, 없는 REVIEW 404이며 조회로 updated_at/view_count를 바꾸지 않는다.
- `PATCH /api/community/reviews/{reviewId}`: `{ rating, content, retainedImageIds: number[], uploadToken?: string }` → `200` 최신 REVIEW Detail. popup/작성자는 변경하지 않는다. 별점은 작성과 같은 정수 1~5, 내용은 빈 문자열 허용·null 금지·UTF-8 65,535바이트 이하이다.
- owner 사용자 행 → REVIEW 행 잠금과 단일 transaction으로 별점/본문/이미지를 수정한다. retained ID는 해당 review_images만 허용하고 중복을 거부한다. 유지 사진은 원래 순서, 신규 batch는 뒤에 붙이며 최종 0~5장이다. POST와 공용 이미지 수정 planner를 사용한다.
- 신규 사진은 기존 review uploadToken의 사용자/popup claim·WebP HEAD 검증을 사용한다. 같은 batch가 이 REVIEW에 전부 연결되어 있으면 재시도 시 기존 행 ID를 재사용한다. 다른 REVIEW나 일부만 남은 batch는 거부한다. 기존 사용자 잠금을 유지하고 schema/migration 및 H01 범용 계약 변경은 없다.
- 제거 S3 객체는 POST와 공용 commit 이후 cleanup helper에서 best effort 정리한다. 정리 실패는 DB 성공을 되돌리지 않는다. 신규 객체는 기존 review rollback cleanup을 따른다.
- RN은 `/reviews/write?editId={id}`로 작성 화면을 재사용하며 existing/new 사진을 kind로 분리한다. 성공하면 back으로 기존 상세에 복귀하고 `REVIEW:id` content/rating/images/imageIds/updatedAt만 항목별 반영한다. liked/likeCount/commentCount는 덮지 않는다. 진행 중 상세/feed/팝업 목록 GET에도 기존 read-version 기록을 적용한다. 취소/성공으로 전체 refetch 또는 revision을 증가시키지 않는다.
- 응답 유실/5xx에서는 수정 대상·별점·본문·retained ID·uploadToken을 고정해 재시도한다. 작성과 같은 WebP/1600/0.8/binary PUT을 사용하며 실패 시 draft 보존, synchronous ref lock 및 generation-safe 401을 유지한다. REVIEW 자체 삭제는 아래 DELETE 계약을 사용한다.

## 방문 리뷰 자체 삭제

- `DELETE /api/community/reviews/{reviewId}`: Bearer principal owner만 허용, 성공 `204 No Content`. 미인증 401, 타인 403, 없는 REVIEW 404. 기존 POST처럼 응답 유실 후 retry의 404는 성공으로 간주하지 않는다.
- 수정과 같은 사용자 행 → REVIEW 행 잠금 및 ownership helper를 사용한다. 이미지 key를 확보하고 REVIEW 및 해당 review_id COMMENT reports를 명시적으로 정리한 뒤 REVIEW 행을 삭제한다. 이미지·좋아요·root/reply·댓글 좋아요는 기존 FK cascade를 사용하며 단일 transaction 실패는 rollback한다.
- S3는 기존 CommunityImageCleanup을 통해 commit 이후 best effort 정리한다. DB rollback 시 기존 사진은 삭제하지 않고, S3 실패는 DB 삭제 성공 및 204를 되돌리지 않는다. migration/신고 UI는 추가하지 않는다.
- RN owner compact 메뉴의 수정/삭제 및 destructive 확인을 공유한다. synchronous ref lock으로 DELETE 중복과 같은 화면의 새 mutation을 막는다. 성공 후 `REVIEW:id` null 변경 이벤트로 Community/PopupReviews 해당 항목만 제거하고 기존 상세를 back한다. 전체 GET/revision 및 cursor 초기화는 없다. 기존 mutation tombstone으로 오래된 feed/popup 응답을 필터링하고 detail은 404 처리한다. 실패 시 항목·화면 유지, 메뉴 재시도와 generation-safe 401을 따른다.

## 방문 리뷰 좋아요

- `POST /api/community/reviews/{reviewId}/like`: Bearer 인증, 요청 본문 없음 → `200 { liked: boolean, likeCount: number }`. 비로그인 401, 없는 REVIEW 404. 작성자와 무관하게 좋아요 가능하며 POST id namespace와 분리한다.
- 기존 POST와 동일한 toggle semantics다. transaction 내 reviews 대상 행 `FOR UPDATE` → 기존 좋아요 DELETE → 없었으면 INSERT → COUNT 순서로 처리한다. 기존 review_likes 사용자/리뷰 UNIQUE·FK·index를 사용하며 migration은 없다. response-loss 자동 재시도는 하지 않는다.
- 피드·상세·팝업 리뷰 목록은 공용 changeCommunityLike 및 communityFeedRefresh의 `REVIEW:id` 기록/잠금/이벤트로 optimistic·확정·rollback을 공유한다. 기존 POST는 `POST:id`로 분리된다. 좋아요로 전체 목록 GET이나 작성 revision을 변경하지 않는다.
- 세 REVIEW 조회도 기존 beginCommunityRead/version 병합을 사용한다. 진행 중 optimistic 또는 GET 이후 mutation은 늦은 GET보다 우선하며 이후 새 조회는 서버 값을 우선한다. 비로그인은 로그인, 401은 요청 generation을 기존 clearTokens에 전달하며 이전 세션 응답은 현재 세션을 변경하지 않는다.

## 방문 리뷰 댓글·답글

- `DELETE /api/community/reviews/{reviewId}/comments/{commentId}`: Bearer 인증 → `200 { commentCount }`. 미인증 401, 타인 댓글 403, 없는 REVIEW/댓글 또는 다른 REVIEW·POST 소속 댓글 404. 공용 POST 삭제 경로에서 REVIEW 행 잠금과 review_id 검증을 사용한다. root는 thread 전체, reply는 해당 행만 삭제한다. COMMENT reports 정리·FK cascade·실제 COUNT를 한 transaction으로 처리하며 실패 시 rollback한다.
- RN은 기존 본인 댓글 메뉴·확인을 공유한다. 성공 후 로컬 thread/reply 제거, 관련 reply target 해제 및 draft 유지, 서버 count를 REVIEW 상세·feed·PopupReviews에만 sync한다. 작성/삭제 공용 ref lock과 generation-safe 401을 사용한다. 전체 refetch/revision 변경은 없고, 기존 read-version에 삭제 기록을 보관해 진행 중인 오래된 GET의 댓글 resurrection을 차단한다.

- `GET /api/community/reviews/{reviewId}/comments`: public → `200 { items, commentCount }`. 없는 REVIEW는 404. 기존 POST 댓글 Item DTO와 작성자/replyToUser JOIN·signed avatar·시간 형식을 그대로 사용한다. 선택적 PopkuPrincipal로 isOwner를 계산한다.
- `POST /api/community/reviews/{reviewId}/comments`: Bearer 인증, `{ content, parentCommentId?: number, replyToUserId?: number }` → `201 { item, commentCount }`. 미인증 401, 없는 REVIEW 404, blank/Unicode 10,000자 초과/잘못된 thread 관계 400. 임의 userId는 작성자를 결정하지 않는다.
- 공용 CommunityCommentService/Mapper를 대상 타입으로 확장한다. REVIEW는 review_id만 설정하고 post_id는 null이다. root의 parent/reply target은 null, nested reply는 root parent로 정규화하고 reply_to_user_id는 실제 답변 대상 작성자다. 부모·root의 동일 REVIEW 소속과 root thread 참여자를 검증한다. root 및 내부 답글은 오래된 createdAt/id 순서다.
- 리뷰 행 FOR UPDATE 안에서 검증·INSERT·실제 COUNT 반환을 처리한다. 기존 comments target CHECK/FK/index를 사용하며 migration은 없다.
- RN CommunityComments는 POST의 기존 postId 호출을 유지하고 REVIEW에서는 targetType="REVIEW"/targetId를 받는다. 한 단계 indentation, 별도 bold @nickname, reply label/cancel, KeyboardAvoidingView와 하단 input을 공유한다. content에는 mention을 붙이지 않는다. 성공은 item 로컬 반영 및 input/target 초기화, 실패는 draft/target 유지, ref lock으로 중복 등록 방지, POST 자동 재시도 없음이다.
- commentCount는 기존 communityFeedRefresh의 REVIEW:id 이벤트/기록으로 상세·feed·PopupReviews에 동기화한다. POST:id와 분리되며 목록 전체 GET 및 작성 revision 증가는 없다. 댓글 목록·상세·feed·팝업 리뷰 GET 모두 기존 read-version 보호를 사용한다. anonymous는 로그인 이동, REVIEW 작성 401은 요청 generation을 기존 auth helper에 전달한다.

## 커뮤니티 게시글 상세

- `GET /api/community/posts/{id}`: 인증 없이 QUESTION / FREE 게시글 하나를 조회한다. 성공은 200, 없는 id 또는 제외 카테고리(ON_SITE_INFO 및 REVIEW)는 기존 ResponseStatusException 방식으로 404다. reviews 테이블의 id는 상세 조회 대상이 아니며 posts의 id만 조회한다.
- 응답: `{ id, category, author: { id, nickname, avatarUrl }, content, createdAt, updatedAt, images: string[], imageIds: number[], likeCount, commentCount, viewCount, liked, isOwner }`. imageIds는 images와 같은 순서의 post_images ID이며 isOwner는 인증 사용자와 posts.user_id를 서버에서 비교한다. 비로그인은 false다. 시간은 기존 피드처럼 Asia/Seoul offset을 포함한다. 지역·팝업·별점은 제공하지 않는다.
- images는 post_images의 sort_order / id 순서이며 기존 PopupImageStore의 signed GET URL을 반환한다. author.avatarUrl은 users.profile_image_key의 signed GET URL 또는 null이다.
- 상세 조회 트랜잭션에서 view_count를 1 증가한 후 조회하며 증가한 값을 반환한다. 조회수 중복 방지는 없고, 실패한 상세 조회는 rollback한다. 조회수 증가만으로 updated_at이 바뀌지 않도록 기존 값을 명시적으로 유지한다.
- QUESTION/FREE 댓글 목록·작성·답글·본인 댓글 삭제는 아래 API를 사용한다. 게시글 좋아요는 아래 토글 API를 사용한다. 댓글 좋아요/수정 API는 제공하지 않는다. 신고는 아래 공통 /api/reports 계약을 사용한다.

## 커뮤니티 QUESTION / FREE 게시글 수정·삭제

- `GET /api/community/posts/{id}/edit`: 본인 글의 수정 초기값을 반환한다. 조회수는 증가하지 않으며 상세와 같은 응답이다. Bearer 인증 필수다.
- `PATCH /api/community/posts/{id}`: `{ content, retainedImageIds: number[], uploadToken?: string }` → `200` 최신 상세 데이터. category와 userId는 입력받지 않는다. 본문은 작성과 같은 strip 및 Unicode code-point 1~10,000자 규칙을 적용한다.
- `DELETE /api/community/posts/{id}`: 성공 `204`, 본문 없음. 수정·삭제 모두 PopkuPrincipal.id와 posts.user_id를 비교한다. 미인증 401, 다른 작성자 403, 없는/제외 카테고리 404, 잘못된 본문·이미지 관계·최종 개수 400이다.
- 수정은 기존 작성 화면 `/community/write?editId={id}`를 공유한다. category는 고정하며 기존 이미지는 ID로 유지/제거하고 새 이미지는 기존 WebP 변환·presign·PUT·HEAD 검증과 uploadToken을 재사용한다. 최종 0~5장, 기존 유지 이미지 다음에 새 이미지가 추가된다.
- 게시글 행 잠금과 단일 DB transaction으로 본문·이미지 관계를 변경하며 유지 이미지 ID는 바꾸지 않는다. 같은 신규 uploadToken으로 응답 유실 재시도를 해도 중복 이미지를 만들지 않는다. 다른 글에 붙은 token과 부분적으로만 남은 batch 재사용은 409로 거부한다.
- 삭제는 기존 FK cascade로 post_images, post_likes, comments(답글 포함), comment_likes를 정리한다. FK가 없는 reports의 해당 POST/COMMENT 참조만 transaction 안에서 제거한다. REVIEW 및 다른 게시글 데이터는 보존한다. DB schema 변경은 없다.
- 제거할 S3 key를 확보하고 DB commit 이후 cleanup한다. 기존 작성자 잠금과 key 참조 재검증으로 재시도에 의해 다시 연결된 객체는 보호한다. rollback 시 기존 객체를 삭제하지 않으며 cleanup 오류는 로그를 남기고 이미 성공한 수정·삭제 응답을 실패로 바꾸지 않는다. 부분 제거 후 이전 uploadToken cleanup도 유지 중인 객체를 삭제하지 않는다. 별도 queue/outbox/재시도 작업은 추가하지 않는다.
- 수정 성공은 기존 항목별 알림으로 content/images/imageIds/updatedAt만 상세·피드에 적용한다. 좋아요·댓글·조회수는 초기화하지 않는다. 삭제 성공은 해당 POST 제거 알림을 먼저 전달하고 상세에서 back한다. revision, 전체 refetch, category/sort, cursor, 목록 위치 및 목록 key를 변경하지 않는다. 이미 진행 중이던 오래된 feed 응답이 수정 값을 덮거나 삭제 항목을 복원하지 않는다.
- 본인 글 메뉴는 RN Modal의 compact bottom sheet를 사용하고 바깥 탭 또는 핸들 아래로 끌기로 닫는다. 삭제는 별도 destructive 확인 후 요청한다. 수정 제출·삭제 요청은 첫 await 전 ref 잠금으로 중복을 차단한다. 실패 시 form/상세/피드 보존, 401은 토큰 정리 후 기존 `/profile/login` 이동이다. 새 이미지 수정 응답을 잃으면 원래 form/token을 보존하고 수정 완료로 같은 요청을 재확인한다.

## 커뮤니티 QUESTION / FREE 댓글

- `GET /api/community/posts/{id}/comments`: public 조회. `200 { items: [...], commentCount }`를 반환한다. 없는 게시글 또는 QUESTION/FREE 외 category는 404다.
- 댓글 item의 `isOwner`는 선택적 Bearer 인증의 PopkuPrincipal.id와 작성자를 서버에서 비교한다. 비로그인은 false다. 만료 토큰의 public 조회는 기존 토큰 정리 후 익명 조회 패턴을 사용한다.
- `DELETE /api/community/posts/{id}/comments/{commentId}`: Bearer 인증 필수. 성공 `200 { commentCount }`로 삭제 후 root+reply 실제 총 개수를 반환한다. 미인증 401, 타인 댓글 403, 없는/제외 게시글 또는 해당 post에 없는 댓글은 404다. 서버가 principal과 comments.user_id를 비교한다.
- 댓글 삭제는 작성과 같은 게시글 행 잠금 및 단일 transaction을 사용한다. root는 기존 parent FK cascade로 모든 답글을 함께 삭제하고, reply는 자신만 삭제한다. comment_likes는 cascade로 정리하고 FK가 없는 COMMENT reports는 해당 삭제 대상만 먼저 정리한다. 실패 시 모두 rollback한다. 살아남은 답글의 reply_to_user_id 및 멘션은 유지한다. schema 변경은 없다.
- 본인 댓글의 작은 메뉴에서 compact 삭제 메뉴와 확인 Alert를 연다. 삭제 성공 후에만 상세 state에서 root thread 또는 reply 하나를 제거하고, 서버 commentCount만 기존 item-level 알림으로 상세·피드에 반영한다. 댓글/상세/feed 재조회, 작성 revision, cursor/scroll reset은 하지 않는다. 삭제 대상 댓글/thread의 답글 선택은 해제하되 입력문은 유지한다. 동기적 ref lock으로 작성·삭제 요청을 직렬화하고 실패 시 기존 데이터 유지 및 재시도를 허용한다. DELETE 401은 토큰 정리 후 기존 로그인으로 이동한다.
- item: `{ id, content, createdAt, updatedAt, author: { id, nickname, avatarUrl }, parentCommentId, replyToUser: { id, nickname } | null, isOwner }`. 시간은 Asia/Seoul offset이며 avatarUrl은 기존 PopupImageStore signed GET URL 또는 null이다. 답변 대상 nickname은 users를 조회하며 content와 별도로 제공한다.
- flat items는 root 작성 시각/id 오래된 순으로 정렬하고 각 root 바로 뒤에 답글을 작성 시각/id 오래된 순으로 묶는다. 무한 depth 트리를 반환하지 않는다.
- `POST /api/community/posts/{id}/comments`: Bearer 인증 필수. `{ content, parentCommentId?, replyToUserId? }` → `201 { item, commentCount }`. userId는 받지 않고 PopkuPrincipal을 사용한다. 댓글은 기존 게시글과 같은 strip 및 Unicode code-point 기준 1~10,000자 검증을 적용한다. 미인증 401, 없는/제외 게시글 404, 잘못된 본문·답글 관계 400이다.
- root는 parent/reply target 둘 다 null이다. 답글은 parent가 현재 post의 댓글인지 확인하고 parent가 답글이면 root ID로 정규화한다. root도 현재 post의 최상위 댓글이어야 하며 replyToUserId는 해당 root 또는 root의 답글 작성자여야 한다. 답글 작성 시 두 관계 필드가 모두 필요하다. 다른 post/thread의 대상은 저장하지 않는다.
- DB 변경 없음. 기존 comments의 post/review target CHECK와 FK를 재사용하며 QUESTION/FREE 댓글의 review_id는 null이다. 작성 트랜잭션은 기존 게시글 행 잠금을 재사용하고 등록한 item과 실제 전체 commentCount를 반환한다.
- 상세는 한 단계 답글 들여쓰기, 별도 `@nickname` Text의 fontWeight 700, 기존 굵기의 본문을 표시한다. avatar/fallback은 CommunityAuthor를 재사용하며 모든 댓글이 상세 화면의 now/tick과 상대시간 formatter를 공유한다.
- 하단 입력창은 KeyboardAvoidingView와 기존 상세 Safe Area 안에 배치한다. 답글 대상 표시/X 취소를 제공하며 성공 시 입력과 대상을 비우고 새 item을 root 아래에 넣는다. 실패 시 입력과 대상을 유지하며 등록 중 중복 요청을 막는다. 토글과 마찬가지로 인증 없음/401은 기존 `/profile/login`으로 이동한다. 댓글 POST는 자동 재시도하지 않는다.
- 작성 성공은 기존 communityFeedRefresh의 항목별 메모리 알림으로 해당 POST의 commentCount만 반영한다. 작성 revision 증가, feed 전체 refetch, 목록 재마운트는 하지 않는다. 늦게 도착하는 feed/detail GET이 새 commentCount를 덮어쓰지 않으며 이후 새 조회는 서버 값을 우선한다. 댓글 목록 성공 시 실제 개수도 상세·피드에 반영한다.

## 커뮤니티 게시글 좋아요

- `POST /api/community/posts/{id}/like`: QUESTION / FREE 게시글의 좋아요를 토글한다. 요청 body 없이 Bearer token의 `PopkuPrincipal.id`를 사용한다. 성공은 `200 { liked: boolean, likeCount: number }`, 미인증은 401, 없는 게시글 또는 제외 category는 404다.
- DB 변경 없음. 기존 `post_likes`의 `UNIQUE(user_id, post_id)`와 FK를 유지한다. 트랜잭션에서 대상 posts 행을 `FOR UPDATE`로 잠근 뒤 좋아요 삭제 또는 생성을 수행하고 개수를 반환한다. 같은 게시글의 동시 토글은 직렬화된다.
- `GET /api/community/feed`와 `GET /api/community/posts/{id}`는 계속 public이다. 기존 JWT 필터와 선택적 `@AuthenticationPrincipal`을 사용하며 로그인 조회에 `liked`를 반환한다. 피드는 현재 페이지의 POST/REVIEW id를 각각 일괄 조회해 `liked`를 반환한다. 비로그인은 좋아요 조회 없이 false이며 기존 `likeCount`는 유지한다.
- 프론트 public 조회는 저장된 access token이 있으면 Authorization을 전달한다. 만료 토큰으로 401을 받으면 기존 토큰 정리 후 public 조회로 재시도한다.
- 인증 토큰과 session generation을 함께 읽고, 401은 요청 당시 세션이 현재 세션일 때만 무효화한다. 같은 세션의 동시 401은 하나의 토큰 삭제/사용자 변경을 공유한다. SecureStore 저장·삭제를 직렬화해 삭제 도중 시작된 새 로그인도 보호한다. 이전 세션의 public 401 재시도는 현재 토큰이 있으면 그 토큰을 사용한다. 게시글 작성·수정·삭제 및 찜의 인증 오류도 요청 generation을 전달하며, 좋아요·댓글 mutation의 기존 session guard는 유지한다.
- heart는 비어 있거나 채워진 기존 Lucide 아이콘을 사용한다. 저장된 token 확인 후 API 응답 전에 liked와 개수를 변경하고, 성공 시 서버 응답을 반영하며 실패 시 이전 두 값으로 복구한다. 게시글 id별 요청 잠금을 첫 await 전에 획득해 피드·상세를 포함한 연속 요청을 차단한다. 토글 요청은 자동 재시도하지 않는다.
- `communityFeedRefresh`의 항목별 메모리 알림으로 마운트된 피드·상세의 `liked / likeCount`만 반영한다. 좋아요는 작성 revision을 변경하지 않으며 피드 전체 재조회·목록 재마운트·정렬 재배치를 하지 않는다. 늦게 도착한 GET은 요청 이후 변경 또는 진행 중인 optimistic 상태를 덮어쓰지 않고, 이후 새 조회는 서버 값을 우선한다.
- feed/detail/댓글 목록 GET의 시작 version을 완료·실패·abort까지 추적한다. 새 GET이 좋아요/댓글 수 변경 기록을 확인해도 이전 GET이 남아 있으면 최신 확인값과 보호 version을 유지한다. 확인된 기록은 보호할 이전 GET이 끝나면 정리하고, 확인되지 않은 유휴 기록은 종류별 최근 256개만 보관한다. 진행 중 optimistic mutation과 이전 GET이 필요한 기록은 개수 제한으로 제거하지 않는다. 취소된 응답은 병합하지 않으며 post edit patch와 delete tombstone 정책은 유지한다.
- 비로그인 heart는 토글 API를 호출하지 않고 기존 `/profile/login`으로 이동한다. 토글 401도 복구·토큰 정리 후 같은 로그인 화면으로 이동한다. 계정 변경·로그아웃은 좋아요 메모리 상태를 정리하고, 인증 사용자 변경 시 새 사용자 기준으로 조회한다. 글쓰기 버튼의 인증 UX는 변경하지 않는다.

## 커뮤니티 게시글 이미지

- 인증: 기존 Bearer token / `PopkuPrincipal`을 사용한다. 클라이언트의 userId, postId, imageKey는 받지 않는다.
- 이미지 없는 작성은 기존 `POST /api/community/posts`의 `{ category, content }` 및 `201 { id }`를 유지한다.
- `POST /api/community/post-image-uploads`: `{ count: 1..5, contentType: "image/webp" }` → `201 { uploadToken, images: [{ imageKey, uploadUrl, contentType, sortOrder }] }`. uploadToken은 서버가 작성자·UUID·이미지 개수에 서명한 정보이며 별도 테이블이나 세션 상태를 생성하지 않는다. 기존 JWT 비밀키에서 용도를 분리한 서명키를 사용하며 이 토큰으로 로그인할 수 없다.
- 각 변환된 WebP를 해당 URL에 `Content-Type: image/webp`로 직접 PUT한다. 로컬 파일은 `fetch(uri).arrayBuffer()`로 읽고 ArrayBuffer body로 전송한다. Expo SDK 57 fetch의 Blob body는 명시한 Content-Type을 Blob.type으로 덮어쓰므로 캐시 파일의 빈 MIME 값이 서명 조건을 바꾸지 않도록 Blob을 사용하지 않는다. URL 유효 시간은 기존 S3 store의 10분이다.
- `POST /api/community/posts`: `{ category: "QUESTION" | "FREE", content, uploadToken }` → `201 { id }`. 서명 및 인증 작성자를 검증하고 기존 users 작성자 행을 잠근다. 모든 S3 object의 존재와 Content-Type을 HEAD로 확인한 뒤 posts와 post_images를 한 트랜잭션으로 저장한다. 같은 token으로 재시도하면 기존 post_images key를 조회해 같은 게시글 ID를 반환한다.
- `DELETE /api/community/post-image-uploads`: `{ uploadToken }`으로 현재 요청에서 업로드한 미등록 파일을 정리한다. 본인 서명 정보만 허용하며 삭제 성공은 204, 삭제 실패는 500이다. 이미 등록된 key는 409로 보호한다.
- 서버 생성 key는 `community/posts/{userId}/{upload UUID}/{0..4}.webp`다. 클라이언트가 별도 key나 기존 게시글 ID를 제출해서 이미지를 붙일 수 없다.
- 이미지 정책: 0~5장, 선택 순서, 로컬 WebP quality 0.8, 긴 변 최대 1600px, 작은 이미지 확대 없음. 서버는 HEAD의 Content-Type을 검증하며 byte signature/해상도/quality는 별도로 검증하지 않는다.
- 사진 선택기가 반환하면 캐시 URI 미리보기를 먼저 표시하고 이미지별 처리 표시와 함께 한 장씩 WebP로 변환한다. 변환 중에도 본문·카테고리 편집과 이미지 삭제가 가능하며 모든 변환이 끝나기 전에는 등록을 막는다. 변환 실패한 이미지는 제외하고 기존 일반 오류 문구를 표시한다.
- 프론트 개발 모드의 `[COMMUNITY]` 실패 로그는 PRESIGN / LOCAL_FILE / S3_PUT / POST_CREATE 및 REGISTER 단계를 구분한다. API/S3 상태와 가린 오류 본문을 기록하며 이미지 번호는 1부터 시작한다. 응답 본문은 최대 4096자로 제한하고 토큰·서명 URL·AWS 서명 정보는 가린다.
- 서버 진단 로그는 `popku.community.diagnostics=${POPKU_COMMUNITY_DIAGNOSTICS:false}` Spring property로 연결하며 JVM 옵션 `-Dpopku.community.diagnostics=true`도 지원한다. 활성화 시 전용 JUL 콘솔 핸들러로 서버 시작의 DIAGNOSTICS, 성공한 PRESIGN 및 PRESIGN_PUT의 method/Content-Type/signed header 이름을 기록한다. 앱의 S3 PUT 실패는 서버로 전달되지 않는다. 서버 실패 로그는 S3_HEAD / POSTS_SAVE / POST_IMAGES_SAVE 및 검증·commit 단계를 구분하고 AWS status/error code/request ID, DB SQLState/error code를 기록한다. 요청 본문·예외 스택·토큰·서명 URL은 기록하지 않는다.
- 프론트 S3_PUT 실패 로그에는 signed header 이름·요청 Content-Type·binary body type/size를 추가한다. S3 XML에 CanonicalRequest가 있으면 실제 method/Content-Type/signed header 이름만 추출하고 전체 canonical request·쿼리·서명 정보는 계속 가린다. canonicalRequestPresent / actualContentTypePresent로 canonical request 부재와 Content-Type 헤더 부재를 구분하며, 존재하는 빈 Content-Type은 빈 문자열로 기록한다.
- 업로드 실패 시 아직 게시글이 없으므로 부분 게시글은 남지 않는다. 프론트는 발급받은 token으로 해당 요청의 파일 삭제를 시도한다. DB 저장이 rollback되면 서버도 관련 S3 파일을 삭제한다. 작성·재시도·cleanup은 작성자 행 잠금으로 직렬화하며 등록된 파일을 삭제하지 않는다.
- DB schema/migration 변경 없음. 별도 upload session, 상태 테이블, 만료 정리 작업은 사용하지 않는다.
- cleanup은 현재 요청에서 가능한 범위로만 수행한다. 앱 강제 종료, 서버 중단, 지속적인 네트워크/S3 삭제 실패, 실패 응답 이후 늦게 완료된 PUT은 미등록 S3 object를 남길 수 있다. 이를 자동 추적하거나 재시도하는 구조는 이번 범위에 포함하지 않는다.
- 작성 응답을 잃으면 화면의 원래 요청과 token을 유지해 등록 버튼으로 완료 여부를 재확인한다. 이때 편집 및 화면 종료를 막으며, 이미 확정된 S3 파일을 cleanup하지 않는다.
- 신규 작성·수정의 명확한 저장 401은 draft와 로컬 미리보기를 유지하고 pending attempt를 해제한 뒤, 해당 세션에 한해 토큰을 정리하고 기존 로그인 화면으로 이동한다. 이때 cleanup은 최선 노력으로 수행하며 인증 복구를 기다리게 하지 않는다. 단, 앞선 저장 결과가 불명확한 attempt를 재시도하다 401을 받은 경우에는 원래 token/요청을 보존하고 cleanup하지 않는다. 이 경우 중복 저장 방지를 위한 편집 잠금은 유지하되 로그인 및 화면 이탈을 허용하며, 재인증 후 동일 token으로 재확인한다. 401·실패·취소는 작성 revision을 증가시키지 않는다.
- RN 커뮤니티·방문 리뷰 제출은 로컬 파일당 15초, presign 30초, S3 PUT 이미지당 120초, 등록·수정 60초의 제한 시간을 적용한다. 응답 본문 읽기도 같은 단계의 제한 시간에 포함하며 fetch에 연결한 AbortController를 abort한다. 등록 timeout은 결과 불명확으로 기존 uploadToken과 요청을 보존하고 재업로드·cleanup 없이 재확인한다. HTTP 거절 상태를 이미 받은 경우 본문 읽기가 지연돼도 상태 및 auth generation을 보존한다. 화면 이탈·인증 세션 고정 정책은 변경하지 않는다.
- DELETE cleanup은 별도로 최대 10초 기다린 뒤 fetch의 AbortController를 abort하며, abort에 반응하지 않는 Promise도 호출자의 대기를 끝낸다. HTTP 오류 본문 읽기에도 같은 제한이 적용된다. 정리 요청 오류는 기존 개발 진단 CLEANUP 로그에 민감정보를 가려 기록하고 원래 PUT·등록 오류는 그대로 전달한다. timeout·응답 유실은 서버 삭제 여부가 불명확하며 성공·실패 확정으로 기록하지 않는다. 자동 재시도·정리 큐는 없고, 결과 불명확한 등록 attempt에는 DELETE를 실행하지 않는다.
- 작성 화면 언마운트 시 제출 작업을 무효화하고 로컬 읽기·presign·PUT을 abort한다. 순차 PUT의 다음 단계와 등록·수정 fetch 직전에도 취소 여부를 확인한다. 아직 전송하지 않은 새 업로드는 기존 10초 cleanup으로 정리하지만, 앞선 등록 결과가 불명확한 token은 삭제하지 않는다. 이미 전송한 등록·수정은 화면 이탈로 abort하지 않고 기존 60초 제한 및 결과 불명확 정책을 유지한다. 성공 시 공통 목록 변경 이벤트는 유지하되 이전 작업의 화면 state·이동은 차단한다. 미확인 attempt는 여전히 화면 메모리에만 보관되어 강제 언마운트·프로세스 종료 후 재확인을 보장하지 않는다(영속화는 별도 범위).
- 제출 시작 시 현재 인증된 사용자(id가 없으면 email)와 기존 auth generation을 고정한다. 로그인 토큰 저장·토큰 삭제·로그아웃 시작 시 진행 중 로컬 읽기·presign·PUT을 abort하고 각 PUT 및 인증 조회 후 실제 API fetch 직전에도 작업 소유자와 generation을 검사한다. 계정이 바뀐 작업의 응답은 새 계정 UI·목록 변경 이벤트에 반영하지 않는다. 이미 전송한 등록은 이탈 때와 같이 결과를 보존하며 계정 변경만으로 abort하거나 DELETE하지 않는다. cleanup도 실제 fetch 직전 소유 세션을 검사하며, 현재 세션이 달라졌으면 오래된 access token을 저장·재사용하거나 새 계정으로 정리하지 않는다. 미확인 token은 다른 계정에서 재사용할 수 없다. 같은 계정이 재인증 후 직접 재시도하는 경우에만 새 generation의 별도 작업 snapshot으로 원래 token·요청을 재확인하며 자동 재개·재업로드하지 않는다. 동일 generation에서는 access token 문자열을 비교·고정하지 않고 실제 요청 시 현재 토큰을 읽는다. 계정 변경으로 건너뛴 정리의 S3 고아 객체와 미확인 작업 영속화는 별도 범위다.

## 계획

팝업스토어 목록, 상세 정보, 국가 및 지역 필터에 필요한 데이터 연동 방식은 제품 및 기술 설계가 확정된 뒤 정의한다.

## 미정 사항

- API 제공 여부와 통신 방식
- 엔드포인트와 요청·응답 형식
- 인증 및 권한 정책
- 오류 응답 규격

미정 항목은 실제 설계 또는 구현이 이루어지기 전까지 임의로 확정하지 않는다.

## 팝업 대표 카테고리 정책

- 기존 tags / place_tags 및 tag ID를 재사용한다. 등록 POST / 수정 PUT의 tagIds 배열은 정확히 한 개의 유효한 ID가 필수이며, 0개·복수·null은 서버와 관리자 공용 폼에서 거부한다. 공개 응답 tags 배열과 필터 tagIds 계약은 유지한다.
- 카테고리는 캐릭터/IP, 게임/디지털, 연예/크리에이터, 패션, 뷰티, F&B, 아트/전시, 문구/소품, 라이프, 패밀리/펫, 기타다. 이름 변경 SQL은 기존 ID와 관계를 보존한다.
- 관리자 등록·수정은 popku-web 공용 radio 폼이다. 기존 복수 카테고리와 복수 AI 제안은 자동으로 첫 항목을 고르지 않고 관리자 선택을 요구한다. Place 복수 카테고리 필터와 Map 기존 단일 필터 UX는 유지한다.

## 내가 쓴 방문 리뷰

- `GET /api/users/me/reviews?cursor={reviewId}`: Bearer 인증 필수. JWT 사용자 ID로 DB에서 팝업 방문 리뷰만 필터링한다. 클라이언트 userId는 사용하지 않는다.
- 기존 REVIEW item과 `{ items, nextCursor }`를 재사용한다. 팝업 `publicId/title`, 별점·내용·작성일, signed GET 이미지 URL을 포함한다. ID 내림차순, 페이지당 20개이며 마지막 페이지는 `nextCursor: null`이다. 잘못된 커서는 400, 인증 실패는 401이다.
- RN `/profile/reviews`에서 목록·빈 화면·오류·초기/추가 로딩을 구분하고 커서 추가 조회를 지원한다. 기존 방문 리뷰 카드와 팝업 상세 이동 훅(`/places/[id]`)을 재사용한다.

## 내가 쓴 게시글

- `GET /api/users/me/posts?cursor={postId}`: Bearer 인증 필수. JWT `PopkuPrincipal.id`로 DB에서 본인이 작성한 QUESTION/FREE 게시글만 조회한다. 임의의 userId는 사용하지 않으며 방문 리뷰와 다른 카테고리는 제외한다. 기존 실제 삭제 정책을 그대로 적용하며 탈퇴한 사용자의 게시글은 제외한다.
- 응답은 기존 커뮤니티 POST item을 포함한 `{ items, nextCursor }`다. 작성자·본문·작성일·signed 이미지 URL·댓글/좋아요/조회 수·liked를 반환하며 popup/rating/regionName은 null이다. 이미지와 좋아요는 페이지 단위로 일괄 조회한다.
- ID DESC, 페이지당 20개, 다음 페이지는 `id < cursor` 조건으로 조회하며 마지막 페이지는 `nextCursor: null`이다. nextCursor는 게시글 ID 문자열이다. 잘못된 커서는 400, 비로그인 또는 유효하지 않은 JWT는 401이다.
- RN `/profile/posts`는 방문 리뷰 화면의 Header/SafeArea와 스타일 및 기존 CommunityPostItem을 재사용하며 `/community/[id]`로 이동한다. 비로그인은 API 호출 없이 로그인 안내를 표시하고 자동으로 이동하지 않는다. 초기/추가 로딩·빈 목록·오류/재시도와 요청 취소·항목 중복 방지를 지원한다.

## 계정 설정: 닉네임·비밀번호 변경

- 기존 `PATCH /api/users/me/nickname`을 재사용한다. Bearer 인증, `{ nickname }` → `200 { id, email, nickname, profileImageKey, provider, role, createdAt, updatedAt }`. 회원가입과 같은 정규화·2~10자 문자/숫자/밑줄 규칙을 적용한다. 사용자 행을 잠그고, 현재 닉네임과 같으면 UPDATE하지 않는다. 다른 사용자와의 중복 및 DB UNIQUE 충돌은 409, 잘못된 형식은 400이다. 기존 `/api/users/check-nickname` 중복 확인도 재사용한다.
- 새 `PATCH /api/users/me/password`: Bearer 인증, `{ currentPassword, newPassword, confirmPassword }` → `204 No Content`. JWT 본인 LOCAL 계정만 허용한다. 현재 비밀번호 불일치·확인값 불일치·기존 비밀번호 재사용·정책 위반은 400, 소셜 전용 계정은 403, 인증 실패는 401이다. 비밀번호는 회원가입과 같은 공백 없는 ASCII 8~72자 및 영문/숫자 포함 규칙과 기존 PasswordEncoder를 사용한다. 오류 응답은 `{ error: 고정된 오류 사유 }`이고 비밀번호 값은 응답·로그에 포함하지 않는다.
- 비밀번호 변경과 모든 본인 Refresh Token 폐기는 같은 transaction에서 처리한다. 기존 발급/회전/탈퇴와 같은 사용자 행 우선 잠금을 사용한다. RN은 성공 시 요청 당시 generation의 인증 정보만 삭제하고 재로그인을 안내한다. 기존 JWT 즉시 폐기 기능은 없으므로 이미 발급된 Access Token은 만료까지 최대 30분 유효할 수 있다. 기존 로그인/로그아웃/탈퇴 정책은 유지한다.
- RN 설정에서 `/profile/nickname`, `/profile/password`로 진입한다. 비밀번호 메뉴는 `provider === LOCAL`일 때만 표시하며 소셜 계정의 직접 진입도 안내만 표시한다. 회원가입 검증 함수는 `accountPolicy.ts`로 옮겨 공유하며 기존 가입 동작을 유지한다. 변경 화면은 기존 설정 Header/SafeArea와 디자인 토큰을 사용하고 키보드 회피·스크롤·중복 저장 방지·요청 취소를 지원한다. 비밀번호 draft는 화면 이탈·세션 변경·성공 시 지운다.
- 닉네임 저장 응답을 generation 확인 후 기존 setAuthUser에 반영하여 마이페이지와 현재 닉네임을 갱신한다. 게시글·댓글·방문 리뷰의 작성자는 기존 users JOIN을 사용하므로 재조회 시 새 닉네임을 반환한다. 해당 API 구조는 변경하지 않는다.

## iOS Apple 로그인

- iOS에서 Apple 인증이 사용 가능한 경우 Google 버튼 아래 공식 AppleAuthenticationButton을 표시한다. Android/Web에서는 Apple 인증을 호출하지 않는다.
- `POST /api/auth/apple/challenge`는 body 없이 호출하고 `{ challengeId, nonce, expiresInSeconds }`를 받는다. nonce는 해시하지 않고 EMAIL scope와 함께 네이티브 인증에 전달한다.
- `POST /api/auth/apple`에 `{ identityToken, authorizationCode, challengeId, deviceId }`를 보낸다. authorizationCode는 해당 Apple 인증 시도에서 한 번만 전달하고 저장하거나 자동 재사용하지 않는다. null은 백엔드의 구버전 호환 정책에 따라 그대로 전달한다. 기존 회원의 앱 Access/Refresh Token은 기존 useLoginAttempt로 저장하고 `/api/users/me`와 로그인 복귀 처리를 재사용한다.
- `SIGNUP_REQUIRED`의 Apple 가입 토큰은 Google 토큰과 별도의 메모리에 보관하며 URL에 넣지 않는다. 기존 가입 화면의 `mode=apple`에서 닉네임·필수 약관을 받고 `/api/auth/apple/complete`에 `{ signupToken, nickname, consents: { termsOfService, privacyPolicy, marketing }, deviceId }`를 보낸다.
- 인증 취소는 조용히 종료하며 화면 이탈 후 늦은 응답은 로그인 상태를 갱신하지 않는다. 토큰·nonce는 로그에 출력하지 않는다. 실기기 연동은 별도 확인이 필요하다.

## 신고 및 개인 사용자 차단 (RN 9-2)

백엔드 docs/moderation-api.md 및 ModerationRows DTO 계약을 사용한다. 모두 Bearer 인증이며 mutation 자동 재시도는 하지 않는다.

- POST /api/reports: { targetType: POST|COMMENT|REVIEW, targetId, reason: SPAM|ABUSE|SEXUAL|PRIVACY|OTHER, detail?: string }. 설명은 trim 전 200 Unicode 문자 이하. 201 { id, status: PENDING }, 중복 409. RN은 단일 사유를 보내며 작성자/신고자 ID를 보내지 않는다.
- POST /api/users/me/blocks: { targetType, targetId }. 서버가 작성자를 조회한다. 201 빈 본문, 중복 409.
- GET /api/users/me/blocks?limit=20&cursor=...: { items: [{ blockedUserId, nickname, avatarUrl, createdAt }], nextCursor: string|null }. cursor는 opaque 값으로 그대로 인코딩한다.
- DELETE /api/users/me/blocks/{blockedUserId}: 204 빈 본문. 본인 차단 관계만 해제한다.
- 400 잘못된 입력/본인 대상, 401 인증 필요, 404 삭제되거나 사용할 수 없는 대상, 409 중복. 일반 사용자 신고 기록 조회 API는 없다.
- 댓글 응답 isBlocked=true는 ID/부모 관계를 보존한다. RN은 서버의 placeholder 본문 대신 해당 언어 안내를 표시하고 작성자/멘션/액션을 숨긴다. 정상 답글은 제거하지 않는다. REVIEW 댓글 UI는 기존 결정대로 상세에서 노출하지 않으며 공용 API/컴포넌트에서 호환된다.
- moderationState revision + 인증 세대 검사, 기존 AbortController/read-version 보호로 차단 전 GET을 무효화한다. 차단/해제 후 관련 목록은 첫 페이지부터, 상세/댓글은 해당 ID로 재조회한다. 전체 평점/리뷰 수 집계는 개인 차단과 독립적이다.
