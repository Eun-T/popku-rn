# POPKU 한국어·일본어 i18n Audit

> 진단일: 2026-10-08 · 대상: `C:\dev\popku-rn` 현재 작업 트리 · 읽기 전용 정적 감사.
> 기존 `docs/I18N_AUDIT.md`는 없음을 확인하여 새로 작성했다. TS/TSX/JS·번역 JSON·설정·테스트·패키지는 수정하지 않았다. 기기·시뮬레이터·실제 API 호출은 수행하지 않았다. 번역 JSON 존재를 실제 적용 완료로 취급하지 않는다.
> 줄 번호는 진단 당시 기준. 표의 번역 제안은 **미구현 제안**이고 정책/브랜딩 용어는 확정 번역이 아니다.

## 1. 현재 i18n 아키텍처

**한국어·일본어 동시 출시 기준으로 현재 적용은 미완료다.** 특히 실제 언어가 ko로 고정되어 일본어 UI를 선택할 수 없고, 일본어 리소스와 실제 화면 호출 연결에도 큰 공백이 있다.

| 최종 집계 | 값·정의 |
| --- | --- |
| 조사한 사용자 화면 | **28개 native route**, 작성/수정은 같은 route의 두 mode. 공통 컴포넌트·hooks·lib·policy·native 권한 추가 조사 |
| 번역 키 | **ko169 / ja165**, 합집합169개. 문자열 leaf만 계산; `common:{}`는0, `_label`은 문자열1개 |
| 일본어 누락 | **117개 = 키 부재4 + 빈 값113**. 코드에서 없는 ko 키를 쓰는 문제와 다름 |
| 번역 호출 | **t call site107개**; 조건/동적 key 경로까지 추적한 사용 가능 key107개. 숫자가 우연히 같으며 같은 의미가 아님 |
| 하드코딩 UI 문구 | **636건 = B74 + C562**. §4에 전부 ID로 기록; 정책 콘텐츠120건·native 권한2건 포함 |
| 미사용 번역 키 | **62개**. 단순 검색이 아니라 활성 경로/유한 동적 key/상수 소비를 추적한 뒤 분류(§6) |
| 현재 사용 가능107개 중 JA 공백 | **60개 = 부재4 + 빈 값56**; 비어 있지 않은47개도 일본어 UI가 실제 실행됐다는 뜻은 아님 |
| 검사 | TypeScript 통과. 관련5개 기존 test 파일: **41건 중36통과/5실패**; mock/init 실패(§13) |

**집계 방법:** 기존 TypeScript parser로 메모리에서 구문·번역 call/조건 분기·JSON leaf/placeholder를 확인한 뒤 실제 소비 경로를 읽었다. 검증 스크립트 파일·새 테스트·도구를 추가하지 않았다. 한글 문자열765개 후보 중 내부 값·타입·비교·비노출 정의131개를 제외했다. 확인한 native 권한2개와 UI로 노출 가능한 영문 오류1개를 추가하고 같은 `파일+행+문구` 중복1개를 합쳐636건으로 집계했다. template 내부 variant는 문장 row에서 함께 검토했다. 주석·로그·경로·테스트 설명·POPKU/Google Maps 등 고유 브랜드·단순 기호/숫자 예시는 대상이 아니다. 따라서 숫자는 화면 문장 수나 필요한 신규 key 수가 아니라 **감사에서 확인한 소스 위치 단위 문구 수**다.

### 현재 구현 / 미구현

| 항목 | 현재 상태 | 코드 근거 |
| --- | --- | --- |
| i18n 라이브러리 | 제3자 번역 라이브러리 없이 자체 lookup/interpolation | `src/locales/index.ts:1–35`; `package.json:5–49` |
| 파일 | ko.json·ja.json 정적 import | `src/locales/index.ts:1–2` |
| 지원 언어 타입 | `'ko' &#124; 'ja'`; system preference 타입 없음 | `src/locales/index.ts:4` |
| 기본·현재 언어 | defaultLocale=ko, **currentLocale=const ko** | `src/locales/index.ts:6–8` |
| fallback | 현재 dictionary의 없는/blank 값→ko→key 자체 | `src/locales/index.ts:11–31` |
| 번역 함수 | `t(key:string, params?)`; dots path; object면 _label; {word} 단순 치환 | `src/locales/index.ts:11–35` |
| 번역 Hook/Provider | 없음. 화면이 직접 t/getLocale import | `src/app/_layout.tsx:1–43`, `src/app/places/[id].tsx:78,178` |
| 변경 API·UI | setLocale/설정 메뉴 없음; immutable const | `src/locales/index.ts:7`, `src/app/(tabs)/profile/settings.tsx:61–114` |
| 저장 | 언어 preference 저장/복원 없음 | locale/settings/root 경로. AsyncStorage 의존·호출 없음 |
| SecureStore | 설치·인증 tokens 용도로 사용, locale 저장은 아님 | `package.json:23`, `src/lib/auth.ts:156–238` |
| 시스템 감지 | expo-localization 설치/사용 없음; 기기 언어 read 경로 없음 | package·locale/root·AppState 사용처 확인 |
| 앱 시작 | import 시 즉시ko; locale hydration/준비 gate 없음 | `src/locales/index.ts:6–9`, `src/app/_layout.tsx:5–43` |
| locale 반응성 | subscribeLocale 없음. getLocale 값을 read할 뿐 변경 구독 안 함 | `useHomeMainBanners.ts:37–50`, `places/[id].tsx:178,259` |
| plural/date/number | t 자체에는 plural rule·Intl formatter 없음 | `src/locales/index.ts:28–35` |
| 추가 중요점 | statusOptions를 module load 때 t로 생성 | `src/components/place/PlaceFilterSheet.tsx:74–78`; 향후 locale state만 추가해도 이 label들은 갱신 안 됨 |

```text
현재: JSON static import → const currentLocale=ko → 화면의 t(key)
→ ko 문자열 또는 _label → params replace → UI

서버 locale 연계:
getLocale()=ko → banner GET(languageCode)
             → popup detail GET(languageCode)
             → place autocomplete POST(languageCode)
→ 서버 응답 state/cache → UI
```

현재 기능은 'ko lookup·fallback·일부 번역 호출'이고 'ko/ja/system 설정·영속화·기기 언어 반응·앱 전체 일본어 적용'은 미구현이다. `app.json userInterfaceStyle=automatic`은 테마 설정이며 언어 system mode를 의미하지 않는다.

## 2. 한국어/일본어 리소스 비교

| namespace | ko leaf / 빈 값 | ja leaf / 빈 값 | 실제 또는 보수적 사용 가능 key | 판단 |
| --- | ---: | ---: | ---: | --- |
| common | 0 /0 | 0 /0 | 0 | 공통 버튼·상태가 코드와 다른 namespace에 분산 |
| home | 1 /0 | 1 /1 | 0 | home.title은 JSON만; 실제 home 섹션은 하드코딩 |
| place | 112 /0 | 110 /83 | 65 | 상세 일부만 JA 충실; 탐색/필터 등 빈 값 다수 |
| map | 1 /0 | 1 /1 | 0 | 지도 화면 UI 번역 호출 없음 |
| community | 54 /0 | 52 /27 | 42 | 일부 write/edit/detail만 비어 있지 않음 |
| my | 1 /0 | 1 /1 | 0 | MyPage/auth/settings/inquiries 전체를 커버하지 않음 |
| 합계 | **169 /0** | **165 /113** | **107** | 동일 key 존재는 완료 판정 근거가 아님 |

| 검사 | 결과 | 영향 |
| --- | --- | --- |
| ko-only |4: interests, interestsDescription, category.free, reviewFilterLabel | 전부 실제 t 경로 있음. 일본어 활성화 시ko fallback |
| ja-only |0 | 역방향 orphan 없음 |
| blank ko |0 | whitespace 포함 empty 검사 |
| blank ja |113 | t가 ko fallback하여 누락을 눈으로 놓치기 쉬움 |
| 비어 있지 않은 ja에 한글 잔존 |0 | 번역 품질/화면 적용 전체 완료와 다른 지표 |
| JSON syntax·중복 property | 유효·중복0 | parse 전 원본 object도 확인. JSON.parse가 duplicate를 가리는 문제와 구분 |
| string 아닌 leaf·구조 충돌 | 발견 없음 | _label object는 t가 의도적으로 지원; 누락4를 잘못된 nesting으로 오진하지 않음 |
| 최대 key 깊이 |4 segments | 현재 깊이가 주요 병목은 아님 |
| placeholder raw 불일치 |9개, 모두 ja blank 때문에 변수0개 | nonempty KO/JA 쌍의 이름·중복횟수 불일치는0; §7 |
| ko에서 없는 실제 key |0(추적한 literal/조건/유한 dynamic 입력) | API의 계약 밖 category/error reason·미래 변경까지 보장하는 결과는 아님 |

같은 KO value가 반복된 묶음은5개다. 혜택(detail/quick), 최신순(place/community), 인기순(place/community), 종료(all/status)에는 공통 재사용 후보가 있다. **{date} 오픈**은 예약 오픈과 팝업 오픈이라는 다른 문맥이므로 단순 value dedup으로 합치면 의미를 잃을 수 있다. 동일 키 이름이 다른 namespace에 있는 것 자체는 오류가 아니다. 근거: `src/locales/ko.json`의 대응 키 및 §5/§6 줄 번호.

## 3. 화면별 번역 적용 현황

분류: **A**=실제 t/번역 소비 연결, **B**=적합한 기존 key 후보가 있지만 화면은 literal, **C**=노출 문구에 대응하는 완전한 key 없음, **D**=active 소비를 찾지 못한 resource, **E**=서버/SDK 제공 문자열, **F**=사용자 작성 데이터, **G**=현재 미노출 mock/개발용 정의. 같은 화면은 여러 분류를 가진다. D는 key 기준, B/C는 화면 문구 기준이므로 합산하지 않는다.

### 3.1 28개 native route

| # | 사용자 화면 | route / 줄 | 실제 렌더 경로 / 근거 | 적용 상태 |
| --- | --- | --- | --- | --- |
| 1 | 홈 | `src/app/(tabs)/index.tsx:1` | `src/screens/HomeScreen.tsx:13–22`; `src/components/home/HomeTrendingSection.tsx:17–103`; `HomeNewPopupSection.tsx:16–98` | B/C. 섹션·설명·국가·더보기·empty는 하드코딩. 배너/팝업명은 E. home.title은 탭 title에 하드코딩된 값과 같지만 t 호출 없음. |
| 2 | 플레이스 | `src/app/(tabs)/places/index.tsx:1` | `src/screens/PlaceScreen.tsx:43–49,257–258,392–559`; `src/components/place/PlaceFilterSheet.tsx:189–252` | A+B/C. quick/기간/상태/지역 배너 일부 t, header·탐색/전체·검색·sheet section header·카드 상태는 하드코딩. 정렬/행사유형 UI는 현재 미노출; custom 날짜 선택은 disabled. |
| 3 | 지도(native) | `src/app/(tabs)/map.tsx:1` | `src/screens/MapScreen.native.tsx:92–103,304–346,824–917`; `src/components/map/MapSearchOverlay.tsx:62–89`; `MapPopupListSheet.tsx:127–134` | B/C+E. UI 번역 t 없음. 장소 추천 요청만 languageCode 전달. 마커 tag/name은 서버·내부 Korean label 연계; 별도 사용자용 marker accessibilityLabel 미발견. |
| 4 | 커뮤니티 목록 | `src/app/(tabs)/community.tsx:1` | `src/screens/CommunityScreen.tsx:273–434`; `src/components/community/CommunityPostItem.tsx:77–372` | A+B/C+E/F. 제목·category·조회 t. likes·사진a11y·empty/retry·Alert는 혼합. sort는 LATEST state 고정, 번역 sort selector 없음. |
| 5 | 마이페이지 | `src/app/(tabs)/profile/index.tsx:64` | `src/app/(tabs)/profile/index.tsx:107–254` | B/C+F. 제목·활동·서비스 메뉴·로그인 안내·loading/a11y 하드코딩; nickname/email은 사용자 데이터. |
| 6 | 찜한 팝업 | `src/app/(tabs)/profile/favorites.tsx:27` | `src/app/(tabs)/profile/favorites.tsx:61–93` | B/C+E. 제목·오류·빈 안내·card a11y·찜됨 하드코딩. |
| 7 | 내가 쓴 게시글 | `src/app/(tabs)/profile/posts.tsx:16` | `src/app/(tabs)/profile/posts.tsx:82–114`; `CommunityPostItem.tsx` | B/C 중심, 공통 card의 category는 A. 목록 제목·login/error/loading/empty·more 하드코딩; 본문 F. |
| 8 | 내가 쓴 방문 리뷰 | `src/app/(tabs)/profile/reviews.tsx:16` | `src/app/(tabs)/profile/reviews.tsx:77–103`; `CommunityPostItem.tsx` | B/C 중심, 공통 review label A. 목록 제목·빈/오류·more·loading 하드코딩. |
| 9 | 설정 | `src/app/(tabs)/profile/settings.tsx:18` | `src/app/(tabs)/profile/settings.tsx:40–114` | B/C. 계정·nickname/password·logout/탈퇴/login 하드코딩. 언어 설정 항목 없음. |
| 10 | 닉네임 변경 | `src/app/(tabs)/profile/nickname.tsx:4` | `src/components/profile/AccountSettingsScreen.tsx:35,69–84,119–148`; `src/lib/accountSettings.ts:54–62` | B/C. validation·완료·error·저장·a11y 전부 번역 호출 없음. |
| 11 | 비밀번호 변경 | `src/app/(tabs)/profile/password.tsx:4` | `src/components/profile/AccountSettingsScreen.tsx:24,35,95–148`; `src/lib/accountPolicy.ts:15–18` | B/C. password visibility template·rules·success/relogin·save 하드코딩. |
| 12 | 회원탈퇴 | `src/app/(tabs)/profile/withdrawal.tsx:17` | `src/app/(tabs)/profile/withdrawal.tsx:11–14,46–95` | B/C. 정책 안내·확인Alert·처리중·오류·local cleanup 하드코딩. |
| 13 | 로그인 | `src/app/(tabs)/profile/login.tsx:11` | `src/app/(tabs)/profile/login.tsx:27–174`; `src/lib/auth.ts:87,116,121`; `src/lib/googleAuth.ts:18,29,93,118` | B/C. form/Google/validation/error/a11y 하드코딩. Error.message 원문 노출 가능. |
| 14 | 회원가입 | `src/app/(tabs)/profile/signup.tsx:120` | `src/app/(tabs)/profile/signup.tsx:51,63–117,465–638` | B/C. email/code/password/nickname/consent/submit 및 오류. 약관 자세히 보기 handler는 stub(:281), 실제 링크 동작 미연결. |
| 15 | 문의 목록 | `src/app/(tabs)/profile/inquiries/index.tsx:15` | `src/app/(tabs)/profile/inquiries/index.tsx:44–63`; `src/lib/inquiries.ts:4–7`; `InquiryLayout.tsx:13` | B/C+F/E. type/status labels·auth/empty/loading/error·write action 하드코딩. |
| 16 | 문의 작성 | `src/app/(tabs)/profile/inquiries/write.tsx:9` | `src/app/(tabs)/profile/inquiries/write.tsx:21–35`; `InquiryLayout.tsx:13` | B/C. 제목·유형·내용·placeholder·submit·auth/retry/error, 내용 자체 F. |
| 17 | 문의 상세 | `src/app/(tabs)/profile/inquiries/[id].tsx:8` | `src/app/(tabs)/profile/inquiries/[id].tsx:17–26`; `InquiryLayout.tsx:13` | B/C+F/E. 문의/답변 header·empty/status 하드코딩. 내 제목/본문 F, 운영자 답변 E. |
| 18 | 공지 목록 | `src/app/(tabs)/profile/notices/index.tsx:8` | `src/app/(tabs)/profile/notices/index.tsx:25–29`; `src/lib/notices.ts:3`; `NoticeLayout.tsx:12–13` | B/C+E. loading/empty/error/more/category 하드코딩; 공지 제목 E. |
| 19 | 공지 상세 | `src/app/(tabs)/profile/notices/[id].tsx:8` | `src/app/(tabs)/profile/notices/[id].tsx:16–18`; `NoticeLayout.tsx:12–13` | B/C+E. 오류·missing·retry/heading 하드코딩, 공지 본문 E. |
| 20 | 게시글 상세 | `src/app/community/[id].tsx:49` | `src/app/community/[id].tsx:127–168,232–354`; `CommunityComments.tsx` | A+B/C+F. 삭제/수정Alert·header/error/category/view t. 좋아요·댓글/대댓글/메뉴/입력/Alert 하드코딩. |
| 21 | 게시글 작성/수정 | `src/app/community/write.tsx:20` | `src/app/community/write.tsx:104–258` | A 중심. 제목·본문·placeholder·첨부·삭제a11y·register/edit/실패·unknown outcome 안내 t. F=작성 본문. JA category.free는 없고 write 기본키 일부 빈 값. |
| 22 | 팝업 상세 | `src/app/places/[id].tsx:175` | `src/app/places/[id].tsx:121–137,371,401–828`; `src/components/place/PopupReviews.tsx:93–114` | A+B/C+E/F. 기본info·예약·소개/highlights·공식채널/공지혜택 t. 정보/리뷰tab·favorite·share·별점/후기count·위치/map/제보·리뷰empty 하드코딩. 주소복사 key는 있으나 UI/a11y t 사용 없음. |
| 23 | 약관/정책 목록 | `src/app/profile/policies/index.tsx:16` | `src/app/profile/policies/index.tsx:22–27`; `src/content/policies.ts:19,122,190` | B/C. 뒤로가기·목록 제목 및 세 정책명 하드코딩. |
| 24 | 이용약관 | `src/app/profile/policies/terms.tsx:5` | `src/components/profile/PolicyDetailScreen.tsx:16–35`; `src/content/policies.ts:15–117` | B/C. 본문은 서버/사용자 글이 아닌 앱 소유 한국어 콘텐츠. JA 버전 없음; 시행일 추후 확정 표시. |
| 25 | 개인정보처리방침 | `src/app/profile/policies/privacy.tsx:5` | `PolicyDetailScreen.tsx:16–35`; `src/content/policies.ts:122–185` | B/C. 전체 KO policy data를 직접 렌더. JA 버전 없음. |
| 26 | 위치기반서비스 약관 | `src/app/profile/policies/location.tsx:5` | `PolicyDetailScreen.tsx:16–35`; `src/content/policies.ts:190–234`; `app.json:14` | B/C. 본문 및 iOS 위치 권한 설명 한국어; system dialog는 JS t 밖. |
| 27 | 방문 리뷰 작성/수정 | `src/app/reviews/write.tsx:24` | `src/app/reviews/write.tsx:70,96–144` | A 일부(imageError), 나머지B/C. 별점·본문·submit·사진·unknown outcome·오류·a11y 하드코딩. |
| 28 | 방문 리뷰 상세 | `src/app/reviews/[id].tsx:50` | `src/app/reviews/[id].tsx:173–397`; `CommunityComments.tsx` | A 일부(cancel/delete/retry/image/label), 나머지B/C. 실제 header/delete title/review menu/like/error 하드코딩. |

추가 조사: FloatingTabBar는 `src/app/(tabs)/_layout.tsx:13–17`의 **하드코딩 title**을 읽어 접근성 label로 사용한다(`src/components/navigation/FloatingTabBar.tsx:408–415`). native 위치/사진 권한은 `app.json:14,52`의 KO 문구다. `MapScreen.web.tsx:8` 안내·`HomeQuickMenu.tsx:26–32`·`PlaceholderTabScreen.tsx:10`·`placePopupMocks.ts:153–180`도 확인했으나 native 활성28 route/636건 집계에서는 제외했다. HomeQuickMenu와 legacy popup mock의 active import는 발견하지 못했으며, 파일명에 Mocks가 있는 **placeRegionMocks는 실제 사용 중**이어서 제외하지 않았다.

### 3.2 A: 실제 key 소비 근거

다음107개는 실제 호출 또는 현재 선언된 유한 입력에서 호출될 수 있는 key다. **일본어 화면 완료율이 아니다.** code location이 lookup 데이터 정의이면 화살표 뒤 실제 UI t 호출까지 확인했다. `community.category.review`는 generic FeedItem.category 타입에서 사용할 수 있어 보수적으로 사용 집합에 포함했지만, 정상 REVIEW UI는 reviewFilterLabel을 쓰므로 해당 key가 현재 일반 사용자 시나리오에 노출된다고 확정하지 않는다.

| key | KO 원문 / resource 줄 | 실제 호출·데이터 경로 | JA 상태 |
| --- | --- | --- | --- |
| `community.attachImage` | 이미지 첨부<br>`src/locales/ko.json:189` | src/app/community/write.tsx:239; src/app/community/write.tsx:246 | 빈 값→KO fallback |
| `community.cancel` | 취소<br>`src/locales/ko.json:157` | src/app/community/[id].tsx:161; src/app/reviews/[id].tsx:215; src/components/community/CommunityPostMenu.tsx:61 | nonempty (UI locale는 현재KO) |
| `community.category.all` | 전체<br>`src/locales/ko.json:199` | src/screens/CommunityScreen.tsx:407 | 빈 값→KO fallback |
| `community.category.free` | 자유<br>`src/locales/ko.json:203` | src/screens/CommunityScreen.tsx:407; src/app/community/write.tsx:195 | 키 없음 |
| `community.category.question` | 질문<br>`src/locales/ko.json:202` | src/screens/CommunityScreen.tsx:407; src/app/community/write.tsx:195; src/app/community/[id].tsx:302 | 빈 값→KO fallback |
| `community.category.review` | 방문 후기<br>`src/locales/ko.json:200` | src/components/community/CommunityPostItem.tsx:228 (선언된 FeedItem.category 타입에 REVIEW 포함; 일반 REVIEW UI는 별도 label) | 빈 값→KO fallback |
| `community.delete.action` | 삭제하기<br>`src/locales/ko.json:167` | src/components/community/CommunityPostMenu.tsx:76 | nonempty (UI locale는 현재KO) |
| `community.delete.confirm` | 삭제<br>`src/locales/ko.json:170` | src/app/community/[id].tsx:168; src/app/reviews/[id].tsx:222 | nonempty (UI locale는 현재KO) |
| `community.delete.failed` | 게시글을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.<br>`src/locales/ko.json:171` | src/app/community/[id].tsx:146 | nonempty (UI locale는 현재KO) |
| `community.delete.message` | 삭제한 게시글은 되돌릴 수 없습니다.<br>`src/locales/ko.json:169` | src/app/community/[id].tsx:158; src/app/reviews/[id].tsx:212 | nonempty (UI locale는 현재KO) |
| `community.delete.title` | 게시글을 삭제할까요?<br>`src/locales/ko.json:168` | src/app/community/[id].tsx:157 | nonempty (UI locale는 현재KO) |
| `community.detail.failed` | 게시글을 불러오지 못했어요.<br>`src/locales/ko.json:176` | src/app/community/[id].tsx:272 | nonempty (UI locale는 현재KO) |
| `community.detail.image` | {index}번째 게시글 이미지<br>`src/locales/ko.json:178` | src/components/community/CommunityImageCarousel.tsx:31 | nonempty (UI locale는 현재KO) |
| `community.detail.missing` | 게시글을 찾을 수 없어요.<br>`src/locales/ko.json:175` | src/app/community/[id].tsx:272 | nonempty (UI locale는 현재KO) |
| `community.detail.retry` | 다시 시도<br>`src/locales/ko.json:177` | src/app/community/[id].tsx:281; src/app/reviews/[id].tsx:296 | nonempty (UI locale는 현재KO) |
| `community.detail.title` | 게시글<br>`src/locales/ko.json:174` | src/app/community/[id].tsx:243 | nonempty (UI locale는 현재KO) |
| `community.edit.action` | 수정하기<br>`src/locales/ko.json:160` | src/components/community/CommunityPostMenu.tsx:70 | nonempty (UI locale는 현재KO) |
| `community.edit.confirmRetry` | 수정 완료 여부를 확인하지 못했어요. 수정 완료를 다시 누르면 같은 요청으로 확인합니다.<br>`src/locales/ko.json:164` | src/app/community/write.tsx:214 | nonempty (UI locale는 현재KO) |
| `community.edit.failed` | 게시글을 수정하지 못했어요. 잠시 후 다시 시도해 주세요.<br>`src/locales/ko.json:162` | src/app/community/write.tsx:213; src/app/community/[id].tsx:127 | nonempty (UI locale는 현재KO) |
| `community.edit.loadFailed` | 수정할 게시글을 불러오지 못했어요. 눌러서 다시 시도해 주세요.<br>`src/locales/ko.json:163` | src/app/community/write.tsx:180 | nonempty (UI locale는 현재KO) |
| `community.edit.save` | 수정 완료<br>`src/locales/ko.json:161` | src/app/community/write.tsx:250; src/app/community/write.tsx:258 | nonempty (UI locale는 현재KO) |
| `community.edit.title` | 게시글 수정<br>`src/locales/ko.json:159` | src/app/community/write.tsx:169 | nonempty (UI locale는 현재KO) |
| `community.imageConfirmRetry` | 등록 완료 여부를 확인하지 못했어요. 등록을 다시 누르면 같은 요청을 확인하며 중복 작성하지 않습니다.<br>`src/locales/ko.json:191` | src/app/community/write.tsx:214 | nonempty (UI locale는 현재KO) |
| `community.imageError.conversion` | 이미지를 준비하지 못했어요. 다른 사진을 선택하거나 다시 시도해 주세요.<br>`src/locales/ko.json:195` | src/app/community/write.tsx:104; src/app/community/write.tsx:111; src/app/reviews/write.tsx:70 | nonempty (UI locale는 현재KO) |
| `community.imageError.limit` | 이미지는 최대 5장까지 첨부할 수 있어요.<br>`src/locales/ko.json:194` | src/app/community/write.tsx:111; src/app/reviews/write.tsx:70 | nonempty (UI locale는 현재KO) |
| `community.imageError.permission` | 사진 접근 권한이 필요해요. 설정에서 사진 접근을 허용해 주세요.<br>`src/locales/ko.json:193` | src/app/community/write.tsx:111; src/app/reviews/write.tsx:70 | nonempty (UI locale는 현재KO) |
| `community.postMenu` | 게시글 메뉴<br>`src/locales/ko.json:156` | src/app/community/[id].tsx:247 | nonempty (UI locale는 현재KO) |
| `community.register` | 등록하기<br>`src/locales/ko.json:184` | src/app/community/write.tsx:250; src/app/community/write.tsx:258 | 빈 값→KO fallback |
| `community.registering` | 등록 중<br>`src/locales/ko.json:185` | src/app/community/write.tsx:250 | 빈 값→KO fallback |
| `community.removeImage` | {index}번째 이미지 삭제<br>`src/locales/ko.json:190` | src/app/community/write.tsx:229 | nonempty (UI locale는 현재KO) |
| `community.reviewFilterLabel` | 방문 리뷰<br>`src/locales/ko.json:205` | src/app/reviews/[id].tsx:305; src/components/community/CommunityPostItem.tsx:126; src/screens/CommunityScreen.tsx:406 | 키 없음 |
| `community.settings` | 설정<br>`src/locales/ko.json:181` | src/screens/CommunityScreen.tsx:275 | 빈 값→KO fallback |
| `community.time.daysAgo` | {count}일 전<br>`src/locales/ko.json:213` | src/lib/communityTime.ts:8 | 빈 값→KO fallback |
| `community.time.hoursAgo` | {count}시간 전<br>`src/locales/ko.json:212` | src/lib/communityTime.ts:7 | 빈 값→KO fallback |
| `community.time.minutesAgo` | {count}분 전<br>`src/locales/ko.json:211` | src/lib/communityTime.ts:6 | 빈 값→KO fallback |
| `community.title` | 커뮤니티<br>`src/locales/ko.json:180` | src/screens/CommunityScreen.tsx:273 | 빈 값→KO fallback |
| `community.views` | 조회 {count}<br>`src/locales/ko.json:197` | src/app/community/[id].tsx:336; src/components/community/CommunityPostItem.tsx:372 | 빈 값→KO fallback |
| `community.write` | 글쓰기<br>`src/locales/ko.json:182` | src/screens/CommunityScreen.tsx:429; src/screens/CommunityScreen.tsx:434; src/app/community/write.tsx:169 | 빈 값→KO fallback |
| `community.writeBack` | 뒤로가기<br>`src/locales/ko.json:183` | src/app/community/write.tsx:162; src/app/community/[id].tsx:232; src/app/reviews/[id].tsx:242 | 빈 값→KO fallback |
| `community.writeContent` | 본문<br>`src/locales/ko.json:187` | src/app/community/write.tsx:203 | 빈 값→KO fallback |
| `community.writeFailed` | 게시글 등록에 실패했어요. 잠시 후 다시 시도해 주세요.<br>`src/locales/ko.json:186` | src/app/community/write.tsx:213 | 빈 값→KO fallback |
| `community.writePlaceholder` | 내용을 입력해 주세요.<br>`src/locales/ko.json:188` | src/app/community/write.tsx:207 | 빈 값→KO fallback |
| `place.all.addFavorite` | 찜하기<br>`src/locales/ko.json:69` | src/components/place/PopupGridCard.tsx:79 | 빈 값→KO fallback |
| `place.all.period.all` | 기간 전체<br>`src/locales/ko.json:60` | src/components/place/PlaceFilterSheet.tsx:243; AppliedFilterBar.tsx:52 (custom 비활성 표시) | 빈 값→KO fallback |
| `place.all.period.custom` | 날짜 직접 선택<br>`src/locales/ko.json:64` | src/components/place/PlaceFilterSheet.tsx:243; AppliedFilterBar.tsx:52 (custom 비활성 표시) | 빈 값→KO fallback |
| `place.all.period.today` | 오늘<br>`src/locales/ko.json:61` | src/components/place/PlaceFilterSheet.tsx:243; AppliedFilterBar.tsx:52 (custom 비활성 표시) | 빈 값→KO fallback |
| `place.all.period.week` | 이번 주<br>`src/locales/ko.json:62` | src/components/place/PlaceFilterSheet.tsx:243; AppliedFilterBar.tsx:52 (custom 비활성 표시) | 빈 값→KO fallback |
| `place.all.period.weekend` | 이번 주말<br>`src/locales/ko.json:63` | src/components/place/PlaceFilterSheet.tsx:243; AppliedFilterBar.tsx:52 (custom 비활성 표시) | 빈 값→KO fallback |
| `place.all.removeFavorite` | 찜 해제<br>`src/locales/ko.json:70` | src/components/place/PopupGridCard.tsx:78 | 빈 값→KO fallback |
| `place.detail.about` | 팝업 소개<br>`src/locales/ko.json:9` | src/app/places/[id].tsx:665 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.addressPending` | 주소 정보 준비 중<br>`src/locales/ko.json:28` | src/app/places/[id].tsx:589 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.pending` | 정보 준비 중<br>`src/locales/ko.json:27` | src/app/places/[id].tsx:554; src/app/places/[id].tsx:568 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.period` | 기간<br>`src/locales/ko.json:17` | src/app/places/[id].tsx:550 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.place` | 장소<br>`src/locales/ko.json:19` | src/app/places/[id].tsx:573 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.reservation` | 예약<br>`src/locales/ko.json:20` | src/app/places/[id].tsx:607 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.reservationEnd` | {date} 마감<br>`src/locales/ko.json:25` | src/app/places/[id].tsx:405 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.reservationStart` | {date} 오픈<br>`src/locales/ko.json:24` | src/app/places/[id].tsx:401 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.reserve` | 예약하기<br>`src/locales/ko.json:23` | src/app/places/[id].tsx:597; src/app/places/[id].tsx:620 | nonempty (UI locale는 현재KO) |
| `place.detail.basicInfo.time` | 시간<br>`src/locales/ko.json:18` | src/app/places/[id].tsx:559 | nonempty (UI locale는 현재KO) |
| `place.detail.benefits` | 혜택<br>`src/locales/ko.json:10` | src/lib/popupGuidance.ts:23 → src/components/place/PopupGuidanceCarousel.tsx:44 | nonempty (UI locale는 현재KO) |
| `place.detail.channelOpenError` | 링크를 열지 못했어요. 잠시 후 다시 시도해 주세요.<br>`src/locales/ko.json:15` | src/app/places/[id].tsx:600; src/app/places/[id].tsx:774 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.EXPERIENCE` | 무엇을 체험할 수 있어요?<br>`src/locales/ko.json:35` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.FOOD` | 무엇을 맛볼 수 있어요?<br>`src/locales/ko.json:36` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.GOODS` | 어떤 굿즈가 있어요?<br>`src/locales/ko.json:32` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.HIGHLIGHT` | 놓치면 아쉬운 건?<br>`src/locales/ko.json:38` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.PRODUCTS` | 무엇을 만나볼 수 있어요?<br>`src/locales/ko.json:33` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.SPACE` | 어떤 공간이에요?<br>`src/locales/ko.json:37` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.SPECIAL` | 뭐가 특별해요?<br>`src/locales/ko.json:31` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.highlights.VIEW` | 무엇을 볼 수 있어요?<br>`src/locales/ko.json:34` | src/lib/popupDetailContent.ts:5–12 → src/app/places/[id].tsx:705 | nonempty (UI locale는 현재KO) |
| `place.detail.notice` | 공지사항<br>`src/locales/ko.json:11` | src/lib/popupGuidance.ts:16 → src/components/place/PopupGuidanceCarousel.tsx:44 | nonempty (UI locale는 현재KO) |
| `place.detail.officialChannelLink` | {channel} 공식 채널<br>`src/locales/ko.json:14` | src/app/places/[id].tsx:768 | nonempty (UI locale는 현재KO) |
| `place.detail.officialChannels` | 공식 채널<br>`src/locales/ko.json:12` | src/app/places/[id].tsx:756 | nonempty (UI locale는 현재KO) |
| `place.detail.website` | 공식 홈페이지<br>`src/locales/ko.json:13` | src/lib/popupDetailContent.ts:38 → src/app/places/[id].tsx:768 | nonempty (UI locale는 현재KO) |
| `place.explore.back` | 뒤로 가기<br>`src/locales/ko.json:51` | src/app/places/[id].tsx:338; src/app/places/[id].tsx:364; src/app/places/[id].tsx:458 | 빈 값→KO fallback |
| `place.explore.interests` | 취향 따라 찾아볼까요?<br>`src/locales/ko.json:44` | src/components/place/PlaceInterestSection.tsx:48 | 키 없음 |
| `place.explore.interestsDescription` | 좋아하는 취향의 팝업을 골라 둘러보세요.<br>`src/locales/ko.json:45` | src/components/place/PlaceInterestSection.tsx:50 | 키 없음 |
| `place.explore.japaneseRegionsDescription` | 도쿄부터 오사카까지, 일본의 팝업을 만나보세요!<br>`src/locales/ko.json:47` | src/components/place/PlaceRegionSection.tsx:135 | 빈 값→KO fallback |
| `place.explore.koreanRegionsDescription` | 이번 주말, 한국의 핫한 동네로 떠나볼까요?<br>`src/locales/ko.json:46` | src/components/place/PlaceRegionSection.tsx:135 | 빈 값→KO fallback |
| `place.explore.next` | 다음 팝업<br>`src/locales/ko.json:50` | src/components/place/TodayOpeningCarousel.tsx:315 | 빈 값→KO fallback |
| `place.explore.previous` | 이전 팝업<br>`src/locales/ko.json:49` | src/components/place/TodayOpeningCarousel.tsx:305 | 빈 값→KO fallback |
| `place.explore.regions` | 어디로 놀러 갈까!<br>`src/locales/ko.json:43` | src/constants/placeRegionMocks.ts:16 → src/components/place/PlaceRegionSection.tsx:57 | 빈 값→KO fallback |
| `place.filters.close` | 필터 닫기<br>`src/locales/ko.json:140` | src/components/place/PlaceFilterSheet.tsx:176 | 빈 값→KO fallback |
| `place.filters.collapse` | 접기<br>`src/locales/ko.json:144` | src/components/place/RegionFilterGroup.tsx:142 | 빈 값→KO fallback |
| `place.filters.collapseRegions` | 지역 접기<br>`src/locales/ko.json:145` | src/components/place/RegionFilterGroup.tsx:137 | 빈 값→KO fallback |
| `place.filters.countries.jp` | 일본<br>`src/locales/ko.json:83` | src/components/place/QuickFilterBar.tsx:48; PlaceFilterSheet.tsx:191; AppliedFilterBar.tsx:42 | 빈 값→KO fallback |
| `place.filters.countries.kr` | 한국<br>`src/locales/ko.json:82` | src/components/place/QuickFilterBar.tsx:48; PlaceFilterSheet.tsx:191; AppliedFilterBar.tsx:42 | 빈 값→KO fallback |
| `place.filters.details` | 상세 필터<br>`src/locales/ko.json:139` | src/components/place/AppliedFilterBar.tsx:90; src/components/place/QuickFilterBar.tsx:59 | 빈 값→KO fallback |
| `place.filters.interests.animeCharacter` | 캐릭터/IP<br>`src/locales/ko.json:125` | src/components/place/PlaceInterestSection.tsx:54–58 | 빈 값→KO fallback |
| `place.filters.interests.beauty` | 뷰티<br>`src/locales/ko.json:128` | src/components/place/PlaceInterestSection.tsx:54–58 | 빈 값→KO fallback |
| `place.filters.interests.fashion` | 패션<br>`src/locales/ko.json:127` | src/components/place/PlaceInterestSection.tsx:54–58 | 빈 값→KO fallback |
| `place.filters.moreRegions` | 지역 {count}개 더 보기<br>`src/locales/ko.json:146` | src/components/place/RegionFilterGroup.tsx:138 | 빈 값→KO fallback |
| `place.filters.operationStatuses.closed` | 종료<br>`src/locales/ko.json:137` | src/components/place/PlaceFilterSheet.tsx:75–77; AppliedFilterBar.tsx:49 | 빈 값→KO fallback |
| `place.filters.operationStatuses.open` | 운영 중<br>`src/locales/ko.json:135` | src/components/place/PlaceFilterSheet.tsx:75–77; AppliedFilterBar.tsx:49 | 빈 값→KO fallback |
| `place.filters.operationStatuses.upcoming` | 오픈 예정<br>`src/locales/ko.json:136` | src/components/place/PlaceFilterSheet.tsx:75–77; AppliedFilterBar.tsx:49 | 빈 값→KO fallback |
| `place.filters.quick.benefit` | 혜택<br>`src/locales/ko.json:87` | src/components/place/QuickFilterBar.tsx:48; PlaceFilterSheet.tsx:191; AppliedFilterBar.tsx:42 | 빈 값→KO fallback |
| `place.filters.quick.preReservation` | 사전예약<br>`src/locales/ko.json:86` | src/components/place/QuickFilterBar.tsx:48; PlaceFilterSheet.tsx:191; AppliedFilterBar.tsx:42 | 빈 값→KO fallback |
| `place.filters.regions.gangnam` | 강남·서초<br>`src/locales/ko.json:102` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.hongdae` | 홍대·신촌<br>`src/locales/ko.json:100` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.kyoto` | 교토<br>`src/locales/ko.json:117` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.nagoya` | 나고야<br>`src/locales/ko.json:119` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.osaka` | 오사카<br>`src/locales/ko.json:116` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.seongsu` | 성수<br>`src/locales/ko.json:99` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.tokyo` | 도쿄<br>`src/locales/ko.json:115` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.regions.yeouido` | 여의도<br>`src/locales/ko.json:101` | src/constants/placeRegionMocks.ts:18–49 → src/components/place/PlaceRegionSection.tsx:114–121; src/screens/PlaceScreen.tsx:277 | 빈 값→KO fallback |
| `place.filters.remove` | {label} 필터 삭제<br>`src/locales/ko.json:147` | src/components/place/AppliedFilterBar.tsx:76 | 빈 값→KO fallback |
| `place.filters.reset` | 초기화<br>`src/locales/ko.json:141` | src/components/place/AppliedFilterBar.tsx:61; src/components/place/PlaceFilterSheet.tsx:259 | 빈 값→KO fallback |
| `place.filters.showPopups` | 팝업 보기<br>`src/locales/ko.json:143` | src/components/place/PlaceFilterSheet.tsx:262 | 빈 값→KO fallback |

### 3.3 E/F/G: 번역 누락으로 오진하지 않을 데이터

| 분류 | 실제 데이터·경로 | 필요한 조치 |
| --- | --- | --- |
| E | popup name·주소·region/tag(`PopupGridCard.tsx:55–58`, `MapSearchOverlay.tsx:100–105`); API 상세 summary/highlights/notice/benefits(`places/[id].tsx:665–717`); banner(`HomeBanner.tsx:181`) | 번역 key로 임의치환 안 함. API별 languageCode/서버 fallback 계약 확인(§9) |
| E | 운영자 공지 제목/본문, 문의 답변(`profile/notices/[id].tsx`, `profile/inquiries/[id].tsx:26`) | 서버 다국어 콘텐츠 계약 확인; 고정 caption은B/C |
| F | 게시글/댓글/리뷰/문의 본문·nickname(`CommunityPostItem.tsx:83–95`, `CommunityComments.tsx:393–410`) | 원문 유지; 문장틀·버튼·단위만 번역. 자동 사용자글 번역은 현재 요구가 아님 |
| G | 13개 mock JSON key(`place.all.mock.*`6개, `community.mock.*`7개); legacy PopupMocks | 활성 UI 공백과 구분해 후순위 유지/정리 결정. 이번 삭제 안 함 |
| G | 비노출 HomeQuickMenu·web 안내 | 현재 native 적용 범위 밖. web 출시 범위가 바뀌면 재조사 |
| 내부값 | KR/JP, ALL/QUESTION/FREE, status/route IDs, style map의 한국어 key, 비교 operand | 그 자체를 t로 바꾸지 말고 UI label과 stable ID 분리 |
| brand/기호 | POPKU, Google Maps attribution, 이메일 예시, • / @ 숫자 counter | 번역 대상으로 일괄 등록 안 함. attribution은 브랜드 표시 요구도 고려 |

## 4. 하드코딩 UI 문구 목록

**확인한636건 전체 목록**이다. 같은 문구가 다른 행/파일에서 반복되면 각각 기록했다. 동일 행에서 label·placeholder 등 같은 literal이 반복될 때는1건으로 통합했다. B의 key는 **기존 의미 대응 후보**이며 실제 화면 호출이 연결됐다는 뜻이 아니다. namespace가 다른 동일 짧은 label은 향후 common으로 옮길지 결정할 수 있다.

- B74건: 기존 KO key value 또는 완전한 template가 대응함(말미의 문장부호 차이 포함).
- C562건: 완전한 문장 key를 찾지 못함. 동작 단어 key만 있고 title/count/index 문장 전체가 없으면C.
- 모든 B/C: 실제 consumer를 t/locale Hook으로 연결해야 한다. 번역 JSON만 채우는 조치로는 완료되지 않는다.
- policy120건은 문단/제목/항목 source 단위다. 아래 긴 원문은80자까지만 보여 주고 `…`로 표시했으며 전체 내용은 원본 줄에서 확인한다. 사용자 작성 글/서버 응답이 아니라 앱 소유 정책 콘텐츠다.
- native 권한2건은 JS 번역 호출 밖이며 locale별 native resource가 필요하다. 나머지 일부 긴 오류도 원문이 길면 같은 방식으로 축약한다.

### src/app/(tabs)/profile/favorites.tsx — 9건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H001 | `src/app/(tabs)/profile/favorites.tsx:21` | 일정 미정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H002 | `src/app/(tabs)/profile/favorites.tsx:61` | 뒤로가기 | B | `community.writeBack` |
| H003 | `src/app/(tabs)/profile/favorites.tsx:64` | 찜한 팝업 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H004 | `src/app/(tabs)/profile/favorites.tsx:72` | 찜한 팝업을 불러오지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H005 | `src/app/(tabs)/profile/favorites.tsx:74` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H006 | `src/app/(tabs)/profile/favorites.tsx:80` | 아직 찜한 팝업이 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H007 | `src/app/(tabs)/profile/favorites.tsx:81` | 관심 있는 팝업을 찜해보세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H008 | `src/app/(tabs)/profile/favorites.tsx:84` | ${popup.name} 상세 보기 | B | `place.explore.viewDetails` |
| H009 | `src/app/(tabs)/profile/favorites.tsx:93` | 찜됨 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/index.tsx — 17건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H010 | `src/app/(tabs)/profile/index.tsx:53` | 아직 사용할 수 없는 메뉴입니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H011 | `src/app/(tabs)/profile/index.tsx:107` | 마이페이지 | B | `my.title` |
| H012 | `src/app/(tabs)/profile/index.tsx:110` | 설정 | B | `community.settings` |
| H013 | `src/app/(tabs)/profile/index.tsx:149` | 내 활동 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H014 | `src/app/(tabs)/profile/index.tsx:155` | 찜한 팝업 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H015 | `src/app/(tabs)/profile/index.tsx:166` | 내가 쓴 방문 리뷰 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H016 | `src/app/(tabs)/profile/index.tsx:176` | 내가 쓴 게시글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H017 | `src/app/(tabs)/profile/index.tsx:197` | 사용자 정보 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H018 | `src/app/(tabs)/profile/index.tsx:203` | 로그인하고 내 활동을 확인해보세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H019 | `src/app/(tabs)/profile/index.tsx:206` | 관심 팝업과 작성한 리뷰·글을 한곳에서 확인할 수 있어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H020 | `src/app/(tabs)/profile/index.tsx:213` | 로그인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H021 | `src/app/(tabs)/profile/index.tsx:222` | 사용자 정보를 불러오지 못했습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H022 | `src/app/(tabs)/profile/index.tsx:227` | 서비스 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H023 | `src/app/(tabs)/profile/index.tsx:231` | 공지사항 | B | `place.detail.notice` |
| H024 | `src/app/(tabs)/profile/index.tsx:238` | 설정 | B | `community.settings` |
| H025 | `src/app/(tabs)/profile/index.tsx:247` | 문의하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H026 | `src/app/(tabs)/profile/index.tsx:254` | 약관/정책 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/inquiries/index.tsx — 16건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H027 | `src/app/(tabs)/profile/inquiries/index.tsx:44` | 문의 추가 로딩 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H028 | `src/app/(tabs)/profile/inquiries/index.tsx:45` | 문의 내역을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H029 | `src/app/(tabs)/profile/inquiries/index.tsx:45` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H030 | `src/app/(tabs)/profile/inquiries/index.tsx:46` | 문의 더 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H031 | `src/app/(tabs)/profile/inquiries/index.tsx:48` | 문의하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H032 | `src/app/(tabs)/profile/inquiries/index.tsx:49` | 로그인 상태 확인 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H033 | `src/app/(tabs)/profile/inquiries/index.tsx:50` | 로그인 상태를 확인하지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H034 | `src/app/(tabs)/profile/inquiries/index.tsx:50` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H035 | `src/app/(tabs)/profile/inquiries/index.tsx:51` | 로그인이 필요합니다 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H036 | `src/app/(tabs)/profile/inquiries/index.tsx:51` | 문의 내역을 확인하려면 로그인해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H037 | `src/app/(tabs)/profile/inquiries/index.tsx:52` | 로그인이 필요합니다 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H038 | `src/app/(tabs)/profile/inquiries/index.tsx:58` | 문의 내역 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H039 | `src/app/(tabs)/profile/inquiries/index.tsx:58` | 아직 문의 내역이 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H040 | `src/app/(tabs)/profile/inquiries/index.tsx:58` | 궁금한 점이 있다면 문의를 남겨주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H041 | `src/app/(tabs)/profile/inquiries/index.tsx:61` | 문의글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H042 | `src/app/(tabs)/profile/inquiries/index.tsx:63` | 문의글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/inquiries/write.tsx — 12건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H043 | `src/app/(tabs)/profile/inquiries/write.tsx:21` | 문의를 등록하지 못했어요. 입력한 내용을 확인하고 다시 시도해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H044 | `src/app/(tabs)/profile/inquiries/write.tsx:24` | 문의 작성 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H045 | `src/app/(tabs)/profile/inquiries/write.tsx:27` | 로그인이 필요합니다 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H046 | `src/app/(tabs)/profile/inquiries/write.tsx:28` | 로그인 상태 확인 다시 시도 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H047 | `src/app/(tabs)/profile/inquiries/write.tsx:29` | 문의 유형 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H048 | `src/app/(tabs)/profile/inquiries/write.tsx:30` | 제목 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H049 | `src/app/(tabs)/profile/inquiries/write.tsx:30` | 문의 제목 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H050 | `src/app/(tabs)/profile/inquiries/write.tsx:30` | 제목을 입력해주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H051 | `src/app/(tabs)/profile/inquiries/write.tsx:31` | 내용 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H052 | `src/app/(tabs)/profile/inquiries/write.tsx:32` | 문의 내용 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H053 | `src/app/(tabs)/profile/inquiries/write.tsx:32` | 문의 내용을 입력해주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H054 | `src/app/(tabs)/profile/inquiries/write.tsx:35` | 문의 등록하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/inquiries/[id].tsx — 13건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H055 | `src/app/(tabs)/profile/inquiries/[id].tsx:17` | 문의 상세 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H056 | `src/app/(tabs)/profile/inquiries/[id].tsx:18` | 로그인 상태 확인 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H057 | `src/app/(tabs)/profile/inquiries/[id].tsx:19` | 로그인 상태를 확인하지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H058 | `src/app/(tabs)/profile/inquiries/[id].tsx:19` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H059 | `src/app/(tabs)/profile/inquiries/[id].tsx:20` | 로그인이 필요합니다 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H060 | `src/app/(tabs)/profile/inquiries/[id].tsx:20` | 문의 내역을 확인하려면 로그인해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H061 | `src/app/(tabs)/profile/inquiries/[id].tsx:21` | 문의 상세 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H062 | `src/app/(tabs)/profile/inquiries/[id].tsx:22` | 문의를 찾을 수 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H063 | `src/app/(tabs)/profile/inquiries/[id].tsx:22` | 문의 내역에서 다시 확인해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H064 | `src/app/(tabs)/profile/inquiries/[id].tsx:23` | 문의를 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H065 | `src/app/(tabs)/profile/inquiries/[id].tsx:23` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H066 | `src/app/(tabs)/profile/inquiries/[id].tsx:26` | 답변을 기다리고 있어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H067 | `src/app/(tabs)/profile/inquiries/[id].tsx:26` | 운영자 답변 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/login.tsx — 16건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H068 | `src/app/(tabs)/profile/login.tsx:27` | 이메일과 비밀번호를 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H069 | `src/app/(tabs)/profile/login.tsx:59` | 로그인에 실패했습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H070 | `src/app/(tabs)/profile/login.tsx:98` | 이미 이메일로 가입된 계정이 있어요.<br>기존 로그인 방법으로 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H071 | `src/app/(tabs)/profile/login.tsx:100` | Google 인증이 유효하지 않아요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H072 | `src/app/(tabs)/profile/login.tsx:102` | 네트워크 연결을 확인하고 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H073 | `src/app/(tabs)/profile/login.tsx:106` | Google Play 서비스를 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H074 | `src/app/(tabs)/profile/login.tsx:108` | Google 로그인 설정을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H075 | `src/app/(tabs)/profile/login.tsx:112` | Google 로그인에 실패했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H076 | `src/app/(tabs)/profile/login.tsx:128` | 뒤로가기 | B | `community.writeBack` |
| H077 | `src/app/(tabs)/profile/login.tsx:134` | 로그인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H078 | `src/app/(tabs)/profile/login.tsx:140` | 이메일 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H079 | `src/app/(tabs)/profile/login.tsx:150` | 비밀번호 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H080 | `src/app/(tabs)/profile/login.tsx:163` | 로그인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H081 | `src/app/(tabs)/profile/login.tsx:170` | Google로 계속하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H082 | `src/app/(tabs)/profile/login.tsx:174` | 계정이 없나요? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H083 | `src/app/(tabs)/profile/login.tsx:174` | 회원가입 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/notices/index.tsx — 6건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H084 | `src/app/(tabs)/profile/notices/index.tsx:25` | 공지사항 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H085 | `src/app/(tabs)/profile/notices/index.tsx:25` | 등록된 공지사항이 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H086 | `src/app/(tabs)/profile/notices/index.tsx:27` | 공지사항 추가 로딩 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H087 | `src/app/(tabs)/profile/notices/index.tsx:28` | 공지사항을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H088 | `src/app/(tabs)/profile/notices/index.tsx:28` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H089 | `src/app/(tabs)/profile/notices/index.tsx:29` | 더 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/notices/[id].tsx — 4건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H090 | `src/app/(tabs)/profile/notices/[id].tsx:16` | 공지사항 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H091 | `src/app/(tabs)/profile/notices/[id].tsx:17` | 공지사항을 찾을 수 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H092 | `src/app/(tabs)/profile/notices/[id].tsx:18` | 공지사항을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H093 | `src/app/(tabs)/profile/notices/[id].tsx:18` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/posts.tsx — 10건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H094 | `src/app/(tabs)/profile/posts.tsx:82` | 게시글 추가 로딩 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H095 | `src/app/(tabs)/profile/posts.tsx:84` | 게시글을 불러오지 못했어요 | B | `community.detail.failed` |
| H096 | `src/app/(tabs)/profile/posts.tsx:86` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H097 | `src/app/(tabs)/profile/posts.tsx:90` | 게시글 더 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H098 | `src/app/(tabs)/profile/posts.tsx:95` | 뒤로가기 | B | `community.writeBack` |
| H099 | `src/app/(tabs)/profile/posts.tsx:98` | 내가 쓴 게시글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H100 | `src/app/(tabs)/profile/posts.tsx:108` | 게시글 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H101 | `src/app/(tabs)/profile/posts.tsx:110` | 로그인이 필요해요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H102 | `src/app/(tabs)/profile/posts.tsx:111` | 로그인 후 내가 쓴 게시글을 확인할 수 있어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H103 | `src/app/(tabs)/profile/posts.tsx:114` | 아직 작성한 게시글이 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/reviews.tsx — 9건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H104 | `src/app/(tabs)/profile/reviews.tsx:77` | 리뷰 추가 로딩 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H105 | `src/app/(tabs)/profile/reviews.tsx:79` | 방문 리뷰를 불러오지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H106 | `src/app/(tabs)/profile/reviews.tsx:81` | 다시 시도하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H107 | `src/app/(tabs)/profile/reviews.tsx:85` | 리뷰 더 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H108 | `src/app/(tabs)/profile/reviews.tsx:90` | 뒤로가기 | B | `community.writeBack` |
| H109 | `src/app/(tabs)/profile/reviews.tsx:93` | 내가 쓴 방문 리뷰 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H110 | `src/app/(tabs)/profile/reviews.tsx:99` | 방문 리뷰 불러오는 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H111 | `src/app/(tabs)/profile/reviews.tsx:102` | 아직 작성한 방문 리뷰가 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H112 | `src/app/(tabs)/profile/reviews.tsx:103` | 다녀온 팝업에 방문 리뷰를 남겨보세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/settings.tsx — 14건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H113 | `src/app/(tabs)/profile/settings.tsx:40` | 로그아웃 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H114 | `src/app/(tabs)/profile/settings.tsx:40` | 로그아웃에 실패했습니다. 다시 시도해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H115 | `src/app/(tabs)/profile/settings.tsx:52` | 뒤로가기 | B | `community.writeBack` |
| H116 | `src/app/(tabs)/profile/settings.tsx:61` | 설정 | B | `community.settings` |
| H117 | `src/app/(tabs)/profile/settings.tsx:65` | 계정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H118 | `src/app/(tabs)/profile/settings.tsx:68` | 닉네임 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H119 | `src/app/(tabs)/profile/settings.tsx:70` | 닉네임 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H120 | `src/app/(tabs)/profile/settings.tsx:73` | 비밀번호 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H121 | `src/app/(tabs)/profile/settings.tsx:75` | 비밀번호 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H122 | `src/app/(tabs)/profile/settings.tsx:80` | 로그아웃 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H123 | `src/app/(tabs)/profile/settings.tsx:86` | 로그아웃 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H124 | `src/app/(tabs)/profile/settings.tsx:95` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H125 | `src/app/(tabs)/profile/settings.tsx:104` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H126 | `src/app/(tabs)/profile/settings.tsx:114` | 로그인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/signup.tsx — 70건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H127 | `src/app/(tabs)/profile/signup.tsx:51` | 자세히 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H128 | `src/app/(tabs)/profile/signup.tsx:63` | 이메일 형식을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H129 | `src/app/(tabs)/profile/signup.tsx:64` | 이미 가입된 이메일이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H130 | `src/app/(tabs)/profile/signup.tsx:65` | 잠시 후 다시 인증번호를 요청해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H131 | `src/app/(tabs)/profile/signup.tsx:66` | 인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H132 | `src/app/(tabs)/profile/signup.tsx:67` | 인증번호를 보내지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H133 | `src/app/(tabs)/profile/signup.tsx:69` | 네트워크 연결을 확인하고 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H134 | `src/app/(tabs)/profile/signup.tsx:70` | 요청을 처리하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H135 | `src/app/(tabs)/profile/signup.tsx:75` | 인증번호를 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H136 | `src/app/(tabs)/profile/signup.tsx:76` | 인증번호가 만료됐어요. 재전송해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H137 | `src/app/(tabs)/profile/signup.tsx:77` | 인증 시도 횟수를 초과했어요. 인증번호를 재전송해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H138 | `src/app/(tabs)/profile/signup.tsx:78` | 이미 인증된 이메일이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H139 | `src/app/(tabs)/profile/signup.tsx:79` | 인증번호를 확인하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H140 | `src/app/(tabs)/profile/signup.tsx:81` | 네트워크 연결을 확인하고 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H141 | `src/app/(tabs)/profile/signup.tsx:82` | 요청을 처리하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H142 | `src/app/(tabs)/profile/signup.tsx:88` | 이미 가입된 이메일이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H143 | `src/app/(tabs)/profile/signup.tsx:89` | 이미 사용 중인 닉네임이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H144 | `src/app/(tabs)/profile/signup.tsx:90` | 이메일 또는 닉네임이 이미 사용 중이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H145 | `src/app/(tabs)/profile/signup.tsx:92` | 이메일 인증이 만료됐어요. 회원가입을 다시 시작해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H146 | `src/app/(tabs)/profile/signup.tsx:94` | 비밀번호 조건을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H147 | `src/app/(tabs)/profile/signup.tsx:95` | 필수 약관 동의를 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H148 | `src/app/(tabs)/profile/signup.tsx:96` | 이메일 형식을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H149 | `src/app/(tabs)/profile/signup.tsx:97` | 닉네임 형식을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H150 | `src/app/(tabs)/profile/signup.tsx:98` | 입력 정보를 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H151 | `src/app/(tabs)/profile/signup.tsx:100` | 회원가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H152 | `src/app/(tabs)/profile/signup.tsx:102` | 네트워크 연결을 확인하고 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H153 | `src/app/(tabs)/profile/signup.tsx:103` | 회원가입을 완료하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H154 | `src/app/(tabs)/profile/signup.tsx:108` | Google 가입 시간이 만료됐어요. 다시 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H155 | `src/app/(tabs)/profile/signup.tsx:110` | 이미 사용 중인 닉네임이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H156 | `src/app/(tabs)/profile/signup.tsx:111` | 이미 가입된 이메일이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H157 | `src/app/(tabs)/profile/signup.tsx:112` | 이메일 또는 닉네임이 이미 사용 중이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H158 | `src/app/(tabs)/profile/signup.tsx:114` | 닉네임과 필수 약관 동의를 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H159 | `src/app/(tabs)/profile/signup.tsx:116` | 네트워크 연결을 확인하고 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H160 | `src/app/(tabs)/profile/signup.tsx:117` | Google 가입을 완료하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H161 | `src/app/(tabs)/profile/signup.tsx:300` | Google 가입 시간이 만료됐어요. 다시 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H162 | `src/app/(tabs)/profile/signup.tsx:328` | 이메일 인증을 다시 진행해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H163 | `src/app/(tabs)/profile/signup.tsx:392` | 이미 가입된 이메일이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H164 | `src/app/(tabs)/profile/signup.tsx:465` | 뒤로가기 | B | `community.writeBack` |
| H165 | `src/app/(tabs)/profile/signup.tsx:471` | 회원가입 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H166 | `src/app/(tabs)/profile/signup.tsx:477` | 이메일을 입력해 주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H167 | `src/app/(tabs)/profile/signup.tsx:480` | 이메일 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H168 | `src/app/(tabs)/profile/signup.tsx:496` | 인증번호 받기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H169 | `src/app/(tabs)/profile/signup.tsx:503` | 인증번호 6자리 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H170 | `src/app/(tabs)/profile/signup.tsx:520` | 인증완료 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H171 | `src/app/(tabs)/profile/signup.tsx:520` | 인증하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H172 | `src/app/(tabs)/profile/signup.tsx:530` | 인증번호 재전송 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H173 | `src/app/(tabs)/profile/signup.tsx:535` | 이메일 인증이 완료됐어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H174 | `src/app/(tabs)/profile/signup.tsx:541` | 비밀번호를 입력해 주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H175 | `src/app/(tabs)/profile/signup.tsx:544` | 비밀번호 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H176 | `src/app/(tabs)/profile/signup.tsx:551` | 영문과 숫자를 포함해 8자 이상 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H177 | `src/app/(tabs)/profile/signup.tsx:554` | 비밀번호 확인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H178 | `src/app/(tabs)/profile/signup.tsx:562` | 비밀번호가 일치하지 않아요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H179 | `src/app/(tabs)/profile/signup.tsx:564` | 다음 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H180 | `src/app/(tabs)/profile/signup.tsx:571` | 닉네임을 입력해 주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H181 | `src/app/(tabs)/profile/signup.tsx:574` | 닉네임 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H182 | `src/app/(tabs)/profile/signup.tsx:580` | 2~10자로 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H183 | `src/app/(tabs)/profile/signup.tsx:582` | 문자·숫자·밑줄로 2~10자 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H184 | `src/app/(tabs)/profile/signup.tsx:584` | 사용 가능한 닉네임이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H185 | `src/app/(tabs)/profile/signup.tsx:586` | 이미 사용 중인 닉네임이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H186 | `src/app/(tabs)/profile/signup.tsx:588` | 닉네임을 확인하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H187 | `src/app/(tabs)/profile/signup.tsx:595` | 확인 중... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H188 | `src/app/(tabs)/profile/signup.tsx:595` | 다음 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H189 | `src/app/(tabs)/profile/signup.tsx:600` | 약관에 동의해 주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H190 | `src/app/(tabs)/profile/signup.tsx:605` | 전체 동의 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H191 | `src/app/(tabs)/profile/signup.tsx:612` | 전체 동의 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H192 | `src/app/(tabs)/profile/signup.tsx:615` | [필수] 서비스 이용약관 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H193 | `src/app/(tabs)/profile/signup.tsx:621` | [필수] 개인정보 처리방침 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H194 | `src/app/(tabs)/profile/signup.tsx:627` | [선택] 마케팅 정보 수신 동의 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H195 | `src/app/(tabs)/profile/signup.tsx:638` | 가입 중... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H196 | `src/app/(tabs)/profile/signup.tsx:638` | 가입하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/profile/withdrawal.tsx — 21건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H197 | `src/app/(tabs)/profile/withdrawal.tsx:11` | 질문/자유 게시글과 해당 글에 달린 댓글은 삭제됩니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H198 | `src/app/(tabs)/profile/withdrawal.tsx:12` | 관심 팝업과 좋아요 등 개인 활동 정보가 삭제됩니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H199 | `src/app/(tabs)/profile/withdrawal.tsx:13` | 방문 리뷰와 일부 댓글은 삭제되지 않고 '탈퇴한 사용자'로 표시되어 유지됩니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H200 | `src/app/(tabs)/profile/withdrawal.tsx:14` | 삭제된 정보는 복구할 수 없습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H201 | `src/app/(tabs)/profile/withdrawal.tsx:46` | 회원탈퇴가 완료되었습니다 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H202 | `src/app/(tabs)/profile/withdrawal.tsx:46` | 기기의 로그인 정보를 정리하지 못했습니다. 다시 시도해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H203 | `src/app/(tabs)/profile/withdrawal.tsx:48` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H204 | `src/app/(tabs)/profile/withdrawal.tsx:48` | 회원탈퇴에 실패했습니다. 다시 시도해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H205 | `src/app/(tabs)/profile/withdrawal.tsx:61` | 정말 탈퇴하시겠어요? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H206 | `src/app/(tabs)/profile/withdrawal.tsx:61` | 탈퇴하면 삭제되는 정보는 복구할 수 없습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H207 | `src/app/(tabs)/profile/withdrawal.tsx:62` | 취소 | B | `community.cancel` |
| H208 | `src/app/(tabs)/profile/withdrawal.tsx:63` | 탈퇴하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H209 | `src/app/(tabs)/profile/withdrawal.tsx:72` | 뒤로가기 | B | `community.writeBack` |
| H210 | `src/app/(tabs)/profile/withdrawal.tsx:76` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H211 | `src/app/(tabs)/profile/withdrawal.tsx:80` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H212 | `src/app/(tabs)/profile/withdrawal.tsx:81` | 탈퇴하기 전에 확인해주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H213 | `src/app/(tabs)/profile/withdrawal.tsx:91` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H214 | `src/app/(tabs)/profile/withdrawal.tsx:91` | 로그인 정보 정리 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H215 | `src/app/(tabs)/profile/withdrawal.tsx:94` | 회원탈퇴 처리 중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H216 | `src/app/(tabs)/profile/withdrawal.tsx:95` | 회원탈퇴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H217 | `src/app/(tabs)/profile/withdrawal.tsx:95` | 로그인 정보 정리 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/(tabs)/_layout.tsx — 5건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H218 | `src/app/(tabs)/_layout.tsx:13` | 메인 홈 | B | `home.title` |
| H219 | `src/app/(tabs)/_layout.tsx:14` | 플레이스 | B | `place.title` |
| H220 | `src/app/(tabs)/_layout.tsx:15` | 지도 | B | `map.title` |
| H221 | `src/app/(tabs)/_layout.tsx:16` | 커뮤니티 | B | `community.title` |
| H222 | `src/app/(tabs)/_layout.tsx:17` | 마이페이지 | B | `my.title` |

### src/app/community/[id].tsx — 4건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H223 | `src/app/community/[id].tsx:345` | 좋아요 취소 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H224 | `src/app/community/[id].tsx:345` | 좋아요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H225 | `src/app/community/[id].tsx:353` | 좋아요를 변경하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H226 | `src/app/community/[id].tsx:354` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/places/[id].tsx — 21건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H227 | `src/app/places/[id].tsx:121` | 팝업 정보 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H228 | `src/app/places/[id].tsx:137` | 방문 리뷰 | B | `community.reviewFilterLabel` |
| H229 | `src/app/places/[id].tsx:310` | 찜을 변경하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H230 | `src/app/places/[id].tsx:310` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H231 | `src/app/places/[id].tsx:371` | 팝업 정보를 불러오지 못했습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H232 | `src/app/places/[id].tsx:466` | 공유하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H233 | `src/app/places/[id].tsx:501` | 찜 해제 | B | `place.all.removeFavorite` |
| H234 | `src/app/places/[id].tsx:501` | 찜하기 | B | `place.all.addFavorite` |
| H235 | `src/app/places/[id].tsx:519` | 평균 별점 ${averageRating}점, 방문 리뷰로 이동 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H236 | `src/app/places/[id].tsx:528` | 방문 리뷰로 이동 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H237 | `src/app/places/[id].tsx:533` | 후기 ${reviewCount}개 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H238 | `src/app/places/[id].tsx:533` | 후기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H239 | `src/app/places/[id].tsx:634` | 위치 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H240 | `src/app/places/[id].tsx:637` | 지도에서 팝업 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H241 | `src/app/places/[id].tsx:653` | 길찾기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H242 | `src/app/places/[id].tsx:739` | 정보 수정 제보하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H243 | `src/app/places/[id].tsx:745` | 정보 수정 제보 → | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H244 | `src/app/places/[id].tsx:804` | 찜 해제 | B | `place.all.removeFavorite` |
| H245 | `src/app/places/[id].tsx:804` | 찜하기 | B | `place.all.addFavorite` |
| H246 | `src/app/places/[id].tsx:828` | 찜했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H247 | `src/app/places/[id].tsx:828` | 찜하기 | B | `place.all.addFavorite` |

### src/app/profile/policies/index.tsx — 2건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H248 | `src/app/profile/policies/index.tsx:22` | 뒤로가기 | B | `community.writeBack` |
| H249 | `src/app/profile/policies/index.tsx:27` | 약관/정책 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/reviews/write.tsx — 24건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H250 | `src/app/reviews/write.tsx:96` | 이 팝업에 이미 방문 리뷰를 남겼어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H251 | `src/app/reviews/write.tsx:96` | 리뷰를 수정하지 못했어요. 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H252 | `src/app/reviews/write.tsx:96` | 리뷰를 등록하지 못했어요. 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H253 | `src/app/reviews/write.tsx:107` | 뒤로 가기 | B | `place.explore.back` |
| H254 | `src/app/reviews/write.tsx:111` | 방문 리뷰 수정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H255 | `src/app/reviews/write.tsx:111` | 방문 리뷰 작성 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H256 | `src/app/reviews/write.tsx:112` | 수정 완료 | B | `community.edit.save` |
| H257 | `src/app/reviews/write.tsx:112` | 등록 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H258 | `src/app/reviews/write.tsx:114` | 수정 완료 | B | `community.edit.save` |
| H259 | `src/app/reviews/write.tsx:114` | 등록 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H260 | `src/app/reviews/write.tsx:119` | 리뷰를 확인하지 못했어요. 다시 시도 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H261 | `src/app/reviews/write.tsx:119` | 팝업을 확인하지 못했어요. 다시 시도 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H262 | `src/app/reviews/write.tsx:121` | 이번 방문은 어떠셨나요? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H263 | `src/app/reviews/write.tsx:123` | 별점 ${value}점 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H264 | `src/app/reviews/write.tsx:127` | 후기를 남겨주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H265 | `src/app/reviews/write.tsx:128` | 방문 후기 내용 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H266 | `src/app/reviews/write.tsx:129` | 방문 경험을 들려주세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H267 | `src/app/reviews/write.tsx:130` | 후기 내용이 저장 가능한 길이를 초과했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H268 | `src/app/reviews/write.tsx:131` | 사진 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H269 | `src/app/reviews/write.tsx:131` | 최대 5장 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H270 | `src/app/reviews/write.tsx:133` | 사진 추가 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H271 | `src/app/reviews/write.tsx:139` | 사진 ${index + 1} 삭제 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H272 | `src/app/reviews/write.tsx:144` | 수정 결과를 확인하지 못했어요. 같은 내용으로 수정 완료를 다시 눌러 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H273 | `src/app/reviews/write.tsx:144` | 등록 결과를 확인하지 못했어요. 같은 내용으로 등록을 다시 눌러 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/app/reviews/[id].tsx — 16건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H274 | `src/app/reviews/[id].tsx:173` | 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H275 | `src/app/reviews/[id].tsx:173` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H276 | `src/app/reviews/[id].tsx:183` | 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H277 | `src/app/reviews/[id].tsx:183` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H278 | `src/app/reviews/[id].tsx:200` | 리뷰를 삭제하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H279 | `src/app/reviews/[id].tsx:200` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H280 | `src/app/reviews/[id].tsx:211` | 리뷰를 삭제할까요? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H281 | `src/app/reviews/[id].tsx:253` | 방문 리뷰 | B | `community.reviewFilterLabel` |
| H282 | `src/app/reviews/[id].tsx:257` | 리뷰 메뉴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H283 | `src/app/reviews/[id].tsx:286` | 방문 리뷰를 찾을 수 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H284 | `src/app/reviews/[id].tsx:287` | 방문 리뷰를 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H285 | `src/app/reviews/[id].tsx:345` | 좋아요 취소 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H286 | `src/app/reviews/[id].tsx:345` | 좋아요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H287 | `src/app/reviews/[id].tsx:351` | 좋아요를 변경하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H288 | `src/app/reviews/[id].tsx:352` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H289 | `src/app/reviews/[id].tsx:397` | 수정 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/community/CommunityComments.tsx — 26건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H290 | `src/components/community/CommunityComments.tsx:167` | 로그인 정보를 확인하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H291 | `src/components/community/CommunityComments.tsx:177` | 댓글은 ${MAX_COMMENT_LENGTH.toLocaleString()}자 이하로 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H292 | `src/components/community/CommunityComments.tsx:223` | 댓글을 등록하지 못했어요. 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H293 | `src/components/community/CommunityComments.tsx:289` | 댓글을 삭제하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H294 | `src/components/community/CommunityComments.tsx:289` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H295 | `src/components/community/CommunityComments.tsx:305` | 댓글을 삭제할까요? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H296 | `src/components/community/CommunityComments.tsx:306` | 삭제한 댓글은 되돌릴 수 없습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H297 | `src/components/community/CommunityComments.tsx:309` | 취소 | B | `community.cancel` |
| H298 | `src/components/community/CommunityComments.tsx:316` | 삭제 | B | `community.delete.confirm` |
| H299 | `src/components/community/CommunityComments.tsx:344` | 댓글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H300 | `src/components/community/CommunityComments.tsx:350` | 댓글을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H301 | `src/components/community/CommunityComments.tsx:354` | 댓글 다시 시도 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H302 | `src/components/community/CommunityComments.tsx:357` | 다시 시도 | B | `community.detail.retry` |
| H303 | `src/components/community/CommunityComments.tsx:361` | 아직 댓글이 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H304 | `src/components/community/CommunityComments.tsx:414` | ${item.author.nickname}에게 답글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H305 | `src/components/community/CommunityComments.tsx:428` | 답글쓰기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H306 | `src/components/community/CommunityComments.tsx:428` | 답글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H307 | `src/components/community/CommunityComments.tsx:434` | ${item.id}번 댓글 메뉴 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H308 | `src/components/community/CommunityComments.tsx:464` | 에게 답글 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H309 | `src/components/community/CommunityComments.tsx:467` | 답글 취소 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H310 | `src/components/community/CommunityComments.tsx:489` | 댓글 입력 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H311 | `src/components/community/CommunityComments.tsx:490` | 댓글을 입력해주세요... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H312 | `src/components/community/CommunityComments.tsx:498` | 댓글 입력 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H313 | `src/components/community/CommunityComments.tsx:501` | 댓글을 입력해주세요... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H314 | `src/components/community/CommunityComments.tsx:506` | 댓글 등록 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H315 | `src/components/community/CommunityComments.tsx:529` | 등록 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/community/CommunityPostItem.tsx — 5건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H316 | `src/components/community/CommunityPostItem.tsx:267` | 후기 사진 1 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H317 | `src/components/community/CommunityPostItem.tsx:277` | 후기 사진 2 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H318 | `src/components/community/CommunityPostItem.tsx:288` | 후기 사진 ${index + 2} | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H319 | `src/components/community/CommunityPostItem.tsx:343` | 좋아요 취소 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H320 | `src/components/community/CommunityPostItem.tsx:343` | 좋아요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/home/HomeNewPopupSection.tsx — 7건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H321 | `src/components/home/HomeNewPopupSection.tsx:16` | 한국 | B | `place.filters.countries.kr` |
| H322 | `src/components/home/HomeNewPopupSection.tsx:17` | 일본 | B | `place.filters.countries.jp` |
| H323 | `src/components/home/HomeNewPopupSection.tsx:60` | 이번 주 새로 열려요 ✨ | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H324 | `src/components/home/HomeNewPopupSection.tsx:61` | 이번 주 새롭게 오픈하는 팝업을 만나보세요! | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H325 | `src/components/home/HomeNewPopupSection.tsx:77` | 팝업을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H326 | `src/components/home/HomeNewPopupSection.tsx:79` | 이번 주 새로 여는 팝업이 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H327 | `src/components/home/HomeNewPopupSection.tsx:98` | 더보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/home/HomeTrendingSection.tsx — 9건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H328 | `src/components/home/HomeTrendingSection.tsx:17` | 한국 | B | `place.filters.countries.kr` |
| H329 | `src/components/home/HomeTrendingSection.tsx:18` | 일본 | B | `place.filters.countries.jp` |
| H330 | `src/components/home/HomeTrendingSection.tsx:48` | 지금 뜨는 팝업 🔥 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H331 | `src/components/home/HomeTrendingSection.tsx:50` | 요즘 인기 있는 팝업을 모아봤어요! | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H332 | `src/components/home/HomeTrendingSection.tsx:61` | 팝업을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H333 | `src/components/home/HomeTrendingSection.tsx:66` | 진행 중인 팝업이 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H334 | `src/components/home/HomeTrendingSection.tsx:67` | 새로운 팝업을 준비 중이에요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H335 | `src/components/home/HomeTrendingSection.tsx:103` | 접기 | B | `place.filters.collapse` |
| H336 | `src/components/home/HomeTrendingSection.tsx:103` | TOP 10 모두 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/home/NewPopupCard.tsx — 3건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H337 | `src/components/home/NewPopupCard.tsx:34` | ${title} 상세 보기 | B | `place.explore.viewDetails` |
| H338 | `src/components/home/NewPopupCard.tsx:39` | ${title} 찜 취소 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H339 | `src/components/home/NewPopupCard.tsx:39` | ${title} 찜하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/home/PopupRankingCard.tsx — 3건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H340 | `src/components/home/PopupRankingCard.tsx:31` | ${title} 상세 보기 | B | `place.explore.viewDetails` |
| H341 | `src/components/home/PopupRankingCard.tsx:56` | ${title} 찜 취소 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H342 | `src/components/home/PopupRankingCard.tsx:56` | ${title} 찜하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/map/MapPopupListSheet.tsx — 7건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H343 | `src/components/map/MapPopupListSheet.tsx:42` | 일정 미정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H344 | `src/components/map/MapPopupListSheet.tsx:45` | 오픈예정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H345 | `src/components/map/MapPopupListSheet.tsx:47` | 종료됨 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H346 | `src/components/map/MapPopupListSheet.tsx:48` | 진행중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H347 | `src/components/map/MapPopupListSheet.tsx:127` | 팝업을 불러오지 못했어요. 다시 시도 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H348 | `src/components/map/MapPopupListSheet.tsx:133` | 팝업을 불러오는 중이에요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H349 | `src/components/map/MapPopupListSheet.tsx:134` | 이 지역에 해당하는 팝업이 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/map/MapPopupPreviewCard.tsx — 1건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H350 | `src/components/map/MapPopupPreviewCard.tsx:58` | 일정 미정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/map/MapSearchOverlay.tsx — 7건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H351 | `src/components/map/MapSearchOverlay.tsx:62` | 장소 | B | `place.detail.basicInfo.place` |
| H352 | `src/components/map/MapSearchOverlay.tsx:63` | 검색 중... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H353 | `src/components/map/MapSearchOverlay.tsx:77` | 위치 확인 중... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H354 | `src/components/map/MapSearchOverlay.tsx:85` | 팝업 | B | `place.filters.eventTypes.popup` |
| H355 | `src/components/map/MapSearchOverlay.tsx:86` | 검색 중... | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H356 | `src/components/map/MapSearchOverlay.tsx:87` | 검색할 수 없어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H357 | `src/components/map/MapSearchOverlay.tsx:89` | 검색 결과가 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/AppliedFilterBar.tsx — 1건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H358 | `src/components/place/AppliedFilterBar.tsx:37` | 이번 주 오픈 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/IntroductionImageCarousel.tsx — 1건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H359 | `src/components/place/IntroductionImageCarousel.tsx:82` | 이미지를 불러올 수 없습니다 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/PlaceFilterSheet.tsx — 7건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H360 | `src/components/place/PlaceFilterSheet.tsx:189` | 빠른 필터 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H361 | `src/components/place/PlaceFilterSheet.tsx:200` | 지역 | B | `place.filters.regions._label` |
| H362 | `src/components/place/PlaceFilterSheet.tsx:211` | 관심 분야 | B | `place.filters.interests._label` |
| H363 | `src/components/place/PlaceFilterSheet.tsx:220` | 운영 상태 | B | `place.filters.operationStatuses._label` |
| H364 | `src/components/place/PlaceFilterSheet.tsx:228` | 기간 | B | `place.detail.basicInfo.period` |
| H365 | `src/components/place/PlaceFilterSheet.tsx:252` | 필터 항목을 불러오는 중이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H366 | `src/components/place/PlaceFilterSheet.tsx:252` | 필터 항목을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/PlaceInterestSection.tsx — 1건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H367 | `src/components/place/PlaceInterestSection.tsx:58` | 게임/디지털 | B | `place.filters.interests.game` |

### src/components/place/PlaceWeeklyPopupList.tsx — 5건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H368 | `src/components/place/PlaceWeeklyPopupList.tsx:43` | 오픈예정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H369 | `src/components/place/PlaceWeeklyPopupList.tsx:45` | 종료됨 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H370 | `src/components/place/PlaceWeeklyPopupList.tsx:46` | 진행중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H371 | `src/components/place/PlaceWeeklyPopupList.tsx:133` | 찜 해제 | B | `place.all.removeFavorite` |
| H372 | `src/components/place/PlaceWeeklyPopupList.tsx:133` | 찜하기 | B | `place.all.addFavorite` |

### src/components/place/PlaceWeeklySection.tsx — 4건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H373 | `src/components/place/PlaceWeeklySection.tsx:214` | 이번 주 뭐가 뜰까? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H374 | `src/components/place/PlaceWeeklySection.tsx:283` | 팝업을 불러오는 중이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H375 | `src/components/place/PlaceWeeklySection.tsx:288` | 팝업을 불러오지 못했어요. 다시 시도 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H376 | `src/components/place/PlaceWeeklySection.tsx:365` | 주간 팝업 ${index + 1}페이지 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/PopupGridCard.tsx — 3건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H377 | `src/components/place/PopupGridCard.tsx:50` | 오픈예정 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H378 | `src/components/place/PopupGridCard.tsx:50` | 종료됨 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H379 | `src/components/place/PopupGridCard.tsx:50` | 진행중 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/PopupReviews.tsx — 16건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H380 | `src/components/place/PopupReviews.tsx:78` | 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H381 | `src/components/place/PopupReviews.tsx:78` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H382 | `src/components/place/PopupReviews.tsx:85` | 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H383 | `src/components/place/PopupReviews.tsx:85` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H384 | `src/components/place/PopupReviews.tsx:91` | 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H385 | `src/components/place/PopupReviews.tsx:91` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H386 | `src/components/place/PopupReviews.tsx:93` | 방문 리뷰 작성 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H387 | `src/components/place/PopupReviews.tsx:94` | 방문 리뷰 작성 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H388 | `src/components/place/PopupReviews.tsx:99` | 아직 방문 리뷰가 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H389 | `src/components/place/PopupReviews.tsx:100` | 이 팝업에 다녀오셨나요? | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H390 | `src/components/place/PopupReviews.tsx:100` | 첫 번째 리뷰를 남겨보세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H391 | `src/components/place/PopupReviews.tsx:105` | 좋아요를 변경하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H392 | `src/components/place/PopupReviews.tsx:105` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H393 | `src/components/place/PopupReviews.tsx:109` | 방문 리뷰를 불러오지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H394 | `src/components/place/PopupReviews.tsx:110` | 다시 시도 | B | `community.detail.retry` |
| H395 | `src/components/place/PopupReviews.tsx:114` | 리뷰 더 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/StaticMapImage.tsx — 1건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H396 | `src/components/place/StaticMapImage.tsx:28` | 위치 지도 미리보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/place/TodayOpeningCarousel.tsx — 5건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H397 | `src/components/place/TodayOpeningCarousel.tsx:172` | 곧 끝나요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H398 | `src/components/place/TodayOpeningCarousel.tsx:173` | 종료가 가까운 팝업을 모았어요! | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H399 | `src/components/place/TodayOpeningCarousel.tsx:191` | 팝업을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H400 | `src/components/place/TodayOpeningCarousel.tsx:192` | 5일 안에 종료되는 팝업이 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H401 | `src/components/place/TodayOpeningCarousel.tsx:277` | 오늘 종료 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/profile/AccountSettingsScreen.tsx — 26건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H402 | `src/components/profile/AccountSettingsScreen.tsx:24` | ${label} ${visible ? '숨기기' : '표시'} | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H403 | `src/components/profile/AccountSettingsScreen.tsx:35` | 닉네임 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H404 | `src/components/profile/AccountSettingsScreen.tsx:35` | 비밀번호 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H405 | `src/components/profile/AccountSettingsScreen.tsx:69` | 닉네임은 문자·숫자·밑줄(_)로 2~10자 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H406 | `src/components/profile/AccountSettingsScreen.tsx:70` | 현재 닉네임과 같아요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H407 | `src/components/profile/AccountSettingsScreen.tsx:82` | 이미 사용 중인 닉네임이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H408 | `src/components/profile/AccountSettingsScreen.tsx:84` | 닉네임이 변경됐어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H409 | `src/components/profile/AccountSettingsScreen.tsx:95` | 비밀번호가 변경됐어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H410 | `src/components/profile/AccountSettingsScreen.tsx:96` | 앱 인증 정보 정리에 실패했어요. 앱을 다시 열고 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H411 | `src/components/profile/AccountSettingsScreen.tsx:100` | 비밀번호가 변경됐어요. 다시 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H412 | `src/components/profile/AccountSettingsScreen.tsx:101` | 비밀번호 변경 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H413 | `src/components/profile/AccountSettingsScreen.tsx:101` | 비밀번호가 변경됐어요. 다시 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H414 | `src/components/profile/AccountSettingsScreen.tsx:102` | 확인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H415 | `src/components/profile/AccountSettingsScreen.tsx:119` | 뒤로가기 | B | `community.writeBack` |
| H416 | `src/components/profile/AccountSettingsScreen.tsx:129` | 현재 닉네임 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H417 | `src/components/profile/AccountSettingsScreen.tsx:132` | 새 닉네임 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H418 | `src/components/profile/AccountSettingsScreen.tsx:133` | 새 닉네임 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H419 | `src/components/profile/AccountSettingsScreen.tsx:136` | 문자·숫자·밑줄(_)로 2~10자 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H420 | `src/components/profile/AccountSettingsScreen.tsx:139` | 현재 비밀번호 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H421 | `src/components/profile/AccountSettingsScreen.tsx:140` | 새 비밀번호 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H422 | `src/components/profile/AccountSettingsScreen.tsx:141` | 영문과 숫자를 포함한 8~72자. 공백 없이 영문·숫자·기호를 사용할 수 있어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H423 | `src/components/profile/AccountSettingsScreen.tsx:142` | 새 비밀번호 확인 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H424 | `src/components/profile/AccountSettingsScreen.tsx:144` | 저장 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H425 | `src/components/profile/AccountSettingsScreen.tsx:146` | 저장 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H426 | `src/components/profile/AccountSettingsScreen.tsx:148` | 소셜 로그인 계정은 비밀번호를 변경할 수 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H427 | `src/components/profile/AccountSettingsScreen.tsx:148` | 로그인 후 계정 정보를 변경할 수 있어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/profile/InquiryLayout.tsx — 2건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H428 | `src/components/profile/InquiryLayout.tsx:13` | 뒤로가기 | B | `community.writeBack` |
| H429 | `src/components/profile/InquiryLayout.tsx:13` | 문의하기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/components/profile/NoticeLayout.tsx — 2건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H430 | `src/components/profile/NoticeLayout.tsx:12` | 뒤로가기 | B | `community.writeBack` |
| H431 | `src/components/profile/NoticeLayout.tsx:13` | 공지사항 | B | `place.detail.notice` |

### src/components/profile/PolicyDetailScreen.tsx — 1건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H432 | `src/components/profile/PolicyDetailScreen.tsx:16` | 뒤로가기 | B | `community.writeBack` |

### src/content/policies.ts — 120건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H433 | `src/content/policies.ts:15` | 시행일: 추후 확정 | C | 없음 — policy JA 콘텐츠 분리 |
| H434 | `src/content/policies.ts:19` | 이용약관 | C | 없음 — policy JA 콘텐츠 분리 |
| H435 | `src/content/policies.ts:23` | 제1조 목적 | C | 없음 — policy JA 콘텐츠 분리 |
| H436 | `src/content/policies.ts:24` | 이 약관은 ${SERVICE_NAME}(이하 “서비스”) 이용과 관련하여 운영자와 이용자 간의 권리, 의무 및 필요한 사항을 정합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H437 | `src/content/policies.ts:27` | 제2조 서비스 제공 | C | 없음 — policy JA 콘텐츠 분리 |
| H438 | `src/content/policies.ts:28` | 서비스는 다음 기능을 제공합니다. 일부 기능은 로그인이 필요할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H439 | `src/content/policies.ts:30` | 팝업스토어 및 관련 장소 정보 제공 | C | 없음 — policy JA 콘텐츠 분리 |
| H440 | `src/content/policies.ts:31` | 지도, 검색 및 필터를 통한 장소 탐색 | C | 없음 — policy JA 콘텐츠 분리 |
| H441 | `src/content/policies.ts:32` | 관심 팝업 저장 | C | 없음 — policy JA 콘텐츠 분리 |
| H442 | `src/content/policies.ts:33` | 질문 및 자유 게시글 | C | 없음 — policy JA 콘텐츠 분리 |
| H443 | `src/content/policies.ts:34` | 방문 리뷰 및 별점 | C | 없음 — policy JA 콘텐츠 분리 |
| H444 | `src/content/policies.ts:35` | 댓글, 대댓글 및 좋아요 | C | 없음 — policy JA 콘텐츠 분리 |
| H445 | `src/content/policies.ts:36` | 기타 서비스 운영을 위해 제공하는 기능 | C | 없음 — policy JA 콘텐츠 분리 |
| H446 | `src/content/policies.ts:40` | 제3조 회원가입 및 계정 | C | 없음 — policy JA 콘텐츠 분리 |
| H447 | `src/content/policies.ts:42` | 이메일 또는 Google 계정을 이용해 가입·로그인할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H448 | `src/content/policies.ts:43` | 회원은 정확한 정보를 제공해야 합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H449 | `src/content/policies.ts:44` | 타인의 정보나 계정을 이용해서는 안 됩니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H450 | `src/content/policies.ts:45` | 회원은 자신의 계정을 안전하게 관리해야 합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H451 | `src/content/policies.ts:49` | 제4조 게시물 및 방문 리뷰 | C | 없음 — policy JA 콘텐츠 분리 |
| H452 | `src/content/policies.ts:51` | 회원은 질문, 자유 게시글, 방문 리뷰, 댓글, 대댓글 및 이미지 등을 등록할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H453 | `src/content/policies.ts:52` | 자신이 작성했거나 적법하게 사용할 권리가 있는 콘텐츠만 등록해야 합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H454 | `src/content/policies.ts:53` | 게시물의 권리는 원칙적으로 작성자 또는 정당한 권리자에게 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H455 | `src/content/policies.ts:54` | 서비스 제공에 필요한 범위에서 게시물을 저장하고 서비스 화면에 표시할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H456 | `src/content/policies.ts:58` | 제5조 금지행위 | C | 없음 — policy JA 콘텐츠 분리 |
| H457 | `src/content/policies.ts:59` | 다음 행위를 금지합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H458 | `src/content/policies.ts:61` | 다른 사람의 정보나 계정 도용 | C | 없음 — policy JA 콘텐츠 분리 |
| H459 | `src/content/policies.ts:62` | 모욕, 비방, 협박 또는 괴롭힘 | C | 없음 — policy JA 콘텐츠 분리 |
| H460 | `src/content/policies.ts:63` | 불법 콘텐츠 또는 타인의 권리를 침해하는 콘텐츠 게시 | C | 없음 — policy JA 콘텐츠 분리 |
| H461 | `src/content/policies.ts:64` | 허위정보, 광고, 도배 등 정상적인 서비스 이용 방해 | C | 없음 — policy JA 콘텐츠 분리 |
| H462 | `src/content/policies.ts:65` | 시스템의 정상적인 운영 방해 | C | 없음 — policy JA 콘텐츠 분리 |
| H463 | `src/content/policies.ts:66` | 허가 없는 서비스 정보 대량 수집·복제 | C | 없음 — policy JA 콘텐츠 분리 |
| H464 | `src/content/policies.ts:67` | 관련 법령 또는 이용약관 위반 | C | 없음 — policy JA 콘텐츠 분리 |
| H465 | `src/content/policies.ts:71` | 제6조 팝업 및 장소 정보 | C | 없음 — policy JA 콘텐츠 분리 |
| H466 | `src/content/policies.ts:73` | 팝업 및 장소 정보는 공식 채널, 공개 자료 또는 확인 가능한 정보를 바탕으로 제공될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H467 | `src/content/policies.ts:74` | 일정, 운영시간, 입장 방법, 예약, 가격, 이벤트 등의 정보는 주최자 또는 장소 사정으로 변경될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H468 | `src/content/policies.ts:75` | 서비스는 정확한 정보를 제공하기 위해 노력하지만 모든 정보의 정확성이나 최신성을 항상 보장하지는 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H469 | `src/content/policies.ts:76` | 중요한 방문 또는 예약 전에는 공식 채널의 최신 정보를 확인하는 것을 권장합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H470 | `src/content/policies.ts:80` | 제7조 서비스 변경 및 중단 | C | 없음 — policy JA 콘텐츠 분리 |
| H471 | `src/content/policies.ts:81` | 서비스 개선, 점검, 장애, 보안 문제 또는 외부 서비스 변경 등 필요한 경우 서비스의 일부 또는 전부가 변경되거나 일시적으로 중단될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H472 | `src/content/policies.ts:84` | 제8조 회원탈퇴 | C | 없음 — policy JA 콘텐츠 분리 |
| H473 | `src/content/policies.ts:86` | 회원은 언제든지 회원탈퇴를 요청할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H474 | `src/content/policies.ts:87` | 탈퇴 시 계정 개인정보 및 인증정보는 삭제 또는 익명화됩니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H475 | `src/content/policies.ts:88` | 질문·자유 게시글은 삭제되며 해당 글의 이미지, 댓글 및 대댓글도 함께 삭제될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H476 | `src/content/policies.ts:89` | 방문 리뷰는 탈퇴 후에도 유지될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H477 | `src/content/policies.ts:90` | 다른 이용자의 유지되는 게시물에 작성한 댓글·대댓글도 유지될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H478 | `src/content/policies.ts:91` | 유지되는 콘텐츠의 작성자는 “탈퇴한 사용자”로 표시됩니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H479 | `src/content/policies.ts:92` | 관심 팝업과 회원이 누른 좋아요 등 개인 활동 정보는 삭제됩니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H480 | `src/content/policies.ts:93` | 동일 이메일 또는 Google 계정으로 다시 가입할 수 있지만 새로운 계정으로 처리됩니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H481 | `src/content/policies.ts:94` | 기존 콘텐츠는 새 계정에 다시 연결되지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H482 | `src/content/policies.ts:95` | 삭제된 정보는 복구할 수 없습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H483 | `src/content/policies.ts:99` | 제9조 책임 및 외부 서비스 | C | 없음 — policy JA 콘텐츠 분리 |
| H484 | `src/content/policies.ts:101` | 안정적인 서비스와 정확한 정보 제공을 위해 노력합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H485 | `src/content/policies.ts:102` | 외부 홈페이지, 예약 서비스, SNS, 지도 등은 해당 서비스 제공자의 정책에 따라 운영됩니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H486 | `src/content/policies.ts:103` | 이용자가 작성한 게시물에 대한 책임은 원칙적으로 해당 작성자에게 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H487 | `src/content/policies.ts:104` | 관련 법령상 운영자의 책임을 부당하게 제한하지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H488 | `src/content/policies.ts:108` | 제10조 개인정보 보호 | C | 없음 — policy JA 콘텐츠 분리 |
| H489 | `src/content/policies.ts:109` | 개인정보 처리에 관한 자세한 내용은 개인정보처리방침을 따릅니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H490 | `src/content/policies.ts:112` | 제11조 약관 변경 | C | 없음 — policy JA 콘텐츠 분리 |
| H491 | `src/content/policies.ts:113` | 약관의 중요한 변경이 있는 경우 서비스 내 공지 등 이용자가 확인할 수 있는 방법으로 안내합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H492 | `src/content/policies.ts:116` | 제12조 준거법 | C | 없음 — policy JA 콘텐츠 분리 |
| H493 | `src/content/policies.ts:117` | 서비스 및 약관에는 대한민국 법령을 적용합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H494 | `src/content/policies.ts:122` | 개인정보처리방침 | C | 없음 — policy JA 콘텐츠 분리 |
| H495 | `src/content/policies.ts:126` | 1. 처리하는 개인정보와 목적 | C | 없음 — policy JA 콘텐츠 분리 |
| H496 | `src/content/policies.ts:127` | ${SERVICE_NAME}(이하 “서비스”)는 다음 정보를 처리합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H497 | `src/content/policies.ts:129` | 이메일 회원가입: 이메일, 비밀번호, 닉네임 | C | 없음 — policy JA 콘텐츠 분리 |
| H498 | `src/content/policies.ts:130` | Google 로그인: 이메일, Google 계정 식별정보 | C | 없음 — policy JA 콘텐츠 분리 |
| H499 | `src/content/policies.ts:131` | 서비스 이용 과정: 관심 팝업, 질문·자유 게시글, 방문 리뷰 및 별점, 댓글·대댓글, 좋아요, 업로드 이미지, 문의·신고·장소 정보 수정 요청 내용 | C | 없음 — policy JA 콘텐츠 분리 |
| H500 | `src/content/policies.ts:132` | 처리 목적: 회원가입 및 로그인, 계정 관리, 이메일 인증, 서비스 기능 제공, 회원탈퇴 처리, 문의·신고·정보 수정 요청 처리 | C | 없음 — policy JA 콘텐츠 분리 |
| H501 | `src/content/policies.ts:136` | 2. 위치정보 이용 | C | 없음 — policy JA 콘텐츠 분리 |
| H502 | `src/content/policies.ts:138` | 지도에서 현재 위치를 표시하거나 주변 장소를 탐색하기 위해 기기 위치 권한을 사용할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H503 | `src/content/policies.ts:139` | 현재 위치 좌표를 서비스 자체 서버 또는 DB에 저장하지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H504 | `src/content/policies.ts:140` | 지속적인 백그라운드 위치 추적을 하지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H505 | `src/content/policies.ts:141` | Google Maps 등 외부 지도 서비스가 기능 제공 과정에서 위치정보를 처리할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H506 | `src/content/policies.ts:145` | 3. 보유 및 이용기간 | C | 없음 — policy JA 콘텐츠 분리 |
| H507 | `src/content/policies.ts:147` | 회원정보는 회원탈퇴 시까지 보유합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H508 | `src/content/policies.ts:148` | 회원탈퇴 시 이메일, 비밀번호, Google 계정 연결정보, 닉네임, 인증정보를 삭제 또는 익명화합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H509 | `src/content/policies.ts:149` | 질문·자유 게시글은 탈퇴 시 삭제하며 해당 게시글 이미지·댓글·대댓글도 함께 삭제될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H510 | `src/content/policies.ts:150` | 방문 리뷰는 탈퇴 후 유지될 수 있으며 작성자는 “탈퇴한 사용자”로 표시합니다. 리뷰 이미지도 리뷰와 함께 유지될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H511 | `src/content/policies.ts:151` | 다른 사람의 유지되는 게시물에 작성한 댓글·대댓글은 유지될 수 있으며 작성자는 “탈퇴한 사용자”로 표시합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H512 | `src/content/policies.ts:152` | 관심 팝업·좋아요는 탈퇴 시 삭제합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H513 | `src/content/policies.ts:153` | 문의는 탈퇴 시 삭제합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H514 | `src/content/policies.ts:154` | 신고·장소 정보 수정 요청 내용은 유지될 수 있으며 탈퇴 회원과의 계정 연결정보는 제거합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H515 | `src/content/policies.ts:158` | 4. 개인정보 파기 | C | 없음 — policy JA 콘텐츠 분리 |
| H516 | `src/content/policies.ts:160` | 개인정보가 더 이상 필요하지 않은 경우 관련 법령 및 서비스 정책에 따라 삭제 또는 익명화합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H517 | `src/content/policies.ts:161` | 이미지 등 별도 파일 저장소의 데이터는 콘텐츠 삭제 정책에 따라 삭제합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H518 | `src/content/policies.ts:162` | 시스템 또는 저장소 오류가 있는 경우 실제 파일 삭제가 지연될 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H519 | `src/content/policies.ts:166` | 5. 외부 서비스 | C | 없음 — policy JA 콘텐츠 분리 |
| H520 | `src/content/policies.ts:167` | 일반 회원의 게시글·방문 리뷰·댓글을 자동으로 OpenAI에 전송하지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H521 | `src/content/policies.ts:169` | AWS: 게시글·리뷰 이미지 저장 | C | 없음 — policy JA 콘텐츠 분리 |
| H522 | `src/content/policies.ts:170` | Resend: 이메일 인증 | C | 없음 — policy JA 콘텐츠 분리 |
| H523 | `src/content/policies.ts:171` | Google: 로그인, 지도, 장소 검색, 주소·좌표 처리 | C | 없음 — policy JA 콘텐츠 분리 |
| H524 | `src/content/policies.ts:172` | OpenAI: 관리자가 팝업 정보를 등록·관리할 때 정보 정리 또는 번역 보조 | C | 없음 — policy JA 콘텐츠 분리 |
| H525 | `src/content/policies.ts:176` | 6. 이용자의 권리 | C | 없음 — policy JA 콘텐츠 분리 |
| H526 | `src/content/policies.ts:177` | 이용자는 관련 법령에 따라 개인정보의 열람, 정정, 삭제, 처리정지, 동의 철회 및 회원탈퇴 등을 요청할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H527 | `src/content/policies.ts:180` | 7. 개인정보 보호 | C | 없음 — policy JA 콘텐츠 분리 |
| H528 | `src/content/policies.ts:181` | 비밀번호 및 인증정보 보호, 접근 통제 등 서비스 규모에 필요한 보호조치를 적용합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H529 | `src/content/policies.ts:184` | 8. 방침 변경 | C | 없음 — policy JA 콘텐츠 분리 |
| H530 | `src/content/policies.ts:185` | 중요한 변경이 있는 경우 서비스 내 공지 등으로 안내합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H531 | `src/content/policies.ts:190` | 위치기반서비스 이용약관 | C | 없음 — policy JA 콘텐츠 분리 |
| H532 | `src/content/policies.ts:194` | 제1조 목적 | C | 없음 — policy JA 콘텐츠 분리 |
| H533 | `src/content/policies.ts:195` | 이 약관은 ${SERVICE_NAME}(이하 “서비스”)의 위치기반 기능 이용과 관련된 필요한 사항을 정합니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H534 | `src/content/policies.ts:198` | 제2조 위치기반 기능 | C | 없음 — policy JA 콘텐츠 분리 |
| H535 | `src/content/policies.ts:200` | 기기의 위치정보를 이용하여 다음 기능을 제공할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H536 | `src/content/policies.ts:201` | 현재 위치를 지속적으로 추적하지 않으며 현재 위치 좌표를 서비스 자체 서버 또는 DB에 저장하지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H537 | `src/content/policies.ts:204` | 지도에서 현재 위치 표시 | C | 없음 — policy JA 콘텐츠 분리 |
| H538 | `src/content/policies.ts:205` | 현재 위치로 지도 이동 | C | 없음 — policy JA 콘텐츠 분리 |
| H539 | `src/content/policies.ts:206` | 현재 위치를 기준으로 주변 팝업 및 장소 탐색 | C | 없음 — policy JA 콘텐츠 분리 |
| H540 | `src/content/policies.ts:210` | 제3조 위치 권한 | C | 없음 — policy JA 콘텐츠 분리 |
| H541 | `src/content/policies.ts:212` | 위치기반 기능은 이용자가 기기의 위치 권한을 허용한 경우 사용할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H542 | `src/content/policies.ts:213` | 이용자는 기기 설정에서 언제든지 위치 권한을 변경하거나 철회할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H543 | `src/content/policies.ts:214` | 위치 권한을 허용하지 않아도 위치기반 기능을 제외한 다른 서비스 기능은 이용할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H544 | `src/content/policies.ts:218` | 제4조 위치정보 보유 | C | 없음 — policy JA 콘텐츠 분리 |
| H545 | `src/content/policies.ts:220` | 현재 위치 좌표 또는 이동경로를 서비스 자체 서버·DB에 저장하지 않습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H546 | `src/content/policies.ts:221` | Google Maps 등 외부 지도 서비스는 자체 정책에 따라 위치정보를 처리할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H547 | `src/content/policies.ts:225` | 제5조 제3자 제공 | C | 없음 — policy JA 콘텐츠 분리 |
| H548 | `src/content/policies.ts:226` | 현재 이용자의 개인위치정보를 다른 이용자에게 제공하는 기능은 없습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H549 | `src/content/policies.ts:229` | 제6조 이용자의 권리 | C | 없음 — policy JA 콘텐츠 분리 |
| H550 | `src/content/policies.ts:230` | 이용자는 언제든지 기기 설정을 통해 위치 권한을 변경하거나 철회할 수 있습니다. | C | 없음 — policy JA 콘텐츠 분리 |
| H551 | `src/content/policies.ts:233` | 제7조 변경 | C | 없음 — policy JA 콘텐츠 분리 |
| H552 | `src/content/policies.ts:234` | 위치정보 처리 방식에 중요한 변경이 있는 경우 필요한 내용을 안내합니다. | C | 없음 — policy JA 콘텐츠 분리 |

### src/lib/accountPolicy.ts — 4건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H553 | `src/lib/accountPolicy.ts:15` | 현재 비밀번호를 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H554 | `src/lib/accountPolicy.ts:16` | 새 비밀번호는 영문과 숫자를 포함한 8~72자의 공백 없는 영문·숫자·기호여야 해요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H555 | `src/lib/accountPolicy.ts:17` | 새 비밀번호와 확인값이 일치하지 않아요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H556 | `src/lib/accountPolicy.ts:18` | 현재 비밀번호와 다른 비밀번호를 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/lib/accountSettings.ts — 8건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H557 | `src/lib/accountSettings.ts:54` | 로그인이 만료됐어요. 다시 로그인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H558 | `src/lib/accountSettings.ts:55` | 이미 사용 중인 닉네임이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H559 | `src/lib/accountSettings.ts:56` | 현재 비밀번호가 일치하지 않아요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H560 | `src/lib/accountSettings.ts:57` | 새 비밀번호와 확인값이 일치하지 않아요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H561 | `src/lib/accountSettings.ts:58` | 현재 비밀번호와 다른 비밀번호를 입력해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H562 | `src/lib/accountSettings.ts:59` | 소셜 로그인 계정은 비밀번호를 변경할 수 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H563 | `src/lib/accountSettings.ts:60` | 입력값과 형식을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H564 | `src/lib/accountSettings.ts:62` | 저장하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/lib/auth.ts — 3건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H565 | `src/lib/auth.ts:87` | 사용자 정보를 불러오지 못했습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H566 | `src/lib/auth.ts:116` | 이메일 또는 비밀번호를 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H567 | `src/lib/auth.ts:121` | 로그인 응답에 토큰이 없습니다. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/lib/googleAuth.ts — 4건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H568 | `src/lib/googleAuth.ts:29` | 로그인 응답을 확인하지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H569 | `src/lib/googleAuth.ts:93` | Google 로그인 설정을 확인해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H570 | `src/lib/googleAuth.ts:118` | Google 인증 정보를 받지 못했어요. 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H636 | `src/lib/googleAuth.ts:18` | Google authentication request failed | C | 없음 — 오류 code→localized 안내 |

### src/lib/inquiries.ts — 6건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H571 | `src/lib/inquiries.ts:4` | 일반 문의 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H572 | `src/lib/inquiries.ts:4` | 오류 신고 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H573 | `src/lib/inquiries.ts:4` | 정보 수정 요청 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H574 | `src/lib/inquiries.ts:4` | 기타 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H575 | `src/lib/inquiries.ts:7` | 답변 대기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H576 | `src/lib/inquiries.ts:7` | 답변 완료 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/lib/notices.ts — 4건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H577 | `src/lib/notices.ts:3` | 일반 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H578 | `src/lib/notices.ts:3` | 업데이트 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H579 | `src/lib/notices.ts:3` | 이벤트 | B | `place.filters.eventTypes.event` |
| H580 | `src/lib/notices.ts:3` | 이용 안내 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/lib/popupStatus.ts — 3건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H581 | `src/lib/popupStatus.ts:14` | 오픈 예정 | B | `place.filters.operationStatuses.upcoming` |
| H582 | `src/lib/popupStatus.ts:15` | 종료 | B | `place.all.ended`, `place.filters.operationStatuses.closed` |
| H583 | `src/lib/popupStatus.ts:16` | 운영 중 | B | `place.filters.operationStatuses.open` |

### src/screens/CommunityScreen.tsx — 8건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H584 | `src/screens/CommunityScreen.tsx:70` | 화면을 열지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H585 | `src/screens/CommunityScreen.tsx:70` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H586 | `src/screens/CommunityScreen.tsx:304` | 좋아요를 변경하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H587 | `src/screens/CommunityScreen.tsx:305` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H588 | `src/screens/CommunityScreen.tsx:341` | 게시글을 불러오지 못했어요 | B | `community.detail.failed` |
| H589 | `src/screens/CommunityScreen.tsx:341` | 아직 게시글이 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H590 | `src/screens/CommunityScreen.tsx:345` | 다시 시도 | B | `community.detail.retry` |
| H591 | `src/screens/CommunityScreen.tsx:362` | 다시 시도 | B | `community.detail.retry` |

### src/screens/MapScreen.native.tsx — 26건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H592 | `src/screens/MapScreen.native.tsx:92` | 전체 | B | `community.category.all` |
| H593 | `src/screens/MapScreen.native.tsx:93` | 캐릭터/IP | B | `place.filters.interests.animeCharacter` |
| H594 | `src/screens/MapScreen.native.tsx:94` | 게임/디지털 | B | `place.filters.interests.game` |
| H595 | `src/screens/MapScreen.native.tsx:95` | 연예/크리에이터 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H596 | `src/screens/MapScreen.native.tsx:96` | 패션 | B | `place.filters.interests.fashion` |
| H597 | `src/screens/MapScreen.native.tsx:97` | 뷰티 | B | `place.filters.interests.beauty` |
| H598 | `src/screens/MapScreen.native.tsx:99` | 아트/전시 | B | `place.filters.interests.exhibitionArt` |
| H599 | `src/screens/MapScreen.native.tsx:100` | 문구/소품 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H600 | `src/screens/MapScreen.native.tsx:101` | 라이프 | B | `place.filters.interests.lifestyle` |
| H601 | `src/screens/MapScreen.native.tsx:102` | 패밀리/펫 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H602 | `src/screens/MapScreen.native.tsx:103` | 기타 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H603 | `src/screens/MapScreen.native.tsx:412` | 위치를 불러올 수 없어요. 다시 선택해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H604 | `src/screens/MapScreen.native.tsx:432` | 팝업을 불러올 수 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H605 | `src/screens/MapScreen.native.tsx:432` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H606 | `src/screens/MapScreen.native.tsx:437` | 팝업을 찾을 수 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H607 | `src/screens/MapScreen.native.tsx:437` | 목록을 새로고침한 뒤 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H608 | `src/screens/MapScreen.native.tsx:524` | 위치 권한 필요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H609 | `src/screens/MapScreen.native.tsx:524` | 현재 위치를 보려면 위치 권한을 허용해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H610 | `src/screens/MapScreen.native.tsx:539` | 위치를 찾을 수 없어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H611 | `src/screens/MapScreen.native.tsx:539` | 위치 서비스를 확인한 뒤 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H612 | `src/screens/MapScreen.native.tsx:824` | 장소나 팝업을 검색해보세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H613 | `src/screens/MapScreen.native.tsx:830` | 검색어 지우기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H614 | `src/screens/MapScreen.native.tsx:836` | 취소 | B | `community.cancel` |
| H615 | `src/screens/MapScreen.native.tsx:886` | 현재 위치로 이동 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H616 | `src/screens/MapScreen.native.tsx:917` | 지도로 돌아가기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H617 | `src/screens/MapScreen.native.tsx:917` | 이 지역 팝업 ${visiblePopups.length}개 보기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/screens/PlaceScreen.tsx — 14건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H618 | `src/screens/PlaceScreen.tsx:43` | 탐색 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H619 | `src/screens/PlaceScreen.tsx:43` | 전체 | B | `community.category.all` |
| H620 | `src/screens/PlaceScreen.tsx:257` | 팝업을 불러오는 중이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H621 | `src/screens/PlaceScreen.tsx:258` | 팝업을 불러오지 못했어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H622 | `src/screens/PlaceScreen.tsx:258` | 표시할 팝업이 없어요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H623 | `src/screens/PlaceScreen.tsx:392` | 플레이스 | B | `place.title` |
| H624 | `src/screens/PlaceScreen.tsx:407` | 팝업을 불러오는 중이에요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H625 | `src/screens/PlaceScreen.tsx:410` | 다시 시도 | B | `community.detail.retry` |
| H626 | `src/screens/PlaceScreen.tsx:454` | 팝업 검색 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H627 | `src/screens/PlaceScreen.tsx:455` | 팝업을 검색해보세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H628 | `src/screens/PlaceScreen.tsx:464` | 검색어 지우기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H629 | `src/screens/PlaceScreen.tsx:549` | 팝업 검색 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H630 | `src/screens/PlaceScreen.tsx:550` | 팝업을 검색해보세요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H631 | `src/screens/PlaceScreen.tsx:559` | 검색어 지우기 | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### src/hooks/usePopupFavorites.ts — 2건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H632 | `src/hooks/usePopupFavorites.ts:70` | 찜을 변경하지 못했어요 | C | 없음 — 기존 namespace/common에 문장 key 필요 |
| H633 | `src/hooks/usePopupFavorites.ts:70` | 잠시 후 다시 시도해 주세요. | C | 없음 — 기존 namespace/common에 문장 key 필요 |

### app.json — 2건

| ID | 실제 사용 위치 | 원문 또는 문장틀 | 분류 | 대응 기존 key / 조치 |
| --- | --- | --- | --- | --- |
| H634 | `app.json:14` | 현재 위치 주변의 팝업을 찾기 위해 위치 정보가 필요합니다. | C | 없음 — native locale별 권한문구 |
| H635 | `app.json:52` | 게시글에 사진을 첨부하기 위해 사진 라이브러리 접근이 필요합니다. | C | 없음 — native locale별 권한문구 |

### 내부·비노출 문자열 제외 검증

| 제외 묶음 | 근거 | 이유 |
| --- | --- | --- |
| placeFilters의 KO label45개 | `src/constants/placeFilters.ts:4–245`; 활성 소비 `QuickFilterBar.tsx:48`, `PlaceRegionSection.tsx:20,121` | labelKey를 번역하는 현재 소비자와 KO metadata literal을 구분 |
| popup mock10개·HomeQuickMenu7개 | `src/constants/placePopupMocks.ts:153–180`, `src/components/home/HomeQuickMenu.tsx:26–32` | 활성 import/렌더 없음. RegionMocks는 활성 소비가 있으므로 예외 |
| type/status style·tab 비교 | `src/lib/popupStatus.ts:1`; `MapScreen.native.tsx:106,114–130,194,209`; `PlaceScreen.tsx:73–80,189–219` | 내부 상태값·style key. 실제 label 정의 및 status 반환은 별도 B/C로 집계 |
| 이미 다른 화면 오류로 대체되는 lib 오류 | `src/lib/auth.ts:150,191` → `withdrawal.tsx:48`, `settings.tsx:40` | literal error.message를 그대로 사용자에게 표시하지 않음; 실제 Alert 문구는 집계 |
| template 내부 variant | `AccountSettingsScreen.tsx:24` | '숨기기/표시'는 완전한 template 한 row에서 조사, 원문 조각을 이중 합산 안 함 |
| web 전용 안내 | `src/screens/MapScreen.web.tsx:8` | 한국어 hardcode 확인했지만 native28 route 집계 밖; web 출시 시 대상에 추가 |
| 주석/로그/API/identifier/test | 구문 노드와 실제 표시 경로로 구분 | 한글 regex 결과를 그대로 번역 목록으로 쓰지 않음 |

## 5. 누락 번역 키 목록

### 5.1 기존 key 기준 일본어 누락117개

**키 없음4개**는 KO와 JA path 자체가 다르고, **빈 값113개**는 path는 있지만 번역이 없다. 활성 사용 가능107개 가운데 아래60개가 포함된다. 미사용 키라도 resource 비교에서는 포함하되 실제 적용 순서는 활성 경로를 우선한다.

| key | KO 원문(긴 mock 축약) | KO 줄 / JA 줄 | JA 상태 | 코드 소비 |
| --- | --- | --- | --- | --- |
| `community.attachImage` | 이미지 첨부 | `src/locales/ko.json:189` / `src/locales/ja.json:187` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.category.all` | 전체 | `src/locales/ko.json:199` / `src/locales/ja.json:197` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.category.free` | 자유 | `src/locales/ko.json:203` / 없음 | 키 부재 | 호출/동적 소비 확인(§3.2) |
| `community.category.info` | 현장 정보 | `src/locales/ko.json:201` / `src/locales/ja.json:199` | 빈 값 | D(§6) |
| `community.category.question` | 질문 | `src/locales/ko.json:202` / `src/locales/ja.json:200` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.category.review` | 방문 후기 | `src/locales/ko.json:200` / `src/locales/ja.json:198` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.mock.body.busanInfo` | 부산 팝업 현장에서는 오후부터 입장 대기가 조금 늘었어요. 포토존은 안쪽에 있고, 안내 데스크에서 운영 시간을 다시 … | `src/locales/ko.json:225` / `src/locales/ja.json:219` | 빈 값 | D(§6) |
| `community.mock.body.hongdaeQuestion` | 홍대 패션 스튜디오 팝업은 예약 없이 방문해도 입장할 수 있나요? 이번 주말에 가려고 하는데 현장 대기가 어느 정도인… | `src/locales/ko.json:222` / `src/locales/ja.json:216` | 빈 값 | D(§6) |
| `community.mock.body.kyotoQuestion` | 교토에서 이번 주에 가볼 만한 캐릭터 팝업이 있을까요? 장소는 아직 정하지 않았어요. 이동하기 편한 곳이면 좋겠습니다… | `src/locales/ko.json:224` / `src/locales/ja.json:218` | 빈 값 | D(§6) |
| `community.mock.body.osakaReview` | 오사카 뷰티 마켓 팝업에서 체험 코너를 둘러봤어요. 제품을 직접 비교해 볼 수 있고 직원 안내도 친절해서 만족스러웠습… | `src/locales/ko.json:223` / `src/locales/ja.json:217` | 빈 값 | D(§6) |
| `community.mock.body.seongsuReview` | 성수 컬러 아트 팝업 다녀왔어요! 전시 동선이 잘 되어 있고 직접 참여할 수 있는 공간도 많아서 즐거웠어요. 주말에는… | `src/locales/ko.json:220` / `src/locales/ja.json:214` | 빈 값 | D(§6) |
| `community.mock.body.tokyoInfo` | 도쿄 게임 월드 팝업 현장 대기 줄은 지금 건물 오른쪽으로 이어져 있어요. 입장 안내는 현장 직원분이 차례로 해 주시… | `src/locales/ko.json:221` / `src/locales/ja.json:215` | 빈 값 | D(§6) |
| `community.mock.place.longTokyo` | 도쿄 게임 월드 애니메이션 캐릭터 콜라보레이션 팝업스토어 | `src/locales/ko.json:217` / `src/locales/ja.json:212` | 빈 값 | D(§6) |
| `community.register` | 등록하기 | `src/locales/ko.json:184` / `src/locales/ja.json:182` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.registering` | 등록 중 | `src/locales/ko.json:185` / `src/locales/ja.json:183` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.reviewFilterLabel` | 방문 리뷰 | `src/locales/ko.json:205` / 없음 | 키 부재 | 호출/동적 소비 확인(§3.2) |
| `community.settings` | 설정 | `src/locales/ko.json:181` / `src/locales/ja.json:179` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.sort.latest` | 최신순 | `src/locales/ko.json:207` / `src/locales/ja.json:203` | 빈 값 | D(§6) |
| `community.sort.popular` | 인기순 | `src/locales/ko.json:208` / `src/locales/ja.json:204` | 빈 값 | D(§6) |
| `community.time.daysAgo` | {count}일 전 | `src/locales/ko.json:213` / `src/locales/ja.json:209` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.time.hoursAgo` | {count}시간 전 | `src/locales/ko.json:212` / `src/locales/ja.json:208` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.time.minutesAgo` | {count}분 전 | `src/locales/ko.json:211` / `src/locales/ja.json:207` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.title` | 커뮤니티 | `src/locales/ko.json:180` / `src/locales/ja.json:178` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.views` | 조회 {count} | `src/locales/ko.json:197` / `src/locales/ja.json:195` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.write` | 글쓰기 | `src/locales/ko.json:182` / `src/locales/ja.json:180` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.writeBack` | 뒤로가기 | `src/locales/ko.json:183` / `src/locales/ja.json:181` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.writeContent` | 본문 | `src/locales/ko.json:187` / `src/locales/ja.json:185` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.writeFailed` | 게시글 등록에 실패했어요. 잠시 후 다시 시도해 주세요. | `src/locales/ko.json:186` / `src/locales/ja.json:184` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `community.writePlaceholder` | 내용을 입력해 주세요. | `src/locales/ko.json:188` / `src/locales/ja.json:186` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `home.title` | 메인 홈 | `src/locales/ko.json:4` / `src/locales/ja.json:4` | 빈 값 | D(§6) |
| `map.title` | 지도 | `src/locales/ko.json:151` / `src/locales/ja.json:149` | 빈 값 | D(§6) |
| `my.title` | 마이페이지 | `src/locales/ko.json:230` / `src/locales/ja.json:224` | 빈 값 | D(§6) |
| `place.all.addFavorite` | 찜하기 | `src/locales/ko.json:69` / `src/locales/ja.json:67` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.ended` | 종료 | `src/locales/ko.json:68` / `src/locales/ja.json:66` | 빈 값 | D(§6) |
| `place.all.endsOn` | {date}까지 | `src/locales/ko.json:67` / `src/locales/ja.json:65` | 빈 값 | D(§6) |
| `place.all.mock.busanLifestyle` | 부산 라이프스타일 팝업 | `src/locales/ko.json:76` / `src/locales/ja.json:74` | 빈 값 | D(§6) |
| `place.all.mock.hongdaeFashion` | 홍대 패션 스튜디오 팝업 | `src/locales/ko.json:74` / `src/locales/ja.json:72` | 빈 값 | D(§6) |
| `place.all.mock.kyotoCharacter` | 교토 캐릭터 전시 팝업 | `src/locales/ko.json:77` / `src/locales/ja.json:75` | 빈 값 | D(§6) |
| `place.all.mock.osakaBeauty` | 오사카 뷰티 마켓 팝업 | `src/locales/ko.json:75` / `src/locales/ja.json:73` | 빈 값 | D(§6) |
| `place.all.mock.seongsuArt` | 성수 컬러 아트 팝업 | `src/locales/ko.json:72` / `src/locales/ja.json:70` | 빈 값 | D(§6) |
| `place.all.mock.tokyoGame` | 도쿄 게임 월드 팝업 | `src/locales/ko.json:73` / `src/locales/ja.json:71` | 빈 값 | D(§6) |
| `place.all.opensOn` | {date} 오픈 | `src/locales/ko.json:66` / `src/locales/ja.json:64` | 빈 값 | D(§6) |
| `place.all.period.all` | 기간 전체 | `src/locales/ko.json:60` / `src/locales/ja.json:58` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.period.custom` | 날짜 직접 선택 | `src/locales/ko.json:64` / `src/locales/ja.json:62` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.period.today` | 오늘 | `src/locales/ko.json:61` / `src/locales/ja.json:59` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.period.week` | 이번 주 | `src/locales/ko.json:62` / `src/locales/ja.json:60` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.period.weekend` | 이번 주말 | `src/locales/ko.json:63` / `src/locales/ja.json:61` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.removeFavorite` | 찜 해제 | `src/locales/ko.json:70` / `src/locales/ja.json:68` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.all.sort.latest` | 최신순 | `src/locales/ko.json:56` / `src/locales/ja.json:54` | 빈 값 | D(§6) |
| `place.all.sort.popular` | 인기순 | `src/locales/ko.json:57` / `src/locales/ja.json:55` | 빈 값 | D(§6) |
| `place.explore.back` | 뒤로 가기 | `src/locales/ko.json:51` / `src/locales/ja.json:49` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.explore.interests` | 취향 따라 찾아볼까요? | `src/locales/ko.json:44` / 없음 | 키 부재 | 호출/동적 소비 확인(§3.2) |
| `place.explore.interestsDescription` | 좋아하는 취향의 팝업을 골라 둘러보세요. | `src/locales/ko.json:45` / 없음 | 키 부재 | 호출/동적 소비 확인(§3.2) |
| `place.explore.japaneseRegionsDescription` | 도쿄부터 오사카까지, 일본의 팝업을 만나보세요! | `src/locales/ko.json:47` / `src/locales/ja.json:45` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.explore.koreanRegionsDescription` | 이번 주말, 한국의 핫한 동네로 떠나볼까요? | `src/locales/ko.json:46` / `src/locales/ja.json:44` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.explore.next` | 다음 팝업 | `src/locales/ko.json:50` / `src/locales/ja.json:48` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.explore.notFound` | 팝업 정보를 찾을 수 없습니다. | `src/locales/ko.json:52` / `src/locales/ja.json:50` | 빈 값 | D(§6) |
| `place.explore.previous` | 이전 팝업 | `src/locales/ko.json:49` / `src/locales/ja.json:47` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.explore.regions` | 어디로 놀러 갈까! | `src/locales/ko.json:43` / `src/locales/ja.json:43` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.explore.todayOpening` | 오늘 새로 열어요! | `src/locales/ko.json:42` / `src/locales/ja.json:42` | 빈 값 | D(§6) |
| `place.explore.viewDetails` | {title} 상세 보기 | `src/locales/ko.json:48` / `src/locales/ja.json:46` | 빈 값 | D(§6) |
| `place.filters.close` | 필터 닫기 | `src/locales/ko.json:140` / `src/locales/ja.json:138` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.collapse` | 접기 | `src/locales/ko.json:144` / `src/locales/ja.json:142` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.collapseRegions` | 지역 접기 | `src/locales/ko.json:145` / `src/locales/ja.json:143` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.countries.jp` | 일본 | `src/locales/ko.json:83` / `src/locales/ja.json:81` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.countries.kr` | 한국 | `src/locales/ko.json:82` / `src/locales/ja.json:80` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.details` | 상세 필터 | `src/locales/ko.json:139` / `src/locales/ja.json:137` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.eventTypes._label` | 행사 유형 | `src/locales/ko.json:90` / `src/locales/ja.json:88` | 빈 값 | D(§6) |
| `place.filters.eventTypes.event` | 이벤트 | `src/locales/ko.json:95` / `src/locales/ja.json:93` | 빈 값 | D(§6) |
| `place.filters.eventTypes.exhibition` | 전시 | `src/locales/ko.json:92` / `src/locales/ja.json:90` | 빈 값 | D(§6) |
| `place.filters.eventTypes.festival` | 페스티벌 | `src/locales/ko.json:94` / `src/locales/ja.json:92` | 빈 값 | D(§6) |
| `place.filters.eventTypes.performance` | 공연 | `src/locales/ko.json:93` / `src/locales/ja.json:91` | 빈 값 | D(§6) |
| `place.filters.eventTypes.popup` | 팝업 | `src/locales/ko.json:91` / `src/locales/ja.json:89` | 빈 값 | D(§6) |
| `place.filters.interests._label` | 관심 분야 | `src/locales/ko.json:124` / `src/locales/ja.json:122` | 빈 값 | D(§6) |
| `place.filters.interests.animeCharacter` | 캐릭터/IP | `src/locales/ko.json:125` / `src/locales/ja.json:123` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.interests.beauty` | 뷰티 | `src/locales/ko.json:128` / `src/locales/ja.json:126` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.interests.exhibitionArt` | 아트/전시 | `src/locales/ko.json:130` / `src/locales/ja.json:128` | 빈 값 | D(§6) |
| `place.filters.interests.fashion` | 패션 | `src/locales/ko.json:127` / `src/locales/ja.json:125` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.interests.foodBeverage` | F&B | `src/locales/ko.json:129` / `src/locales/ja.json:127` | 빈 값 | D(§6) |
| `place.filters.interests.game` | 게임/디지털 | `src/locales/ko.json:126` / `src/locales/ja.json:124` | 빈 값 | D(§6) |
| `place.filters.interests.lifestyle` | 라이프 | `src/locales/ko.json:131` / `src/locales/ja.json:129` | 빈 값 | D(§6) |
| `place.filters.moreRegions` | 지역 {count}개 더 보기 | `src/locales/ko.json:146` / `src/locales/ja.json:144` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.operationStatuses._label` | 운영 상태 | `src/locales/ko.json:134` / `src/locales/ja.json:132` | 빈 값 | D(§6) |
| `place.filters.operationStatuses.closed` | 종료 | `src/locales/ko.json:137` / `src/locales/ja.json:135` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.operationStatuses.open` | 운영 중 | `src/locales/ko.json:135` / `src/locales/ja.json:133` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.operationStatuses.upcoming` | 오픈 예정 | `src/locales/ko.json:136` / `src/locales/ja.json:134` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.quick.benefit` | 혜택 | `src/locales/ko.json:87` / `src/locales/ja.json:85` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.quick.preReservation` | 사전예약 | `src/locales/ko.json:86` / `src/locales/ja.json:84` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions._label` | 지역 | `src/locales/ko.json:98` / `src/locales/ja.json:96` | 빈 값 | D(§6) |
| `place.filters.regions.busan` | 부산 | `src/locales/ko.json:104` / `src/locales/ja.json:102` | 빈 값 | D(§6) |
| `place.filters.regions.changwon` | 창원 | `src/locales/ko.json:113` / `src/locales/ja.json:111` | 빈 값 | D(§6) |
| `place.filters.regions.daegu` | 대구 | `src/locales/ko.json:106` / `src/locales/ja.json:104` | 빈 값 | D(§6) |
| `place.filters.regions.daejeon` | 대전 | `src/locales/ko.json:107` / `src/locales/ja.json:105` | 빈 값 | D(§6) |
| `place.filters.regions.fukuoka` | 후쿠오카 | `src/locales/ko.json:118` / `src/locales/ja.json:116` | 빈 값 | D(§6) |
| `place.filters.regions.gangnam` | 강남·서초 | `src/locales/ko.json:102` / `src/locales/ja.json:100` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.goyang` | 고양 | `src/locales/ko.json:110` / `src/locales/ja.json:108` | 빈 값 | D(§6) |
| `place.filters.regions.gwangju` | 광주 | `src/locales/ko.json:108` / `src/locales/ja.json:106` | 빈 값 | D(§6) |
| `place.filters.regions.hongdae` | 홍대·신촌 | `src/locales/ko.json:100` / `src/locales/ja.json:98` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.incheon` | 인천 | `src/locales/ko.json:105` / `src/locales/ja.json:103` | 빈 값 | D(§6) |
| `place.filters.regions.jamsil` | 잠실 | `src/locales/ko.json:103` / `src/locales/ja.json:101` | 빈 값 | D(§6) |
| `place.filters.regions.jeonju` | 전주 | `src/locales/ko.json:114` / `src/locales/ja.json:112` | 빈 값 | D(§6) |
| `place.filters.regions.kyoto` | 교토 | `src/locales/ko.json:117` / `src/locales/ja.json:115` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.nagoya` | 나고야 | `src/locales/ko.json:119` / `src/locales/ja.json:117` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.osaka` | 오사카 | `src/locales/ko.json:116` / `src/locales/ja.json:114` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.sapporo` | 삿포로 | `src/locales/ko.json:120` / `src/locales/ja.json:118` | 빈 값 | D(§6) |
| `place.filters.regions.seongsu` | 성수 | `src/locales/ko.json:99` / `src/locales/ja.json:97` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.suwon` | 수원 | `src/locales/ko.json:109` / `src/locales/ja.json:107` | 빈 값 | D(§6) |
| `place.filters.regions.tokyo` | 도쿄 | `src/locales/ko.json:115` / `src/locales/ja.json:113` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.ulsan` | 울산 | `src/locales/ko.json:112` / `src/locales/ja.json:110` | 빈 값 | D(§6) |
| `place.filters.regions.yeouido` | 여의도 | `src/locales/ko.json:101` / `src/locales/ja.json:99` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.regions.yokohama` | 요코하마 | `src/locales/ko.json:121` / `src/locales/ja.json:119` | 빈 값 | D(§6) |
| `place.filters.regions.yongin` | 용인 | `src/locales/ko.json:111` / `src/locales/ja.json:109` | 빈 값 | D(§6) |
| `place.filters.remove` | {label} 필터 삭제 | `src/locales/ko.json:147` / `src/locales/ja.json:145` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.reset` | 초기화 | `src/locales/ko.json:141` / `src/locales/ja.json:139` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.filters.resetAll` | 전체 초기화 | `src/locales/ko.json:142` / `src/locales/ja.json:140` | 빈 값 | D(§6) |
| `place.filters.showPopups` | 팝업 보기 | `src/locales/ko.json:143` / `src/locales/ja.json:141` | 빈 값 | 호출/동적 소비 확인(§3.2) |
| `place.title` | 플레이스 | `src/locales/ko.json:7` / `src/locales/ja.json:7` | 빈 값 | D(§6) |

### 5.2 코드 참조 누락과 신규 key 공백

- **코드에서 없는 KO key를 사용하는 확정 사례:0개.** t의 string 타입이 compile-time key 존재를 보장하지는 않는다. 유한 enum·상수 매핑·조건 분기를 추가 추적한 결과다.
- `t(filter?.labelKey ?? card.id)`, `t(regionLabelKeys.get(item.id) ?? item.id)`는 metadata가 불일치하면 raw id를 표시할 수 있으나 현재 네 카테고리/여덟 지역의 매핑은 존재한다. 이를 현재 확정 key typo로 집계하지 않았다(`PlaceInterestSection.tsx:54–58`, `PlaceRegionSection.tsx:20,114`).
- **현재 UI 문구에 key가 없는 source636 중 C562건**은 §4에서 '없음'으로 모두 표시했다. 반복/공통/정책 문단이 포함되므로 **562개의 신규 key가 꼭 필요하다는 뜻은 아니다.** 최소 문장 단위와 공유 가능한 label을 묶어 추가 key 수를 결정해야 한다.
- 우선 신규 namespace 후보: common의 retry/loading/back/save/confirm/cancel/delete, home 섹션·map 검색/시트·my 활동/문의/설정·auth form/error·reviews form/score·policy metadata. 구체적인 key 이름은 §11의 제안이며 이번 JSON에는 추가하지 않았다.

## 6. 사용되지 않는 번역 키

활성 t consumer와 선언된 dynamic 범위를 추적한 뒤 **62개**를 D로 분류했다. 상수에 key 문자열이 있거나 JSON에 같은 값이 있는 것만으로 사용 처리하지 않았다. 예: eventTypeFilters·placeFilterSections는 현재 UI active import가 없고, 대부분 지역 옵션은 API name으로 렌더한다. 아래 D 중 일부는 B 화면에 대응하므로 **삭제가 아니라 연결이 우선**이다.

| key | resource 위치(ko / ja) | 소비를 찾지 못한 이유·조치 |
| --- | --- | --- |
| `home.title` | `src/locales/ko.json:4` / `ja.json:4` | Tabs/화면 title은 같은 KO literal. B로 실제 연결 필요 |
| `place.title` | `src/locales/ko.json:7` / `ja.json:7` | Tabs/화면 title은 같은 KO literal. B로 실제 연결 필요 |
| `place.detail.basicInfo.reservationNone` | `src/locales/ko.json:21` / `ja.json:21` | 예약 유무 label의 실제 t 호출 없음; 현재 예약 UI는 날짜/링크 중심 |
| `place.detail.basicInfo.reservationAvailable` | `src/locales/ko.json:22` / `ja.json:22` | 예약 유무 label의 실제 t 호출 없음; 현재 예약 UI는 날짜/링크 중심 |
| `place.detail.basicInfo.copyAddress` | `src/locales/ko.json:26` / `ja.json:26` | 주소 복사 코드/아이콘은 있으나 이 번역의 UI/a11y 호출 없음 |
| `place.explore.todayOpening` | `src/locales/ko.json:42` / `ja.json:42` | 현재 섹션은 종료임박 '곧 끝나요'; 오늘오픈 key와 의미가 다름 |
| `place.explore.viewDetails` | `src/locales/ko.json:48` / `ja.json:46` | Home/찜 card a11y template가 hardcode(B). key 존재로 완료 취급 금지 |
| `place.explore.notFound` | `src/locales/ko.json:52` / `ja.json:50` | 현재 상세 오류 UI는 다른 문구; legacy/후속 사용 여부 확인 |
| `place.all.sort.latest` | `src/locales/ko.json:56` / `ja.json:54` | sort selector 현재 미노출; community state는LATEST. 미래 UI 준비인지 확인 |
| `place.all.sort.popular` | `src/locales/ko.json:57` / `ja.json:55` | sort selector 현재 미노출; community state는LATEST. 미래 UI 준비인지 확인 |
| `place.all.opensOn` | `src/locales/ko.json:66` / `ja.json:64` | 현재 card date formatting에서 이 t 호출 없음 |
| `place.all.endsOn` | `src/locales/ko.json:67` / `ja.json:65` | 현재 card date formatting에서 이 t 호출 없음 |
| `place.all.ended` | `src/locales/ko.json:68` / `ja.json:66` | status 반환/label은 한국어 literal(B). 문자열을 로직 ID로 쓰는 구조도 함께 정리 |
| `place.all.mock.seongsuArt` | `src/locales/ko.json:72` / `ja.json:70` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `place.all.mock.tokyoGame` | `src/locales/ko.json:73` / `ja.json:71` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `place.all.mock.hongdaeFashion` | `src/locales/ko.json:74` / `ja.json:72` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `place.all.mock.osakaBeauty` | `src/locales/ko.json:75` / `ja.json:73` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `place.all.mock.busanLifestyle` | `src/locales/ko.json:76` / `ja.json:74` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `place.all.mock.kyotoCharacter` | `src/locales/ko.json:77` / `ja.json:75` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `place.filters.eventTypes._label` | `src/locales/ko.json:90` / `ja.json:88` | eventTypeFilters/placeFilterSections의 active UI consumer 없음. 행사유형 화면을 새로 구현하라는 의미 아님 |
| `place.filters.eventTypes.popup` | `src/locales/ko.json:91` / `ja.json:89` | eventTypeFilters/placeFilterSections의 active UI consumer 없음. 행사유형 화면을 새로 구현하라는 의미 아님 |
| `place.filters.eventTypes.exhibition` | `src/locales/ko.json:92` / `ja.json:90` | eventTypeFilters/placeFilterSections의 active UI consumer 없음. 행사유형 화면을 새로 구현하라는 의미 아님 |
| `place.filters.eventTypes.performance` | `src/locales/ko.json:93` / `ja.json:91` | eventTypeFilters/placeFilterSections의 active UI consumer 없음. 행사유형 화면을 새로 구현하라는 의미 아님 |
| `place.filters.eventTypes.festival` | `src/locales/ko.json:94` / `ja.json:92` | eventTypeFilters/placeFilterSections의 active UI consumer 없음. 행사유형 화면을 새로 구현하라는 의미 아님 |
| `place.filters.eventTypes.event` | `src/locales/ko.json:95` / `ja.json:93` | eventTypeFilters/placeFilterSections의 active UI consumer 없음. 행사유형 화면을 새로 구현하라는 의미 아님 |
| `place.filters.regions._label` | `src/locales/ko.json:98` / `ja.json:96` | section heading은 같은 KO literal 또는 현재 group 미노출. parent key→_label 호출도 없음 |
| `place.filters.regions.jamsil` | `src/locales/ko.json:103` / `ja.json:101` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.busan` | `src/locales/ko.json:104` / `ja.json:102` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.incheon` | `src/locales/ko.json:105` / `ja.json:103` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.daegu` | `src/locales/ko.json:106` / `ja.json:104` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.daejeon` | `src/locales/ko.json:107` / `ja.json:105` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.gwangju` | `src/locales/ko.json:108` / `ja.json:106` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.suwon` | `src/locales/ko.json:109` / `ja.json:107` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.goyang` | `src/locales/ko.json:110` / `ja.json:108` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.yongin` | `src/locales/ko.json:111` / `ja.json:109` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.ulsan` | `src/locales/ko.json:112` / `ja.json:110` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.changwon` | `src/locales/ko.json:113` / `ja.json:111` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.jeonju` | `src/locales/ko.json:114` / `ja.json:112` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.fukuoka` | `src/locales/ko.json:118` / `ja.json:116` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.sapporo` | `src/locales/ko.json:120` / `ja.json:118` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.regions.yokohama` | `src/locales/ko.json:121` / `ja.json:119` | 현재 지역 배너8개에 포함 안 됨. filter API options는 name 직접 표시; future scope 확인 |
| `place.filters.interests._label` | `src/locales/ko.json:124` / `ja.json:122` | section heading은 같은 KO literal 또는 현재 group 미노출. parent key→_label 호출도 없음 |
| `place.filters.interests.game` | `src/locales/ko.json:126` / `ja.json:124` | 게임 card는 특별 분기 KO literal(B); t bypass |
| `place.filters.interests.foodBeverage` | `src/locales/ko.json:129` / `ja.json:127` | 현재4개 interest card 외 항목. API tag name/지도 KO literal과 구분 |
| `place.filters.interests.exhibitionArt` | `src/locales/ko.json:130` / `ja.json:128` | 현재4개 interest card 외 항목. API tag name/지도 KO literal과 구분 |
| `place.filters.interests.lifestyle` | `src/locales/ko.json:131` / `ja.json:129` | 현재4개 interest card 외 항목. API tag name/지도 KO literal과 구분 |
| `place.filters.operationStatuses._label` | `src/locales/ko.json:134` / `ja.json:132` | section heading은 같은 KO literal 또는 현재 group 미노출. parent key→_label 호출도 없음 |
| `place.filters.resetAll` | `src/locales/ko.json:142` / `ja.json:140` | 현재 UI는 reset key를 사용; 별도 resetAll consumer 없음 |
| `map.title` | `src/locales/ko.json:151` / `ja.json:149` | Tabs/화면 title은 같은 KO literal. B로 실제 연결 필요 |
| `community.commentCountWithUnit` | `src/locales/ko.json:154` / `ja.json:152` | 댓글 header는 literal+count. 기존 key로 문장 전체 연결 가능 |
| `community.compactCommentCount` | `src/locales/ko.json:155` / `ja.json:153` | 댓글 header는 literal+count. 기존 key로 문장 전체 연결 가능 |
| `community.category.info` | `src/locales/ko.json:201` / `ja.json:199` | 현재 category enum·쓰기/필터에 INFO 없음; historical resource |
| `community.sort.latest` | `src/locales/ko.json:207` / `ja.json:203` | sort selector 현재 미노출; community state는LATEST. 미래 UI 준비인지 확인 |
| `community.sort.popular` | `src/locales/ko.json:208` / `ja.json:204` | sort selector 현재 미노출; community state는LATEST. 미래 UI 준비인지 확인 |
| `community.mock.place.longTokyo` | `src/locales/ko.json:217` / `ja.json:212` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `community.mock.body.seongsuReview` | `src/locales/ko.json:220` / `ja.json:214` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `community.mock.body.tokyoInfo` | `src/locales/ko.json:221` / `ja.json:215` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `community.mock.body.hongdaeQuestion` | `src/locales/ko.json:222` / `ja.json:216` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `community.mock.body.osakaReview` | `src/locales/ko.json:223` / `ja.json:217` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `community.mock.body.kyotoQuestion` | `src/locales/ko.json:224` / `ja.json:218` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `community.mock.body.busanInfo` | `src/locales/ko.json:225` / `ja.json:219` | 미노출 mock 내용. 삭제/유지 결정은 별도; release UI 적용 우선순위 낮음 |
| `my.title` | `src/locales/ko.json:230` / `ja.json:224` | Tabs/화면 title은 같은 KO literal. B로 실제 연결 필요 |

dynamic t에서 임의 서버 문자열 전체를 key로 확장할 수 있는 경우를 완전히 정적으로 판별하는 데는 한계가 있다. 이번62개는 현재 선언 타입/상수/branch를 기준으로 한 소비 미발견 목록이며 런타임 호출 로그로 영구 미사용을 입증한 목록은 아니다. 미래 자동검증은 unresolved key를 별도 경고하고 자동 삭제하지 않아야 한다.

## 7. 동적 문자열 및 placeholder

### 7.1 KO/JA placeholder16개 전체

이름뿐 아니라 **동일 이름의 발생 횟수**까지 비교했다. {count}/{date}/{title}/{label}/{channel}/{index}를 포함한16개 key가 있다. raw 차이9개는 모두 JA 빈 값 때문이며, 비어 있지 않은 번역 쌍은 변수명·개수 일치한다.

| key / resource 줄 | KO 변수 | JA 변수 | 코드 params·판정 |
| --- | --- | --- | --- |
| `place.detail.officialChannelLink`<br>`ko.json:14`, `ja.json:14` | channel | channel | src/app/places/[id].tsx:768 { channel: officialChannelLabel(channel, t) } |
| `place.detail.basicInfo.reservationStart`<br>`ko.json:24`, `ja.json:24` | date | date | src/app/places/[id].tsx:401 {<br>        date: formatDateTime(detail.reservationStartAt),<br>      } |
| `place.detail.basicInfo.reservationEnd`<br>`ko.json:25`, `ja.json:25` | date | date | src/app/places/[id].tsx:405 {<br>        date: formatDateTime(detail.reservationEndAt),<br>      } |
| `place.explore.viewDetails`<br>`ko.json:48`, `ja.json:46` | title | 0 (빈 값) | D: params 전달할 실제 consumer 없음 |
| `place.all.opensOn`<br>`ko.json:66`, `ja.json:64` | date | 0 (빈 값) | D: params 전달할 실제 consumer 없음 |
| `place.all.endsOn`<br>`ko.json:67`, `ja.json:65` | date | 0 (빈 값) | D: params 전달할 실제 consumer 없음 |
| `place.filters.moreRegions`<br>`ko.json:146`, `ja.json:144` | count | 0 (빈 값) | src/components/place/RegionFilterGroup.tsx:138 { count: hiddenCount } |
| `place.filters.remove`<br>`ko.json:147`, `ja.json:145` | label | 0 (빈 값) | src/components/place/AppliedFilterBar.tsx:76 { label: chip.label } |
| `community.commentCountWithUnit`<br>`ko.json:154`, `ja.json:152` | count | count | D: params 전달할 실제 consumer 없음 |
| `community.compactCommentCount`<br>`ko.json:155`, `ja.json:153` | count | count | D: params 전달할 실제 consumer 없음 |
| `community.detail.image`<br>`ko.json:178`, `ja.json:176` | index | index | src/components/community/CommunityImageCarousel.tsx:31 { index: index + 1 } |
| `community.removeImage`<br>`ko.json:190`, `ja.json:188` | index | index | src/app/community/write.tsx:229 { index: index + 1 } |
| `community.views`<br>`ko.json:197`, `ja.json:195` | count | 0 (빈 값) | src/app/community/[id].tsx:336 { count: post.viewCount }; src/components/community/CommunityPostItem.tsx:372 { count: post.viewCount } |
| `community.time.minutesAgo`<br>`ko.json:211`, `ja.json:207` | count | 0 (빈 값) | src/lib/communityTime.ts:6 { count: minutesAgo } |
| `community.time.hoursAgo`<br>`ko.json:212`, `ja.json:208` | count | 0 (빈 값) | src/lib/communityTime.ts:7 { count: Math.floor(minutesAgo / 60) } |
| `community.time.daysAgo`<br>`ko.json:213`, `ja.json:209` | count | 0 (빈 값) | src/lib/communityTime.ts:8 { count: Math.floor(minutesAgo / 1440) } |

`t`는 blank JA를 먼저 KO로 fallback한 다음 치환한다(`src/locales/index.ts:29–35`). 따라서 이9개를 **실행 시 crash9건**으로 해석하면 안 된다. 현재는 ko 고정이고, 향후 JA를 활성화해도 빈 JA의 해당 메시지는 KO로 표시되며 변수는 KO template에 치환된다. 이 때문에 미완성 JA가 정상처럼 보일 수 있다.

params가 누락되면 `{name}`을 그대로 남기며, 여분 params는 무시한다. 현재 추적한 active 호출에서 필요한 변수 누락/오타는 발견하지 못했다. t의 `key:string`과 `params:Record<string,string|number>`는 key별 필수 params를 타입으로 강제하지 않는다. 완전한 미지원 dynamic key나 미래 변경은 별도 검증이 필요하다.

### 7.2 실제 문자열 조합 위험

상세 원문·위치는 §4 ID를 참조한다. 단어 key를 찾더라도 조사한 **문장 전체**와 연결되어 있지 않으면 완료가 아니다.

| 조합 / 근거 | 현재 분류 | 최소 문장 key 방향 |
| --- | --- | --- |
| title 상세보기(`NewPopupCard.tsx:34`, `PopupRankingCard.tsx:31`, `profile/favorites.tsx:84`) | B; viewDetails 이미 있음 | t(viewDetails,{title}); 기존 JA empty 먼저 채움 |
| title 찜 추가/취소(`NewPopupCard.tsx:39`, `PopupRankingCard.tsx:56`) | C; 단일 add/remove 키만 있음 | {title}를 포함한 a11y 문장. JA '…をお気に入りに追加/…から削除' 등 어순 |
| 댓글 header literal+count(`CommunityComments.tsx:344`) | B 대응: compactCommentCount 있음; literal node '댓글'은 §4 C로 기록 | 문장 전체 `댓글 {count}`를 해당 key로 연결. 조각 source 집계와 문장 key 존재 판정을 구분 |
| 댓글 글자 제한(`CommunityComments.tsx:177`) | C | {limit}자 이하 문장, number locale도 명시 |
| nickname에게 답글·댓글메뉴(`CommunityComments.tsx:414,434,464`) | C | {nickname}/{index} 문장; '에게 답글' suffix를 고정 붙이지 않음 |
| 후기 N개·평균별점 N점(`places/[id].tsx:519,533`) | C | {rating}/{count}별 한 문장; 0개 문구 분기 유지 |
| 별점 N점·사진 N삭제(`reviews/write.tsx:123,139`) | C | {rating}/{index} 포함 문장과 a11y label |
| 이지역팝업 N개보기(`MapScreen.native.tsx:917`) | C | {count} 포함 전체 CTA; 길이·line break 실기기 검사 |
| 후기사진 N / 주간 N페이지(`CommunityPostItem.tsx:267–288`, `PlaceWeeklySection.tsx:365`) | C | {index} 전체 a11y sentence. index+2의 실제 순서 의미 보존 |
| label 숨기기/표시(`AccountSettingsScreen.tsx:24`) | C | {label} 전체 문장 또는 visibility별 문장2개 |
| count분/시간/일전(`src/lib/communityTime.ts:6–8`) | A지만 JA empty | 기존 time key만 채우면 됨; 계산을 번역 값에 넣지 않음 |
| 이미지첨부 N/5(`community/write.tsx:246`), counter·별점 숫자 | 일부 label A, 나머지 숫자 조합 | 단순 N/5 표시는 공통 가능; 읽어주는 a11y는 필요 시 문장 key |

'댓글' fragment를 C로 분류한636건 집계와 완성 문장 `community.compactCommentCount` B 대응을 구분한다. 자동검사에서도 JSX siblings를 이어서 보는 문장 경로와 source literal 위치의 지표를 따로 유지해야 한다.

## 8. 일본어 번역 품질 검토

현재 존재하는 **nonempty JA52개 모두**를 KO 의미·현재 소비 문맥과 비교했다. 사용 가능한 key47개/소비 미발견5개로 나뉘며 실제 일본어 기기 렌더링은 수행하지 않았다. 한국어가 그대로 남은 값0개, 명백한 placeholder 오타0개다. '문법상 자연스러움'과 '현재 앱에서 JA로 사용됨'은 다른 판정이다.

### 8.1 존재하는 JA52개

| key / JA 줄 | 현재 JA | 검토·추천(미확정) |
| --- | --- | --- |
| `place.detail.about`<br>`src/locales/ja.json:9` | ポップアップ紹介 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.benefits`<br>`src/locales/ja.json:10` | 特典 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.notice`<br>`src/locales/ja.json:11` | お知らせ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.officialChannels`<br>`src/locales/ja.json:12` | 公式チャンネル | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.website`<br>`src/locales/ja.json:13` | 公式サイト | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.officialChannelLink`<br>`src/locales/ja.json:14` | {channel}の公式チャンネル | {channel}の公式チャンネル 자연스러움; website에는 公式サイトの公式チャンネル로 중복감을 줄지 여부는 용어 검토 |
| `place.detail.channelOpenError`<br>`src/locales/ja.json:15` | リンクを開けませんでした。しばらくしてからもう一度お試しください。 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.basicInfo.period`<br>`src/locales/ja.json:17` | 期間 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.basicInfo.time`<br>`src/locales/ja.json:18` | 時間 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.basicInfo.place`<br>`src/locales/ja.json:19` | 場所 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.basicInfo.reservation`<br>`src/locales/ja.json:20` | 予約 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.basicInfo.reservationNone`<br>`src/locales/ja.json:21` | 事前予約なし | 事前予約なし는 label로 자연스러움. D: 현재 화면 t 소비 없음 |
| `place.detail.basicInfo.reservationAvailable`<br>`src/locales/ja.json:22` | 事前予約可能 | 事前予約可能은 안내 label로 가능, 事前予約できます가 더 부드러움. D라 실제 예약 유무 문맥 추가 확인 |
| `place.detail.basicInfo.reserve`<br>`src/locales/ja.json:23` | 予約する | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.basicInfo.reservationStart`<br>`src/locales/ja.json:24` | {date} 受付開始 | 受付開始/受付終了가 예약 문맥에 적절; raw date 숫자/시간 포맷은 §10 별도 |
| `place.detail.basicInfo.reservationEnd`<br>`src/locales/ja.json:25` | {date} 受付終了 | 受付開始/受付終了가 예약 문맥에 적절; raw date 숫자/시간 포맷은 §10 별도 |
| `place.detail.basicInfo.copyAddress`<br>`src/locales/ja.json:26` | 住所をコピー | 住所をコピー 자연스러움. D: 실제 copy a11y 소비 미연결 |
| `place.detail.basicInfo.pending`<br>`src/locales/ja.json:27` | 情報準備中 | 의미는 보존. 더 친숙한 대안: 情報を準備中です / 住所情報を準備中です. 짧은 label에는 현재값 유지 가능 |
| `place.detail.basicInfo.addressPending`<br>`src/locales/ja.json:28` | 住所情報準備中 | 의미는 보존. 더 친숙한 대안: 情報を準備中です / 住所情報を準備中です. 짧은 label에는 현재값 유지 가능 |
| `place.detail.highlights.SPECIAL`<br>`src/locales/ja.json:31` | ここが特別！ | ここが特別！는 자연스럽지만 KO의 질문형을 단정형으로 바꿈. 의미 보존안: どんなところが特別？; 제목 길이 검증 |
| `place.detail.highlights.GOODS`<br>`src/locales/ja.json:32` | どんなグッズがある？ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.highlights.PRODUCTS`<br>`src/locales/ja.json:33` | 何が見つかる？ | 何が見つかる？ 자연스러움. PRODUCTS 문맥을 명시할 때 どんな商品がある？ 대안; KO 의미/운영 콘텐츠 확인 후 |
| `place.detail.highlights.VIEW`<br>`src/locales/ja.json:34` | 何が見られる？ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.highlights.EXPERIENCE`<br>`src/locales/ja.json:35` | 何が体験できる？ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.highlights.FOOD`<br>`src/locales/ja.json:36` | 何が味わえる？ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.highlights.SPACE`<br>`src/locales/ja.json:37` | どんな空間？ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `place.detail.highlights.HIGHLIGHT`<br>`src/locales/ja.json:38` | ここは見逃せない！ | 자연스러운 강조형이나 KO는 질문. 대안: 見逃せないポイントは？; 반드시 바꿀 결함은 아님 |
| `community.commentCountWithUnit`<br>`src/locales/ja.json:152` | コメント {count}件 | コメント N件 자연스러움. D: 실제 댓글 header 소비 미연결 |
| `community.compactCommentCount`<br>`src/locales/ja.json:153` | コメント {count} | コメント N件 자연스러움. D: 실제 댓글 header 소비 미연결 |
| `community.postMenu`<br>`src/locales/ja.json:154` | 投稿メニュー | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.cancel`<br>`src/locales/ja.json:155` | キャンセル | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.edit.title`<br>`src/locales/ja.json:157` | 投稿を編集 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.edit.action`<br>`src/locales/ja.json:158` | 編集する | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.edit.save`<br>`src/locales/ja.json:159` | 編集を保存 | 編集を保存 자연스러움. 실제 mode 버튼과 재확인 안내의 버튼명 일치 필요 |
| `community.edit.failed`<br>`src/locales/ja.json:160` | 投稿を編集できませんでした。しばらくしてから再度お試しください。 | 자연스러운 정중 표현. 再度お試しください/もう一度お試しください 혼용은 공통 error 톤만 통일 후보 |
| `community.edit.loadFailed`<br>`src/locales/ja.json:161` | 投稿を読み込めませんでした。タップして再試行してください。 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.edit.confirmRetry`<br>`src/locales/ja.json:162` | 編集結果を確認できませんでした。保存をもう一度押すと同じリクエストで確認します。 | 문법 가능하나 同じリクエスト가 기술적. 의미 보존 대안: 編集結果を確認できませんでした。もう一度「編集を保存」を押して結果を確認してください。중복 방어 의미를 함께 보존 검토 |
| `community.delete.action`<br>`src/locales/ja.json:165` | 削除する | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.delete.title`<br>`src/locales/ja.json:166` | 投稿を削除しますか？ | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.delete.message`<br>`src/locales/ja.json:167` | 削除した投稿は元に戻せません。 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.delete.confirm`<br>`src/locales/ja.json:168` | 削除 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.delete.failed`<br>`src/locales/ja.json:169` | 投稿を削除できませんでした。しばらくしてから再度お試しください。 | 자연스러운 정중 표현. 再度お試しください/もう一度お試しください 혼용은 공통 error 톤만 통일 후보 |
| `community.detail.title`<br>`src/locales/ja.json:172` | 投稿 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.detail.missing`<br>`src/locales/ja.json:173` | 投稿が見つかりません。 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.detail.failed`<br>`src/locales/ja.json:174` | 投稿を読み込めませんでした。 | KO 의미와 현재/예상 label·안내 문맥에서 큰 문법 문제 발견 없음. nonempty라는 이유로 실제 적용 완료 판정하지 않음 |
| `community.detail.retry`<br>`src/locales/ja.json:175` | 再試行 | 再試行은 짧고 통용. 서버 목록 재읽기일 때 再読み込み, 일반행동에는 もう一度試す 대안. 공통 용어 일관성 결정 |
| `community.detail.image`<br>`src/locales/ja.json:176` | {index}枚目の投稿画像 | index+枚目 문장 자연스러움; 코드 index+1 확인. 리뷰에도 공통carousel 쓰므로 投稿画像가 문맥상 허용되는지 확인 |
| `community.removeImage`<br>`src/locales/ja.json:188` | {index}枚目の画像を削除 | index+枚目 문장 자연스러움; 코드 index+1 확인. 리뷰에도 공통carousel 쓰므로 投稿画像가 문맥상 허용되는지 확인 |
| `community.imageConfirmRetry`<br>`src/locales/ja.json:189` | 投稿の完了を確認できませんでした。もう一度投稿すると、同じリクエストを確認し、重複投稿を防ぎます。 | 뜻은 대체로 보존; 投稿すると보다 投稿ボタンを押すと가 정확. 재시도 버튼 번역(register)은 현재empty라 문구/버튼이 어긋날 수 있음. 중복을 피하는 재확인 의미 유지 |
| `community.imageError.permission`<br>`src/locales/ja.json:191` | 写真へのアクセスが必要です。設定で写真へのアクセスを許可してください。 | 문법·요청 의미 자연스러움. 사진권한은 OS/native 문구도 별도 일본어 검증 |
| `community.imageError.limit`<br>`src/locales/ja.json:192` | 画像は最大5枚まで添付できます。 | 문법·요청 의미 자연스러움. 사진권한은 OS/native 문구도 별도 일본어 검증 |
| `community.imageError.conversion`<br>`src/locales/ja.json:193` | 画像を準備できませんでした。別の写真を選ぶか、もう一度お試しください。 | 문법·요청 의미 자연스러움. 사진권한은 OS/native 문구도 별도 일본어 검증 |

### 8.2 주요 용어: 기존값/누락과 추천

아래는 아직 JSON/화면에 적용하지 않은 제안이다. 서로 다른 문맥을 하나의 버튼 key로 억지 통일하지 않는다.

| 한국어 | 현재 JA 상태·UI 근거 | 추천 / 대안 | 문맥·길이 주의 |
| --- | --- | --- | --- |
| 찜한 팝업 | key 없음; `profile/favorites.tsx:64` | お気に入りのポップアップ / お気に入り | 상세 title는 원문 의미 보존안, 메뉴는 짧은 대안 검토 |
| 방문 리뷰 | reviewFilterLabel JA key 없음; `reviews/[id].tsx:253,305` | 訪問レビュー / 体験レビュー | 방문 경험 강조 vs 체험 전체; 상품 구매 review와 혼동 안 되게 용어 확정 |
| 내가 쓴 게시글 | key 없음; `profile/posts.tsx:98` | 自分の投稿 / 投稿した記事 | community 글에는 自分の投稿가 자연스럽고 짧음 |
| 내가 쓴 방문 리뷰 | key 없음; `profile/reviews.tsx:93` | 投稿した訪問レビュー / 自分のレビュー | 방문 의미 축약 여부 정책 확인; 긴 title 검증 |
| 플레이스 | place.title JA empty; `PlaceScreen.tsx:392` | プレイス / スポット | 기존 branding 유지안 우선; 의미 변경은 미확정 |
| 커뮤니티 | community.title JA empty; `CommunityScreen.tsx:273` | コミュニティ | 통상적·브랜딩 일치 |
| 팝업 정보 | key 없음; `places/[id].tsx:121` | ポップアップ情報 | tab 너비·접근성 검증 |
| 사전예약 | quick.preReservation JA empty; `QuickFilterBar.tsx:48` | 事前予約 | detail 예약가능/예약없음은 문장별 키 유지 |
| 운영 중 | operationStatuses.open JA empty; `popupStatus.ts:16` | 開催中 / 営業中 | 이벤트/전시 팝업은開催中이 보통 적절; 매장 영업 여부와 구분 |
| 오픈 예정 | operationStatuses.upcoming JA empty; `popupStatus.ts:14` | 開催予定 / オープン予定 | 시작 예정 vs 상점 개장 nuance; 기간 기준 유지 |
| 종료 | operationStatuses.closed JA empty; `popupStatus.ts:15` | 終了 | 終了済み 대안; '마감/예약 종료'와 별개 |
| 현장 정보 | category.info JA empty·D; `src/locales/ko.json:195` | 現地情報 / 現場情報 | 현재 category UI에는INFO 없음. 새 UI 구현을 확정하지 않음 |
| 문의하기 | key 없음; `profile/index.tsx:247` | お問い合わせ | 일반 서비스 메뉴/화면명 |
| 문의글 | key 없음; `profile/inquiries/index.tsx:61` | お問い合わせ内容 / お問い合わせ | 사용자 제목/본문은 원문F; fixed caption만 번역 |
| 좋아요/취소 | key 없음; `community/[id].tsx:345` | いいね / いいねを取り消す | state별 action/a11y 어순 |
| 저장/등록/수정 | common 없음; account/review/inquiry 각 submit | 保存 / 投稿 / 送信 / 編集を保存 | 등록은 community/review의投稿 vs inquiry의送信; 의미가 다름 |
| 취소 | community.cancel=キャンセル; 댓글 등hardcode | キャンセル | common 재사용 후보, native 버튼 길이 점검 |
| 삭제 | community.delete.confirm=削除; 댓글 등hardcode | 削除 | action·대상명을 문장틀로 처리 |

`Text numberOfLines=1`과 고정 card/button 너비가 있는 곳에서 JA 길이를 확인해야 한다(`PlaceInterestSection.tsx:49,85`, `PlaceFilterSheet.tsx:44,243`, `PolicyDetailScreen.tsx:21`, `CommunityPostItem.tsx:86`). 정적 분석으로 실제 잘림/줄바꿈을 확정하지 않았다. iPhone 작은 화면·큰 글자·VoiceOver에서 label/오류/버튼명·body tone을 검증한다.

## 9. 국가와 언어 설정 독립성

### 9.1 다섯 개 개념

| 개념 | 현재 소유·사용 | 구분 결과 |
| --- | --- | --- |
| UI 언어 | `src/locales/index.ts:6–8` 고정ko | 국가/GPS로 정해지지 않음. JA 전환은 미구현 |
| 탐색 국가 | 홈 섹션 selectedCountry KR/JP, Place filters.countries | local UI state·API countryCode. home 두 섹션의 선택도 별도 |
| 실제 팝업 국가 | `src/lib/popups.ts:11,51` countryCode | 서버 데이터; UI 언어를 바꾸는 설정 아님 |
| 시스템 언어 | read 경로 없음 | 현재locale에 영향 없음. system mode 미구현 |
| 현재 위치 | `MapScreen.native.tsx:503–540` permission/일회 location→camera | locale/country store를 바꾸지 않음. 근접 map 이동용 |

| 요구 시나리오 | 현재 가능한 동작 | 출시 전 확인 |
| --- | --- | --- |
| KO UI에서 일본 팝업 | 홈JP/PlaceJP 탐색 가능; UI는KO, detail/bannerlanguage=KO | 일본 팝업의 원문/현지 주소와 번역 필드 구분 |
| JA UI에서 한국 팝업 | 실제 JA UI 선택 불가 | JA 활성화 후 country=KR 유지, detail/bannerlanguage=JA |
| JA 시스템에서 한국 국가 | system 미감지로 여전히KO UI, KR 탐색은 별도 | system→JA와 KR 선택 독립, locale 저장/재시작 확인 |
| KO 시스템에서 일본 국가 | KO UI·JP 탐색 별도 | system→KO와 JP 선택 독립 유지 |

현재 locale 변경으로 국가가 바뀌는 경로는 **없지만 locale 변경 자체도 없다**. 따라서 '언어 변경 시 국가 독립성이 실기기 검증됐다'고 말할 수 없다.

### 9.2 번역 label과 로직값 결합 위험

| 확인된 코드 | 발생 조건·위험 | 최소 방어 제안 |
| --- | --- | --- |
| `PlaceScreen.tsx:277`: region.name === t(source.labelKey) | JA region resource를 채우고 language를 활성화했는데 /regions name 계약이KO라면 지역배너 선택에서 matched없음→regionIds=[](국가만 적용). getRegions는 country만 전달 | label을 identity로 쓰지 않음. 서버 region ID/고정code와 local region ID 매핑 계약 확인; backend 변경 이번 미수행 |
| `PlaceScreen.tsx:46–49,285–298`: tagName Korean 이름으로 option.name 검색 | displaylabel만 translate하는 것은 괜찮지만 서버 name도locale화되면 ID lookup 실패 가능. 현재 getTags는lang없음 | tags.id(현재 데이터 타입에 존재)를 기준으로 필터; metadata locale contract 확정 |
| `MapScreen.native.tsx:92–130,194,209–212`: 선택 tag가 label·server .name 비교·style key | displayed tag array 값을 일본어로 직접 바꾸면 filtering/style lookup 깨질 수 있음 | stable tag identity와 t label 분리; primaryTag/name 원문 임의치환 금지 |
| `PlaceScreen.tsx:43,73–80,219`: 탭값 '탐색'/'전체' | state값을 번역 string으로 바꾸면 branch 비교 불일치 | state route/ID는고정; 출력 label만 locale化 |
| `src/lib/popupStatus.ts:1,14–16`; 여러 card style status비교 | status 함수의 반환값 자체를 t로 바꾸면 색/분기 조건이 깨짐 | stable status code와 localized display 분리; 현재 날짜 계산 보존 |

이 위험들은 **현재 const ko 상태에서 JA로 재현한 결함이 아니라** locale 활성화 시 노출되는 코드 결합 후보다. 실제 metadata/server 응답을 호출하지 않았으므로 /regions·/tags의 번역 가능성을 임의 확정하지 않았다.

### 9.3 서버 문구·캐시의 locale 범위

| API/캐시 | locale 연계 | 추가 확인 |
| --- | --- | --- |
| banner | `src/lib/mainBanners.ts:13–15` languageCode; hook locale별 key | 현재ko만. locale reactive 구독이 없으므로 설정 추가만으로 즉시 fetch 보장 못함 |
| popup detail | `src/lib/popups.ts:195–207`, `places/[id].tsx:178,204–259` languageCode+id effect/abort | 서버가 summary/highlights fallback 담당은 docs/API.md:43–47 계약. 실제 JA 서버 completeness는 확인 필요 |
| place autocomplete | `MapScreen.native.tsx:329`, `src/lib/placeSearch.ts:19–23,42` languageCode | effect deps는isSearchMode/searchQuery만(:304–346). 향후 검색어 그대로 locale 변경 시 재검색 조건 추가 필요 |
| popup list/map/search/regions/tags | 현재 호출에 languageCode 없음(`popups.ts:125–192`, `filterOptions.ts:22–35`) | 이름/주소/고유명 원문인지 localized field인지 계약 확인. 일본 팝업명 자체를 KO key로 바꾸지 않음 |
| home 인기/신규 | cache key section:country(`useHomePopups.ts:6–13`), API country only | locale별 서버data가 필요해지면 cache key도맞춰야 함. 현재 공개 원문이라면 공유유지 가능 |
| filter options | country별regions/단일tags cache(`filterOptions.ts:6–9`), TTL/lang없음 | localized names를 도입할 경우 lang key·invalidations 계약 필요 |
| user글·nickname | F: country/UI locale와별개 | 원문 유지. 서버의 '탈퇴한 사용자' 같은 시스템 생성 표시가있다면 UGC와 구분하는 contract필요; 단순 nickname 문자열치환 금지 |
| 공지·문의 답변 | E: 현 API locale params없음 | front t만으로 body 번역 불가. 운영 콘텐츠별locale/fallback 정책 미확정 |

## 10. 날짜·시간·숫자 현지화

**계산과 표시를 구분**했다. 양 언어가 동일 숫자 날짜(YYYY.MM.DD)를 쓰는 것이 항상 결함은 아니다. locale format 정책이 없고 혼용되는 상태를 확인한 것이며 사용자 요구 예시인 '10월8일/10月8日'은 아직 구현되지 않았다.

| 대상·근거 | 계산/원본 | 현재 표시 | 판단·최소 조치 |
| --- | --- | --- | --- |
| 상세 운영기간 `places/[id].tsx:165–172,412–415` | server YYYY-MM-DD | YYYY.MM.DD 양끝 join | locale formatter 선택지 정리; date-only를 timestamp timezone 변환과 구분 |
| 예약 open/close `places/[id].tsx:170–172,401–409` | server datetime를T로split; 시간 앞5자 | numeric날짜 HH:mm+t(reservationStart/End) | JA phrase는존재. timezone 변환은안 함; 서버time/offset contract확인 |
| 홈 인기 `HomeTrendingSection.tsx:28–30` | server date | '-'→'.' | 숫자 format 공유 여부 정책확인 |
| 홈신규/배너 `HomeNewPopupSection.tsx:31–42`, `HomeBanner.tsx:17` | same-year 여부 | YY.MM.DD - MM.DD 등 | year유무가상황별; 같은 helper 공유는정상, lang formatter 없음 |
| Place 전체 `PopupGridCard.tsx:28–35` | date-only split | YY.MM.DD ~ MM.DD | locale 비교점검; status label은§9 별도 |
| 종료임박 `TodayOpeningCarousel.tsx:83–86,277–293` | 서울today·date표시 | 숫자날짜, '오늘 종료' KO | counter/오늘 종료 번역 |
| 주간 `PlaceWeeklySection.tsx:16–49,236` | localDate 월요일계산·API date serialization | M.D - M.D | UI localeformat만분리; 서버YYYY-MM-DD query변경안 함 |
| 찜/지도/주간card | `profile/favorites.tsx:16–24`, `MapPopupListSheet.tsx:29–42`, `PlaceWeeklyPopupList.tsx:18` | 각 숫자 format·일정미정KO | missingdate fallback 공통화; UI 표시는locale별의도결정 |
| 게시글/댓글/리뷰 상대시간 | `src/lib/communityTime.ts:3–8`; hooks/useCommunityNow.ts | count분/시간/일전 t; JA빈값 | 계산은 minutes floor·0이하clamp. JA {count}分前/{count}時間前/{count}日前 후보. invalidDate는원문반환 |
| 리뷰 작성일 | `reviews/[id].tsx`, `CommunityPostItem.tsx`·communityTime 사용경로 | 상대시간 또는 server timestamp data | locale template/절대시간 fallback 검증 |
| 문의/공지 날짜 | `src/lib/inquiries.ts:71`, `notices.ts:29` | 처음10자 YYYY.MM.DD | timezone·localization변환없음; 콘텐츠 날짜정책확인 |
| numeric count·rating | `CommunityPostItem.tsx:153`, `places/[id].tsx:430,519,533`, `CommunityComments.tsx:177` | rating.toFixed(1), count직접, toLocaleString()은locale인자없음 | 저장숫자와표시 분리. 기기locale vs UIoverride 어긋날수있으므로 UIresolvedlocale로 formatter |
| 날짜직접선택 | `PlaceFilterSheet.tsx:230–244`; `VisitPeriod` custom제외(`placeFilters.ts:286`) | 번역label은있지만buttondisabled | datepicker는미구현. 존재하지않는picker가JA미적용이라고 추가불량집계안 함 |
| 요금·통화 | PublicPopup/Detail type·활성 UI 가격formatter 경로 | 독립된금액/통화component 발견없음 | '원/円'을 임의수정안 함. summary/notice/body속가격은E/F 계약. 향후통화는locale아닌실제currency KRW/JPY 기준 |

Place의 '오늘' 기준은 서울+9(`PlaceScreen.tsx:55–57`), 주간 계산은 JS local Date(`popups.ts:107–113`) 등으로 분리돼 있다. 한국/일본은 같은 UTC+9이지만 기기가 다른 time zone일 때 경계의 요구는 확인 필요다. 이 사실을 일본어 번역 오류로 직접 단정하지 않는다. 번역작업 중 날짜 query·sorting·cursor 계산까지 바꾸지 않도록 회귀를 분리한다.

## 11. 권장 번역 리소스 구조

### 11.1 기존 namespace를 재사용하는 최소 변경안

현재 `common / home / place / map / community / my` 구성을 유지하는 것으로 충분하다. 깊이가 최대4개 segment인 것이 문제의 원인은 아니다. **실제 소비를 연결하고 공백을 채우는 작업**을 먼저 해야 한다.

| 영역 | 현재 평가 | 향후 최소 조치·예상 위치 |
| --- | --- | --- |
| common | `src/locales/ko.json:2`, `ja.json:2` 빈 object. 화면에는 확인·취소·저장·뒤로가기·재시도·로딩 등 literal 반복 | 양쪽에 common 버튼/상태/접근성 문장 key 추가. 의미가 동일한 공통 문구부터 재사용; 저장/등록/전송처럼 동작이 다른 단어를 무조건 통합하지 않기 |
| home/map/my | 각각 title1개뿐이며 실제 화면에서는 미사용 | §4의 해당 파일별 B를 연결하고 C를 기능별 하위 object로 추가. home section, map search/sheet/location, my account/inquiry/notice/auth 등 |
| place | detail/all/explore/filters 구조가 이미 있고 실제 일부 호출됨 | 기존 key부터 연결. 모듈 평가 시 t를 호출하는 상수는 렌더/locale 의존 생성으로 전환. stable ID와 번역 label 분리 |
| community | 작성/첨부/시간 일부 실제 적용; 나머지 목록/댓글/상세 혼재 | write/detail/comment/review 등 기능별 필요 key를 추가하되 기존 consumer key를 한 번에 rename하지 않기. 현재 없는 INFO UI를 번역 완료로 집계하지 않기 |
| 정책 | `src/content/policies.ts:15–234`가 한국어 source 콘텐츠 | 정책별/언어별 콘텐츠와 버전·시행일을 관리할 소유자 결정. 대형 문단을 common에 합치지 않기. 실제 정책 의미/버전 승인 후 렌더 연결 |
| mock | `place.all.mock.*`, `community.mock.*`13개 | 활성 리소스 공백과 분리. 필요 시 개발 fixture로 이동 여부 검토하되 이번 감사로 자동 삭제하지 않기 |
| _label | lookup은 object의 _label 지원(`locales/index.ts:21–22`); 일부 parent label은 미사용 | 기존 방식 유지 가능. leaf와 parent object key 소비를 validator가 구분하도록 하기 |
| 같은 한국어 값 | 정확한 값 중복5묶음(§2) | 동일 문자열만으로 합치지 않기. 예: 예약 오픈과 행사 오픈은 서로 다른 의미·변수 맥락 |

새 라이브러리 전체 교체나 namespace 전면 재편은 필요성이 입증되지 않았다. 현재 작은 t 함수의 fallback/interpolation을 유지하면서 **reactive locale 계층**을 보강하는 최소 변경안을 우선 검토한다. plural·추가 언어·복잡한 문법 요구가 커지면 그때 라이브러리 도입 비용을 비교한다.

## 12. 언어 설정 저장 및 복원

### 12.1 요구 대비 현재 상태

| 요구 | 코드 확인 결과 | 향후 동작 |
| --- | --- | --- |
| 한국어(ko)/일본어(ja)/시스템(system) | Locale type은 ko/ja만; `src/locales/index.ts:4–8` 고정ko | 저장 preference는 ko/ja/system, 실제 resolved locale은 ko/ja로 분리 |
| 기본값 system | 현재 기본ko | 저장값 없으면 system. 지원 시스템 언어ja→ja, ko→ko, 나머지→ko fallback |
| 설정 UI | `src/app/(tabs)/profile/settings.tsx:61–114` 계정 항목; 언어 선택 없음 | 같은 설정 화면에3개 mode 제공; country selector와 별도 항목 |
| 사용자 선택 저장 | locale 저장 코드·AsyncStorage 미발견 | 이미 설치된 SecureStore(`package.json:23`)를 별도 preference key로 활용 가능. 기존 token key와 분리 |
| 시작 복원 | `src/app/_layout.tsx:5–43` Stack 구성만; locale hydration 없음 | Root에서 저장값 읽기/시스템 해석 완료 후 UI 표시. 실패/손상 저장값은system으로 복구 |
| 시스템 감지 | locale detector/OS language API 호출 없음. expo-localization 의존성도 없음 | 이미 설치된 API로 요구를 충족할 수 있는지 먼저 검토. 공식 system 감지가 필요하면 호환되는 expo-localization 도입을 별도 승인된 구현 작업에서 검토 |
| 즉시 반영 | t/getLocale이 plain 함수이고 locale const. 구독/Provider 없음 | Hook/Context 등 하나의 locale owner를 두어 실제 consumer가 다시 렌더. memo component/모듈 상수도 검토 |
| 시스템 설정 변경 | 언어용 AppState handler 없음 | system 모드에서 앱 foreground 복귀 시 다시 감지. ko/ja override는 유지 |
| 로그인/로그아웃 유지 | 현재 저장 기능 자체가 없음 | device preference로 유지; auth token/session clear에 같이 지우지 않기 |
| 초기 언어 깜빡임 | 현재 고정ko라 복원 깜빡임은 실측 대상이 아님 | 비동기 저장 복원 중 KO UI가 먼저 나오는 것을 막을 hydration gate 설계; 실기기 cold start 검증 |
| 서버 콘텐츠 | API별 languageCode/캐시가 서로 다름(§9) | resolved locale을 query/cache identity에 포함. 늦은 이전 언어 응답 방어와 함께 재조회 |
| 국가 독립성 | 현재 locale 고정; 국가 state 별도이나 이름 비교 결합 있음 | preference/resolvedLocale 변화가 KR/JP, region/tag ID, 현재위치를 변경하지 않기 |

이는 현재 구현 기능으로 기록하지 않은 **향후 설계안**이다. SecureStore의 기존 사용 위치는 `src/lib/auth.ts:156–238`이며 locale preference는 토큰 초기화 경로와 분리해야 한다. 저장 mode와 resolved locale을 혼동하면 system 모드를 재시작 때 잃을 수 있다.

공식 문서는 Expo Localization의 기기 locale 조회를 안내하며, Android에서는 앱 실행 중 시스템 locale 변경 가능성을 설명하고 foreground에서 다시 읽는 방식을 제시한다. iOS의 동작을 같은 것으로 단정하지 말고 OS/기기별 확인한다. [Expo Localization](https://docs.expo.dev/versions/latest/sdk/localization/)

SecureStore는 이미 설치되어 있고 비동기 get/set을 제공한다. 이 감사에서는 패키지 추가나 locale key 저장을 수행하지 않았다. [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

### 12.2 native 문구는 별도 검증

`app.json:14` 위치 권한, `app.json:52` 사진 권한 문구는 JS t 호출 밖의 한국어다. native locale 리소스/지원 언어 설정과 새 native build가 필요한지 확인해야 한다. 수동 UI 언어 선택만으로 OS 권한창의 언어가 즉시 따라 바뀐다고 약속해서는 안 된다. iOS/Android의 시스템 앱 언어 해석과 JS resolved locale을 별도로 기록한다. [Expo localization guide](https://docs.expo.dev/guides/localization/), [Expo app config locales](https://docs.expo.dev/versions/latest/config/app/)

## 13. 자동 검증 도입 방안

### 13.1 기존 프로젝트에서 가능한 최소안

이번에는 검사 도구·스크립트 파일·테스트를 새로 추가하지 않았다. 아래는 향후 구현 제안이다. 이미 있는 TypeScript parser(`package.json:48`)와 Node를 사용하면 별도 설치 없이 정적 검증 범위를 넓힐 수 있다.

| 검사 | 가능한 구현 | 주의점 / 처리 기준 |
| --- | --- | --- |
| ko/ja key 일치 | JSON AST/leaf map의 양방향 차집합 | object/_label를 구분. metadata·mock 제외 규칙은 명시 |
| 빈 값/잘못된 구조 | whitespace trim, leaf type/object shape, JSON property 중복 확인 | JSON.parse만 쓰면 중복 key가 가려질 수 있음; parser 진단 병행 |
| placeholder | /{변수}/ 추출 결과를 이름별 횟수 map으로 비교 | 빈 JA는 missing와 placeholder mismatch가 겹치므로 중복 집계하지 않기 |
| 없는 t key | TypeScript AST에서 import alias·literal·conditional branch 추적 | 직접 문자열검색만으로 분기 한쪽/상수 key를 놓치지 않기. 범위가 무한인 동적 key는 확인 필요 |
| 사용되지 않는 key | import/상수 소비를 포함한 active route 의존 graph + 동적 key 후보 | 이번 review category처럼 type상 가능 key는 따로 표시. 문자열을 못 찾았다는 이유로 삭제 금지 |
| 하드코딩 UI | JSXText/Text child/placeholder/accessibilityLabel/Alert 및 사용자 노출 Error 경로 후보 추출 | 주석·로그·내부 enum·style key·DB 값·E/F/G는 allowlist+사람 검토. 한글 없음은 UI 완료 증거가 아님 |
| params 전달 | literal key에 대해 required placeholder와 object params 비교 | 여러 곳에서 전달되는 object/범용 함수는 unresolved로 보고; 변수가 없으면 현 t는 오류 대신 중괄호 노출 가능 |
| locale 변경 | 기존 CJS harness에 실제 locale owner/재렌더/restore 테스트 추가 | fake locale만 바뀌는 상세 테스트로 실제 앱 switch를 입증하지 않기 |
| 번역 품질/길이 | 용어표/화면 스냅샷/기기 검수 | 정적 key 검사로 문맥·줄바꿈·VoiceOver 품질을 검증할 수 없음 |

향후 파일 예시: `scripts/check-i18n.cjs`와 기존 test 방식의 `tests/i18nResources.test.cjs`. 처음에는 현재 부채를 baseline으로 두고 **신규 누락/빈 값/placeholder 불일치**부터 실패 처리한다. 이후 baseline을 줄이며 모든 활성 UI가 번역된 상태를 release gate로 삼는다. 신규 lint 패키지나 자동 key 삭제는 필요하지 않다.

### 13.2 이번에 실행한 기존 검사

| 검사 | 실행/결과 | 해석 |
| --- | --- | --- |
| TypeScript | 기존 설치된 node로 `node_modules/typescript/bin/tsc --noEmit --incremental false`; **exit0** | source type 검사 통과. emitted 파일/증분 캐시 생성 안 함 |
| 기존 관련5개 CJS test | Node `--test --test-reporter=tap`, 아래5개 파일; **41건/36통과/5실패**, runner exit1 | 일부 번역/상세/필터 로직 검증. 실제 제품 locale 변경/JA 전체 화면은 검증 안 됨 |
| 리소스·UI 감사 | 메모리 기반 구문 분석 및 호출 경로 대조 | leaf/blank/placeholder/consumer/catalog 정적 집계. 새 script 파일 없음 |
| 보존 확인 | 감사 시작 파일 hash·git 상태와 완료 시점 대조 | 보고서 이외 source·JSON·tests·config 변경 금지 준수 |
| 생략 | 전체 build/formatter/lint fix/package install/기기 실행 | 진단 범위·파일 쓰기 제한 준수. native JA layout/권한창/성능 실측 없음 |

실행한 파일:
`tests/popupStructuredDetail.test.cjs`,
`tests/popupGuidance.test.cjs`,
`tests/communityRefresh.test.cjs`,
`tests/mainBanners.test.cjs`,
`tests/placeFilterSheetUi.test.cjs`.

| 실패 | 근거·실패 이유 | 기존 실패 판정의 한계 |
| --- | --- | --- |
| communityRefresh4건 | `tests/communityRefresh.test.cjs:123,153,182,207` — `Missing mock react in src/components/community/CommunityPostItem.tsx` | 현재 작업 트리에서 보고서 작성 전에 존재한 실패. 이번 감사는 코드/테스트를 수정하지 않음. 과거 HEAD/CI에서도 실패했는지는 미확인 |
| mainBanners1건 | `tests/mainBanners.test.cjs:1` file 초기화 — `Unexpected dependency: expo-router` | 초기화에서 중단. 파일 내부 languageCode/banner 테스트가 실제 실행됐다고 볼 수 없음 |

실패 원인은 현재 test harness와 import 의존 관계의 불일치로 보이며, 제품 UI의 일본어 문법 오류 또는 API 장애로 바로 해석하지 않는다. harness 보완은 다음 구현 작업에 포함하되 기존 실패를 숨기거나 테스트 성공으로 기록하지 않아야 한다.

`tests/popupStructuredDetail.test.cjs:55–59,175,434`는 **mock locale를 변경하고 test tree에 dirty 표시**를 한다. 상세의 locale 변화 대응 경로를 테스트할 수 있지만 실제 `src/locales/index.ts:7`의 const 언어를 바꾸지는 않는다. 따라서 해당 테스트 통과는 ko/ja/system·저장·시스템 감지 구현 완료의 증거가 아니다.

## 14. 단계별 적용 계획

현재 변경은 보고서뿐이다. 아래 단계는 향후 별도 구현 작업이며 완료로 표시하지 않는다.

| 순서 | 최소 작업 | 예상 변경 위치 | 검증/완료 조건 | 주요 회귀 주의 |
| --- | --- | --- | --- | --- |
| 1 | 실제 reactive locale owner, ko/ja/system preference, system 기본값·fallback·hydration·저장 복원 | `src/locales/index.ts`, `src/app/_layout.tsx`, `src/app/(tabs)/profile/settings.tsx`; 필요한 locale Hook/Provider | 실제 앱에서 설정 즉시 변경→종료/재시작→선택 유지; 미지원 시스템 언어KO; 로그인 전후 유지 | 모듈 평가 t 값 고착·memo 미갱신·초기KO 깜빡임. 기존 auth key와 독립 |
| 2 | stable country/region/tag/status ID와 label 분리; API languageCode/cache 전파 점검 | `PlaceScreen.tsx:277`, `MapScreen.native.tsx:209–212`, `placeRegionMocks.ts`, `popupStatus.ts`, `popups.ts`, `mainBanners.ts`, `community.ts` | UIko/ja × countryKR/JP 4조합에서 region/tag 선택 유지·정확한query; 늦은 이전언어 응답 미표시 | 표시이름을 ID처럼 사용하는 기존 비교/상태색상 분기. 서버 계약 확인 전 API 변경 금지 |
| 3 | JA 부재4개/공백113개 번역; B74개 실제 소비 연결 | `src/locales/ko.json`, `ja.json`, §4 B consumer | active key60개의 fallback 공백 해소. key/placeholder 비교 통과; render가 실제JA 출력 | JSON 존재만으로 완료하지 않기. INFO/mock/unused는 우선순위 구분 |
| 4 | C562개 source 위치를 기능별 문장 key로 연결, 접근성/Alert/오류 포함 | §4 파일별 consumer; 우선 탭/홈/지도/플레이스→상세/커뮤니티/리뷰→my/auth/inquiry/notice | 모든28 route + 작성/수정/빈값/로딩/실패/확인 mode에서 실제JA 확인 | C562는 필요한 신규 unique key562개와 다름. 공통 재사용/문장단위 key로 축소 |
| 5 | 정책·동의 flow·native 권한의JA 운영 준비 | `content/policies.ts`, `PolicyDetailScreen.tsx`, `signup.tsx:281`, `app.json:14,52` | 책임자 검수한 KO/JA 정책 버전·시행일, 동의 상세 연결, 실제OS 권한창 검증 | 정책 의미/버전 승인; native 언어는JS manual override와 다른 동작일 수 있음 |
| 6 | 상대시간/절대날짜/숫자 문장틀 정리 및 Japanese 용어/길이 검수 | `communityTime.ts`, dates 관련 §10 consumer, common 리소스 | date-only·instant 계산 보존, 개수/반올림 검증; 작은iPhone/큰글꼴/VoiceOver | timezone query나 행사 currency를 UI locale로 바꾸지 않기 |
| 7 | 최소 resource validator·harness 정비·release gate | 기존 CJS tests 및 향후 validator | 현재5실패 원인 해소 후 검사; 신규 missing/blank/placeholder 불일치 차단 | validator unresolved 소비를 실제 미사용으로 단정하지 않기 |

### 실기기/실제 앱 수용 테스트

| 시나리오 | 확인할 내용 |
| --- | --- |
| 처음 설치/저장 없음 | system 기본값. 한국어/일본어 시스템 각각 matching UI; 영어 등 미지원KO fallback |
| 한국어↔일본어↔시스템 변경 | 모든 이미 마운트된 탭·상세·bar·modal·Alert 준비 문구 재렌더. 숫자/시간·a11y도 동일locale |
| 언어 선택 후 재시작/로그인/로그아웃 | preference 유지·auth account 변경과 독립. 초기언어 깜빡임 기록 |
| ko UI에서JP, ja UI에서KR | country 유지, 지역/태그 stableID query 유지, 이름 비교 실패 없음 |
| 시스템JA에서KR, 시스템KO에서JP | locale/country/location 구분. system 변경 후 복귀 감지와 override 유지 |
| API 로딩 중 언어 변경 | 이전 locale 응답/캐시가 새 locale 문구를 덮지 않기. UGC 본문은원문 유지 |
| 커뮤니티/리뷰 작성·수정·첨부·실패 | 버튼과 에러의 용어 일치, 입력글 유지, 사진 index/count 문장·확인/취소·삭제 |
| 정책/동의/권한 | 3개 정책 실제JA·시행일 확정·동의 상세 이동; 위치/사진 native 권한 첫요청 언어 |
| 작은 화면/큰 글꼴/VoiceOver | 탭/필터chip/좋아요·찜/긴 오류 줄바꿈·잘림·접근성 이름 |
| 날짜 경계/개수 | 0/1/다수·분/시간/일 경계, invalid timestamp fallback, 예약시간 timezone 계약 |

## 15. 최종 평가

**현재 상태를 한국어·일본어 UI 적용 완료로 볼 수 없다.** 번역 리소스와 일부 t 호출은 존재하지만 제품의 locale가 한국어로 고정되어 있고, 일본어 빈 값/부재와 실제 하드코딩 화면이 함께 남아 있다. 일본어 제공을 출시 범위로 삼는다면 아래5개 위험을 출시 전에 해결하거나 범위를 명확히 해야 한다. 한국어 단독 출시 판단과는 구분한다.

| 위험 | 확인 수준·영향 | 먼저 할 조치 |
| --- | --- | --- |
| 1. 언어 선택·system 기본값·저장/복원 부재 | **확인된 미구현** — `src/locales/index.ts:4–8`, settings/root. 일본어 UI로 실제전환 불가 | reactive locale + 설정/restore 설계·검증 |
| 2. 일본어 resource 공백117개 | **확인된 부재4/빈값113**. active 가능107key 중60key도공백; fallback이 결함을 가림 | §5 exact key 목록 번역, placeholder 검증 |
| 3. 하드코딩 UI636개 source 위치 | **확인된 실제 노출 literal** B74/C562. 인증·my·정책·공통/접근성도 포함 | B 실제연결→C 기능별문장 key; UI 전수검수 |
| 4. 표시 번역과 필터/서버·캐시 결합 | **잠재 위험** — `PlaceScreen.tsx:277` translated name로region조회. 현재JA 전환 불가라실제JA재현 안 함 | stableID/label 분리, languageCode/cache 계약·4조합확인 |
| 5. 정책·동의/권한 언어 준비 부족 | **확인된 KO 전용 경로** — policy120literal·시행일미확정·동의상세stub·권한2문구 | 문서 소유자 검수/화면 연결/native별JA 수용검사 |

추천 순서: **locale 기반/저장 → ID·API 독립성 → 기존JA 공백/B 연결 → 기능별C 적용 → 정책·native 권한 → 날짜·품질·기기검증/자동gate**. 독립적인 번역·정책 검수는 앞 단계와 병행할 수 있다.

공통 namespace를 유지하고 작은 범위부터 연결하는 방안이 합리적이다. unused62개는 자동 삭제하지 않는다. UGC/서버 콘텐츠를 강제로 번역 key로 치환하지 않는다. 작동 중인 Native Stack·지도/Reanimated 구조를 번역작업을 이유로 재설계할 근거도 없다.

검증 한계: 정적 감사와 기존 검사 결과다. native28화면의 일본어 실제 렌더, 화면 폭/VoiceOver, OS 권한창, 실제 서버 JA 콘텐츠/fallback, 저장/재시작/system 변경은 실기기 수용 테스트가 필요하다. TypeScript 통과와 fake-locale test 통과는 이 검증을 대신하지 않는다.

## 16. I18N 1단계 구현 — 2026-10-09

앞선 §1–15는 2026-10-08 감사 당시의 기록으로 보존한다. 아래는 실제 구현 이후의 변경 사항이며, 감사 집계를 다시 실행하거나 앱 전체 번역을 완료했다는 의미가 아니다.

### 16.1 구현과 상태 구조

- 기존 `ko.json` / `ja.json`, `t(key, params)`, dotted lookup, object의 `_label`, `{name}` 치환을 재사용했다. 새로운 번역 라이브러리는 도입하지 않았다.
- `languagePreference: 'system' | 'ko' | 'ja'`와 `resolvedLanguage: 'ko' | 'ja'`를 분리했다. `isHydrated`와 `storageError: 'read' | 'write' | null`도 공유한다.
- `languageStore`를 단일 상태 소유자로 두고 기존 인증 구독 방식과 같은 `useSyncExternalStore`를 사용했다. `useTranslation()`은 상태를 구독하며 기존 `t()`는 최신 resolvedLanguage를 조회한다.
- `setLanguagePreference()`는 UI 상태를 즉시 갱신한 뒤 저장한다. 실패해도 현재 UI 언어를 유지하고 설정 화면에 안내한다. 동일 항목을 다시 선택해 저장을 재시도할 수 있다.
- Root Stack의 화면 등록과 옵션은 유지하고 `LanguageProvider`만 감쌌다. 언어 변경 시 Stack의 key나 화면 identity를 변경하지 않는다. 인증·로그인 복원 코드는 변경하지 않았다.

### 16.2 저장과 초기 복원

- 1단계 최초 구현에서는 AsyncStorage가 설치되어 있지 않아 기존 `expo-secure-store`를 재사용했다. 이후 AsyncStorage로 전환한 현재 저장 방식과 마이그레이션은 §16.9를 참고한다. 전용 키는 `poparchive.languagePreference`이며 저장하는 값은 선택값 자체다. system일 때 resolvedLanguage를 대신 저장하지 않는다.
- 저장값 없음 / 유효하지 않은 값은 system, 읽기 실패도 system으로 처리한다. 복원 대기 상한은 2초이며, 지연된 읽기 결과가 타임아웃 후 UI를 다시 바꾸지 않는다.
- 빠른 연속 선택은 Promise queue로 쓰기를 직렬화한다. 오래된 작업이 마지막 선택 뒤에 저장되지 않으며 오래된 실패가 최신 선택의 오류 상태를 덮어쓰지 않는다.
- 로그인·로그아웃과 저장 키 / queue를 공유하지 않는다. 로그아웃의 토큰 삭제에 언어 설정 삭제를 추가하지 않았다.
- 기존 native splash 에셋 / 표시 옵션은 유지한다. 모듈 로드 시 자동 숨김을 보류하고, 언어 복원 완료 후 첫 root View layout에서 숨긴다. 복원 전에는 route UI를 표시하지 않아 초기 KO → JA 전환을 막는다. 실패·타임아웃도 hydration을 완료한다.

### 16.3 시스템 감지와 fallback

- 현재 Expo SDK의 `bundledNativeModules.json` 및 [SDK 57 공식 Localization 문서](https://docs.expo.dev/versions/v57.0.0/sdk/localization/)에 맞춰 `expo-localization ~57.0.2`만 추가했다. Expo installer가 `app.json`에 공식 config plugin을 추가했다. 새 번역 라이브러리 / AsyncStorage는 추가하지 않았다.
- `getLocales()`의 언어 우선순위 순서에서 첫 지원 언어를 선택한다. `ko-KR`, `ko`, `ja-JP`, `ja` 등 지역 변형을 언어 코드로 정규화한다. 예: `[en-US, ja-JP]` → ja. 목록에 지원 언어가 없거나 감지 실패 / 빈 목록이면 ko다.
- 명시적 ko / ja 선택은 기기 언어보다 우선한다. system 선택 시 그 시점의 OS 값을 다시 읽는다.
- AppState listener 하나로 active 복귀 시 system 설정을 다시 확인하고 unmount 시 정리한다. 수동 언어 선택은 유지하며 polling은 없다.
- 공식 문서상 iOS `getLocales()` 결과는 실행 중 유지된다. foreground 재조회가 iOS OS 언어 변경을 항상 실시간 반영한다고 보장하지 않는다. 재실행 감지 및 기기별 OS 동작은 실기기 검증 항목이다.
- 번역 리소스의 누락 / 빈 문자열은 기존처럼 한국어 → 키 문자열 순으로 fallback한다.

### 16.4 UI와 반응성

- 기존 마이페이지 → 설정(`/profile/settings`)을 재사용한다. 설정 화면 상단에 앱 언어와 시스템 설정 / 한국어 / 日本語 radio 항목을 추가했다. 별도 설정 route나 바텀시트는 만들지 않았다.
- 비로그인 상태에서도 선택할 수 있다. 선택 상태는 `accessibilityState.checked`, 항목은 radio role과 번역된 accessibilityLabel로 제공한다. 설정 진입점과 뒤로가기 라벨도 번역했다. 행은 minHeight / flex와 줄바꿈으로 일본어 및 큰 글자를 수용한다.
- 현재 `t()`를 사용하는 화면·컴포넌트와 `formatCommunityTime()` 표시 컴포넌트에 구독을 추가했다. 유지 중인 탭도 직접 구독하므로 부모의 재렌더 여부에 의존하지 않는다.
- PlaceFilterSheet의 모듈 상수 statusOptions를 렌더 내부로 이동했다. 기존 번역 문자열을 캐싱하는 useMemo는 발견되지 않았고, 신규 테스트에서 resolvedLanguage 의존성으로 memo 값을 갱신하는 패턴을 검증했다.
- 커뮤니티 / 리뷰 작성의 이미지 오류는 번역된 문자열 대신 키를 보관하고 렌더 시 번역한다. 작성 내용과 업로드 로직은 유지한다.
- 번역 추가 범위는 `language` namespace의 설정 / 안내 / 오류 / 뒤로가기 키로 제한했다. 기존 일본어 공백과 나머지 하드코딩 문구는 이번에 일괄 수정하지 않았다.

### 16.5 국가·조회 조건과의 독립성

- UI의 `getLocale()`와 API의 `getApiLocale()`를 분리했다. 1단계 API 기본 언어는 변경 전과 같은 ko이며, 기존 API의 명시적 languageCode 인자는 유지한다. UI 언어 변경으로 상세 / 배너를 언어별 재조회하거나 지도 autocomplete의 언어 정책을 변경하지 않는다.
- 국가 / 지역 / 태그 / 검색 state와 언어 store는 연결하지 않는다. 지도 카메라 / 마커 / 검색 처리 구조도 유지한다. 지도 파일 변경은 기존 언어 조회 함수의 출처 분리뿐이다.
- Place 지역 배너의 기존 이름 매칭은 서버의 기존 한국어 name을 비교하도록 `translate('ko', source.labelKey)`로 분리했다. 표시 언어로 인해 매칭 결과가 달라지는 것을 막는다. 안정적인 region ID 매핑으로의 전환은 후속 과제다.
- 서버 팝업 데이터 / 사용자 콘텐츠는 자동번역하지 않는다. 일본어 UI에서도 서버 응답 자체는 기존 조회 정책을 따른다.

### 16.6 변경 파일

| 범위 | 파일 |
| --- | --- |
| 상태·번역 | `src/locales/languageStore.ts`(신규), `src/locales/index.ts`, `src/locales/ko.json`, `src/locales/ja.json` |
| 구독·초기화 | `src/hooks/useTranslation.ts`(신규), `src/locales/LanguageProvider.tsx`(신규), `src/app/_layout.tsx` |
| 설정·진입점 | `src/app/(tabs)/profile/settings.tsx`, `src/app/(tabs)/profile/index.tsx` |
| 화면 구독 | `src/screens/PlaceScreen.tsx`, `src/screens/CommunityScreen.tsx`, `src/app/community/[id].tsx`, `src/app/community/write.tsx`, `src/app/places/[id].tsx`, `src/app/reviews/[id].tsx`, `src/app/reviews/write.tsx` |
| 플레이스 구독 | `src/components/place/AppliedFilterBar.tsx`, `PlaceFilterSheet.tsx`, `PlaceInterestSection.tsx`, `PlaceRegionSection.tsx`, `QuickFilterBar.tsx`, `RegionFilterGroup.tsx`, `PopupGridCard.tsx`, `PopupGuidanceCarousel.tsx`, `TodayOpeningCarousel.tsx`(같은 디렉터리) |
| 커뮤니티 구독 | `src/components/community/CommunityAuthor.tsx`, `CommunityComments.tsx`, `CommunityImageCarousel.tsx`, `CommunityPostItem.tsx`, `CommunityPostMenu.tsx`(같은 디렉터리) |
| 리뷰 Alert 구독 | `src/components/reviews/ReviewActions.tsx` — 리뷰 메뉴 바텀시트 파일은 변경하지 않음 |
| API 표시 언어 분리 | `src/lib/popups.ts`, `src/lib/mainBanners.ts`, `src/hooks/useHomeMainBanners.ts`, `src/screens/MapScreen.native.tsx`; 상세 화면은 위에 기재 |
| 공식 OS API 설치 | `package.json`, `package-lock.json`, `app.json` |
| 신규 검증 | `tests/i18n.test.cjs` |
| 기존 mock 보완 | `tests/helpers/uiDependencies.cjs`, `tests/mapSearch.test.cjs`, `placeFavoriteUi.test.cjs`, `placeFilterSheetUi.test.cjs`, `placePeriodFilter.test.cjs`, `placePagination.test.cjs`, `popupFavoriteDetail.test.cjs`, `popupStructuredDetail.test.cjs`, `popupCategoryPolicy.test.cjs`, `endingSoonCarousel.test.cjs`, `popupGuidance.test.cjs`(같은 tests 디렉터리) |
| 문서 | `docs/I18N_AUDIT.md`(본 절 추가) |

기존 mock은 신규 구독 / API 언어 함수 의존성에 맞춰 보완했다. 기존 기대값을 삭제하거나 완화하지 않았다. 실제 store와 hook은 신규 i18n 테스트에서 별도로 로드한다. 기존 fake API locale 변경 테스트는 명시적 API 언어 변화 시나리오이며 실제 UI 설정 변경과 구분한다.

### 16.7 실행 검증 결과

설치된 Node 22.23.3 실행 파일을 사용했다. 기본 PATH의 node shim은 활성 버전이 없어 실제 설치 경로로 실행했으며 기존 Expo 서버 / 에뮬레이터는 종료하지 않았다.

| 순서 | 실행 | 결과 |
| --- | --- | --- |
| 1 | 관련 기존 8개 파일: `communityRefresh`, `mainBanners`, `placeFilterSheetUi`, `popupStructuredDetail`, `popupGuidance`, `authLogout`, `accountSettings`, `mapSearch` | **128건 / 125통과 / 3실패**. 변경 전 동일 파일 실행 결과와 동일한 mainBanners 3건 |
| 2 | `node --test tests/i18n.test.cjs` | **25건 모두 통과** |
| 3 | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **exit 0** |
| 4 | `node --test tests/*.test.cjs` | **529건 / 521통과 / 8실패**. 아래 알려진 기존 실패 분포와 일치; 신규 실패 없음 |
| 5 | 이번 변경 파일 `git diff --check` 및 신규 파일 공백 검사 | 통과. 전체 작업 트리 검사는 기존 `docs/FUTURE.md:21`의 EOF 빈 줄, `docs/IOS_PROMOTION_60HZ_ISSUE.md:377`의 trailing whitespace로 실패; 관련 없는 문서는 수정하지 않음 |

전체 테스트의 8개 실패:

| 파일 | 건수 | 실제 실패 내용 |
| --- | ---: | --- |
| `communityFeed.test.cjs` | 1 | 카드 구조 기대 3 / 실제 2 |
| `endingSoonCarousel.test.cjs` | 1 | badge 색상 기대 `#FF5A6E` / 실제 `#ff2f47` |
| `mainBanners.test.cjs` | 3 | 제목 크기 기대 32 / 실제 28, footer gradient 기대 불일치, Home quick-menu 기대 불일치 |
| `placeFavoriteUi.test.cjs` | 2 | grid 정보 구조 기대 6 / 실제 3, weekly 색상 기대 `#111827` / 실제 `#6B7280` |
| `recovery.test.cjs` | 1 | cold profile failure의 기존 로그인 안내 기대 불일치 |

신규 테스트는 최초 실행 / 우선순위·지역 코드 / 수동 선택 / 재복원 / 잘못된 저장값 / 읽기·쓰기 실패 / 읽기 타임아웃 / 늦은 복원 / 연속 저장 성공·실패 / foreground / 실제 번역 fallback / memo 의존성 / 유지된 컴포넌트 구독 / 비로그인 설정 / 접근성 선택 상태 / back / splash gate·listener cleanup / API 기본 언어 및 KR·JP 데이터 독립성을 검증한다.

UI 검증은 기존 프로젝트 방식의 Node hook harness와 실제 store·번역·hook·컴포넌트를 사용한다. 실제 React Native renderer / 네이티브 화면 전환 / 실기기를 실행한 결과가 아니다. 전체 native build, iPhone 수동 검증은 실행하지 않았다.

### 16.8 iPhone 실기기 확인과 다음 단계

- `expo-localization`은 native module이므로 기존 development build에 포함되지 않았다면 새 development build가 필요하다. 이번 작업에서 실행 중인 서버를 종료하거나 native build를 수행하지 않았다.
- 첫 설치·저장값 없음: KO / JA / 미지원 OS 언어 및 우선순위 목록 확인. 저장된 JA로 cold start할 때 KO 화면 노출 / splash 깜빡임 / 과도한 시작 지연 확인.
- system → ko → ja → system 즉시 반영, 빠른 연속 선택 후 앱 종료·재실행 복원, 로그인·로그아웃 후 유지 확인.
- OS 언어 변경 후 foreground / 재실행의 실제 iOS 동작 확인. 수동 ko / ja override가 유지되는지 확인.
- 작은 iPhone / 큰 글자 / VoiceOver에서 일본어 안내 줄바꿈, radio checked 상태, 설정 진입점 / 뒤로가기 확인.
- 유지된 탭, 팝업 상세 / 리뷰 / 커뮤니티 / 마이페이지와 기존 내비게이션 확인. 지도 카메라 및 국가·지역·태그·검색조건이 언어 선택 전후 유지되는지 KO UI + JP 조회 / JA UI + KR 조회로 확인.
- I18N 2단계: 안정적인 국가·지역·태그 ID와 표시 label 분리, API 콘텐츠 언어·캐시 정책 별도 확정, 남아 있는 일본어 누락 / 빈 값과 하드코딩 UI를 기능별로 번역, 날짜 / 숫자 / 시간 / 접근성 정비, 정책·동의·native 권한 문구의 일본어 검수. 기존 감사 숫자는 기준값으로 남기며 이번에 전수 재집계하지 않았다.

### 16.9 언어 설정 저장소 AsyncStorage 전환 — 2026-10-09

- 설치 여부를 확인한 결과 AsyncStorage 의존성 / 설치 디렉터리가 없었다. 현재 Expo SDK 57의 `bundledNativeModules.json`과 [Expo 공식 설치 안내](https://docs.expo.dev/versions/latest/sdk/async-storage/)에 따라 `expo install @react-native-async-storage/async-storage`로 호환 버전 **2.2.0**을 설치했다. 기본 node shim 대신 설치된 Node 22.23.3으로 Expo CLI를 실행했다.
- `languageStorage.ts`에 언어 전용 저장 adapter를 추가하고 `LanguageProvider`의 read / write만 연결했다. 전용 키 `poparchive.languagePreference`, `system | ko | ja`, resolvedLanguage 분리, 즉시 반영, 기존 2초 복원 타임아웃, 초기 splash gate 및 상태 store의 쓰기 queue는 유지했다. UI와 언어 감지 코드는 변경하지 않았다.

**최초 마이그레이션 순서:**

1. AsyncStorage의 전용 키를 먼저 읽는다. 값이 있으면 이를 우선하며 SecureStore 값으로 덮어쓰지 않는다. 잘못된 값은 기존 store 검증에 따라 system으로 해석한다.
2. AsyncStorage 값이 없을 때만 SecureStore의 같은 언어 키를 읽는다. 이전 값이 있으면 검증한 preference를 AsyncStorage에 저장한다. 이전 값이 잘못됐다면 system으로 정규화해 저장한다.
3. AsyncStorage 저장 성공 후에만 SecureStore의 **언어 키 한 개**를 삭제한다. 다음 실행부터 AsyncStorage 값을 복원하므로 값의 마이그레이션을 반복하지 않는다.
4. AsyncStorage 읽기 / 이전 값 읽기 / 마이그레이션 쓰기 실패 시 원본을 삭제하지 않는다. 복원은 기존 실패 처리대로 system으로 완료하고 다음 실행에서 다시 시도할 수 있다. 이후 사용자 선택의 저장 queue는 실패 때문에 중단되지 않는다.
5. 이전 값 삭제 실패는 저장된 AsyncStorage 값과 UI를 되돌리지 않는다. 다음 읽기 / 저장에서 정리를 재시도한다. 삭제 작업은 초기 복원을 지연시키지 않는다.

**연속 변경 및 타임아웃 보호:** 마이그레이션 쓰기와 사용자 설정 쓰기는 adapter에서도 같은 queue를 사용한다. 선택 revision을 확인해 늦게 읽힌 이전 값이 새 선택 뒤에 저장되지 않게 한다. 이미 진행 중인 마이그레이션 쓰기는 먼저 끝나고 최신 선택이 뒤에 저장된다. 복원 타임아웃 후에도 이전 작업이 UI나 최신 영구 저장값을 덮어쓰지 않는다.

**보존 범위:** 인증용 SecureStore 파일 / 토큰 키 / 로그인·로그아웃 로직은 수정하지 않았다. adapter는 언어 키에 대한 get / set / delete만 수행하며 `clear`, `multiRemove` 등을 사용하지 않는다. 테스트에서 accessToken / refreshToken과 관계없는 AsyncStorage 값이 보존되는 것을 확인했다. 기존 사용자 변경사항도 유지했다.

| 변경 파일 | 내용 |
| --- | --- |
| `package.json`, `package-lock.json` | SDK 호환 AsyncStorage 및 필요한 전이 의존성 추가 |
| `src/locales/languageStorage.ts`(신규) | AsyncStorage 저장·복원, 이전 SecureStore 언어 값 마이그레이션·정리, queue와 revision 보호 |
| `src/locales/LanguageProvider.tsx` | 기존 언어 store의 read / write를 새 adapter에 연결 |
| `tests/i18n.test.cjs` | Provider 저장 mock 전환 및 마이그레이션 테스트 11건 추가 |
| `docs/I18N_AUDIT.md` | 최초 저장 방식에 현재 전환 위치를 안내하고 본 기록 추가 |

검증 결과:

- `node --test tests/i18n.test.cjs tests/authLogout.test.cjs`: **52건 모두 통과**(i18n 36건 + 기존 authLogout 16건). 마이그레이션 3종 preference, 새 값 우선, 유효값 검증, 읽기·쓰기·삭제 실패, 재시도, 느린 복원 / 마이그레이션과 최신 선택 경합, 다른 저장 데이터 보존을 포함한다.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: **exit 0**.
- 이번 변경 파일의 `git diff --check` 및 untracked 파일 공백 검사: 통과.
- 이번 저장소 전환에서는 전체 테스트 / native build / 실기기 검증을 다시 실행하지 않았다. §16.7의 전체 테스트 결과는 이전 1단계 구현 당시 실행 기록이다.
- iPhone 추가 확인: 이전 SecureStore에 ko / ja / system이 저장된 설치에서 업데이트 후 선택 유지, AsyncStorage 복원, 이전 언어 키 정리, 로그인 유지, 앱 종료·재실행 및 빠른 변경 후 복원. AsyncStorage가 기존 development build에 포함돼 있지 않다면 새 native build가 필요하다.

## 17. I18N 2단계 — 홈 화면 UI 현지화 — 2026-10-09

### 17.1 완료 범위와 제외 범위

- 기존 감사의 홈 consumer 목록(§3.1, §4)을 활용하고 현재 `src/app/(tabs)/index.tsx` → `HomeScreen.tsx` → HomeBanner / HomeTrendingSection / HomeNewPopupSection 경로만 확인했다. 앱 전체 문자열 감사는 다시 실행하지 않았다.
- 실제 사용 중인 인기 / 신규 섹션과 두 카드의 고정 UI·접근성 문구를 한국어 / 일본어로 연결했다. 한국어 문구, StyleSheet, 크기·간격·색상·폰트·이미지 비율·캐러셀 속성을 변경하지 않았다.
- HomeBanner는 서버 제목 / 지역명 / 숫자로만 구성된 운영 기간을 표시하며 고정 한국어 안내 문구가 없다. 배너 로딩은 기존 빈 영역, 오류 / 빈 결과는 기존 숨김 처리를 유지했다. 새로운 안내 문구나 재시도 UI를 추가하지 않았다.
- HomePopupSkeleton은 고정 UI 문자열이 없어 유지했다. HomeQuickMenu는 현재 HomeScreen에서 사용하지 않아 수정·재연결하지 않았다. 기존 테스트의 quick-menu 기대 실패를 해결하기 위해 UI를 복구하지 않았다.
- 현재 홈의 카드 상태는 색상과 숫자 기간으로 표시된다. 신규 카드의 `오픈 예정` / `종료`는 내부 상태 비교값이며 표시 문구로 변환하지 않았다. 날짜 formatter는 언어 고유 문구 없이 숫자와 기호를 사용하므로 날짜 계산 / 시간대 / 포맷 / 필터 기준을 유지했다.
- AsyncStorage / SecureStore 마이그레이션 / LanguageProvider / 인증 / Root Stack / 지도 / 다른 탭 코드는 수정하지 않았다. 신규 패키지를 설치하지 않았다.

### 17.2 번역 키와 문구

**신규 14개 + 기존 키 재사용·일본어 보완 4개 = 사용 키 18개.** 기존 키는 `place.filters.countries.kr`, `place.filters.countries.jp`, `place.filters.collapse`, `place.explore.viewDetails`다. 이번에 사용하는 18개 키는 ko / ja 모두 비어 있지 않으며 placeholder가 일치한다. 기존의 다른 namespace 누락 / 빈 값까지 수정하거나 전체 리소스가 완성됐다고 판정하지 않는다.

| 키 | 한국어(기존 문구 유지) | 일본어 |
| --- | --- | --- |
| `home.trending.title` | 지금 뜨는 팝업 🔥 | 今話題のポップアップ 🔥 |
| `home.trending.description` | 요즘 인기 있는 팝업을 모아봤어요! | 人気のポップアップを集めました！ |
| `home.trending.emptyTitle` | 진행 중인 팝업이 없어요 | 開催中のポップアップはありません |
| `home.trending.emptyDescription` | 새로운 팝업을 준비 중이에요 | 新しいポップアップを準備中です |
| `home.trending.showAll` | TOP 10 모두 보기 | TOP 10をすべて見る |
| `home.new.title` | 이번 주 새로 열려요 ✨ | 今週オープン ✨ |
| `home.new.description` | 이번 주 새롭게 오픈하는 팝업을 만나보세요! | 今週オープンするポップアップをチェック！ |
| `home.new.empty` | 이번 주 새로 여는 팝업이 없어요. | 今週オープンするポップアップはありません。 |
| `home.loadFailed` | 팝업을 불러오지 못했어요. | ポップアップを読み込めませんでした。 |
| `home.favoriteRetry` | 찜 상태 다시 시도 | お気に入りを再読み込み |
| `home.favoriteLoadFailed` | 찜 상태를 불러오지 못했어요. 다시 시도 | お気に入りを読み込めませんでした。再試行 |
| `home.more` | 더보기 | もっと見る |
| `home.card.addFavorite` | {title} 찜하기 | {title}をお気に入りに追加 |
| `home.card.removeFavorite` | {title} 찜 취소 | {title}のお気に入りを解除 |
| `place.filters.countries.kr`(재사용) | 한국 | 韓国 |
| `place.filters.countries.jp`(재사용) | 일본 | 日本 |
| `place.filters.collapse`(재사용) | 접기 | 閉じる |
| `place.explore.viewDetails`(재사용) | {title} 상세 보기 | {title}の詳細を見る |

국가·접기·상세 보기는 감사에서 확인한 기존 키를 재사용했다. 찜 키는 기존 `place.all.addFavorite` / `removeFavorite`의 제목 없는 문구와 달리 원래 홈의 `{title} 찜하기` / `{title} 찜 취소`를 보존하는 문장 키다. 공통 키를 새로 중복 생성하지 않았다.

### 17.3 반응성·내부 데이터·서버 콘텐츠

- 두 섹션과 두 카드가 기존 `useTranslation()`을 직접 구독한다. 번역 결과를 모듈 상수로 계산하지 않는다. 국가 metadata에는 고정 labelKey와 KR / JP만 저장하고 표시용 options를 렌더에서 계산한다.
- 기존 컴포넌트에는 React.memo나 번역 결과를 보관하는 useMemo가 없다. 유지된 섹션 / 동일한 카드 props에서도 구독으로 갱신하는 것을 검증했다. 언어 값을 key에 넣거나 섹션·캐러셀을 재마운트하지 않는다.
- 국가 선택, 인기 목록 펼침 상태, 카드 publicId, 찜 상태 및 신규 캐러셀의 country key를 유지한다. 언어 변경이 `useHomePopups`의 country / cache identity를 바꾸거나 추가 조회를 발생시키지 않는다.
- 신규 섹션 더보기는 원래의 `tab=all`, `countryCode=KR|JP`, 이번 주 openingFrom / openingTo, homeNewEntry를 유지한다. 번역된 국가 라벨을 API나 route 인자로 넘기지 않는다.
- 팝업 제목 / 지역명 / 태그명 / 이미지 URL은 서버 원문이다. 카드 접근성 라벨에서도 `{title}` 자체는 원문으로 삽입한다. 지역 / 태그 ID와 API 기본 언어 정책을 변경하지 않았다.
- 현재 홈에는 별도 지역 선택 / 태그 필터 조작 UI가 없다. 지역·태그의 표시 데이터와 기존 ID를 유지했으며, 다른 탭의 필터 동작을 이번 홈 작업의 실기기 검증으로 주장하지 않는다.
- 남아 있는 한국어: 서버에서 받은 제목·지역·태그는 원문이 한국어이면 그대로 표시된다. 공용 탭바의 홈 label(`메인 홈`)과 다른 탭 label은 탭바 변경 금지 범위라 유지했다. 비노출 HomeQuickMenu와 사용하지 않는 `home.title` 일본어 공백도 이번 범위 밖이다. 대상 네 컴포넌트의 남은 한국어 코드 리터럴은 신규 목록 내부 상태 비교 두 개이며 UI 출력이 아니다.

### 17.4 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/components/home/HomeTrendingSection.tsx` | 인기 섹션 제목·설명·국가·오류·빈 상태·펼침 버튼 번역 및 구독 |
| `src/components/home/HomeNewPopupSection.tsx` | 신규 섹션 제목·설명·국가·오류·빈 상태·더보기 번역 및 구독 |
| `src/components/home/NewPopupCard.tsx` | 상세 / 찜 접근성 문구 번역 및 구독 |
| `src/components/home/PopupRankingCard.tsx` | 상세 / 찜 접근성 문구 번역 및 구독 |
| `src/locales/ko.json`, `src/locales/ja.json` | 위 14개 신규 문장과 일본어 기존 4개 키 보완 |
| `tests/homeI18n.test.cjs`(신규) | 실제 번역·store·hook·홈 컴포넌트를 사용한 현지화 동작 검증 5건 |
| `tests/homeNewPopup.test.cjs`, `tests/homeNewRules.test.cjs`, `tests/popupFavoritesRecovery.test.cjs` | 신규 번역 의존성 mock 보완; 기존 기대값 유지 |
| `docs/I18N_AUDIT.md` | 기존 감사 / 1단계 기록을 보존하고 본 절 추가 |

### 17.5 검증 결과

설치된 Node 22.23.3으로 요청 순서에 따라 실행했다.

| 순서 | 검사 | 결과 |
| --- | --- | --- |
| 1 | 관련 기존 `mainBanners`, `homeNewPopup`, `homeNewRules`, `popupFavoritesRecovery` | **45건 / 42통과 / 기존 mainBanners 3실패** |
| 2 | 신규 `homeI18n` + 기존 `i18n` | **41건 모두 통과**(홈 5건 + 기반 36건) |
| 3 | `tsc --noEmit --incremental false` | **exit 0** |
| 4 | `node --test tests/*.test.cjs` | **545건 / 537통과 / 기존 8실패**, 신규 실패 없음 |
| 5 | 이번 변경 파일 `git diff --check` 및 신규·untracked 파일 공백 검사 | 통과 |

알려진 기존 실패 분포와 실제 전체 검사 결과가 일치한다: communityFeed 1 / endingSoonCarousel 1 / mainBanners 3 / placeFavoriteUi 2 / recovery 1. 홈 관련 최초 3개 파일은 변경 전에도 23건 중 20통과 / 같은 mainBanners 3실패였다. 전체 검사 중 발견한 홈 찜 복원 테스트의 구독 hook mock 누락을 보완한 뒤 위 순서로 재실행했다. 정상 기능의 기대값을 삭제하거나 완화하지 않았다.

신규 검증은 사용 키 18개 양쪽 리소스 / placeholder, 기존 한국어 문구, ko → ja → ko / system → ja, 유지된 컴포넌트와 재진입, 국가 KR / JP 선택 및 인기 펼침 상태, 데이터 요청 횟수, 서버 콘텐츠·이미지 props·스타일 유지, 카드 탭·찜 action·이벤트 전파, 더보기 route 인자, 오류 / 빈 결과 / 찜 재시도를 확인한다. 기존 홈 테스트로 배너 캐러셀·이미지·상세 이동·날짜 처리도 검사했다.

위 UI 검증은 실제 소스와 프로젝트의 Node hook harness를 사용한 결과다. 문자열 존재 검사만으로 화면 동작을 판정하지 않았다. React Native 실기기 renderer의 글자 너비 / 줄바꿈 / 스와이프 애니메이션을 실행한 결과는 아니며, 이번 홈 작업의 native build / iPhone 실기기 검증은 수행하지 않았다.

### 17.6 iPhone 확인과 다음 화면

- 사용자는 1단계 언어 선택·재실행 복원이 iPhone에서 정상 동작함을 확인했다. 이번 홈 일본어 UI는 별도 확인이 필요하다.
- 한국어 기존 디자인과 일본어 긴 섹션 설명·빈 상태·오류 문구의 줄바꿈을 작은 iPhone / 큰 글자에서 비교한다. 카드 크기·간격·폰트·색상이 유지되는지 확인한다.
- 다른 탭에서 日本語 / 한국어 / system을 선택한 뒤 홈 복귀 시 제목·국가·접기·더보기·빈 상태·접근성 문구가 즉시 바뀌는지 확인한다. KR / JP 선택과 인기 펼침 상태를 유지해야 한다.
- 신규 카드 가로 스크롤과 배너 paging 위치 / 이미지 비율 / 상세 이동 / 찜 터치·재시도 / 더보기의 국가·기간 전달을 확인한다.
- VoiceOver에서 서버 제목이 보존된 일본어 상세 / 찜 action을 읽는지, 선택 국가와 찜 상태를 읽는지 확인한다. 서버 원문의 한국어는 UI 번역 누락과 구분한다.
- 다음 권장 범위는 플레이스 탭의 고정 UI(검색 placeholder·탭 표시·기간 / 상태 / 필터·빈 상태 / 오류·접근성)다. 지역·태그의 내부 ID와 표시 라벨을 먼저 분리·확인하고, 서버 콘텐츠 언어 정책·공용 탭바 label은 별도 범위에서 처리한다.


## 18. I18N 3단계 — 지역·태그 표시 기반과 플레이스 목록 현지화 — 2026-10-09

### 18.1 확인한 데이터와 표시 구조

- 설정된 개발 API의 공개 GET을 읽어 실제 메타데이터를 확인했다: `/api/regions?countryCode=KR` 14개, `/api/regions?countryCode=JP` 7개, `/api/tags` 11개. 응답은 배열의 숫자 id와 name뿐이며 지역 계층·고정 code·다국어 이름 필드는 없다. 국가 정보는 기존 호출 context로 구분한다. 백엔드·DB·API 계약은 수정하지 않았다.
- `src/locales/filterLabels.ts`는 확인된 API ID → 기존 ko/ja 리소스 key를 연결한다. 지역은 id와 countryCode(제공된 경우)를 확인하고, 태그는 id로 조회한다. 이름만 같다는 이유로 번역하거나 매칭하지 않는다.
- `getRegionDisplayName`, `getPopupRegionDisplayName`, `getTagDisplayName`는 기본적으로 기존 getLocale의 resolvedLanguage를 사용하며 명시적으로 ko/ja를 전달해 순수 테스트할 수도 있다. React에서는 기존 useTranslation 구독을 사용한다. 새 Provider·저장 구조·의존성은 없다.
- ko는 기존 API name을 그대로 유지한다. 알려진 ID의 name이 없으면 한국어 리소스를 사용할 수 있으며 팝업의 원래 지역명이 없거나 공백이면 기존 빈 위치 UI를 유지한다. ja 번역이 없거나 빈 값이면 기존 translate의 ko fallback을 따른다. 미등록 ID·국가 불일치는 원본 name(지역 null은 빈 문자열)으로 fallback한다.
- 표시 함수는 응답 객체를 수정하지 않는다. Sheet에 전달하는 name만 복사하여 번역하고 selected 배열과 callback id는 원래 숫자로 유지한다. 국가 KR/JP, regionIds/tagIds, popup publicId, 운영 상태 enum, 기존 탭 state(탐색/전체), 검색 문자열·기간·cursor·캐시 key·날짜 계산은 변경하지 않았다.
- 탐색 지역 tile의 로컬 ID(seongsu 등)는 getExploreRegionId로 API 숫자 ID에 연결한다. 관심 tile 역시 getExploreTagId를 사용한다. 기존 한국어 name 비교를 제거하고 반환된 options에서 해당 숫자 ID의 존재를 확인한 뒤 필터를 적용한다. 서버가 이름을 바꾸거나 같은 이름이 여러 ID에 있더라도 표시명이 identity가 되지 않는다.
- ID 등록표는 이번에 확인한 환경의 데이터에 근거한다. 새로운 지역/태그 또는 다른 환경의 ID를 사용할 때는 메타데이터 확인 후 등록표를 갱신한다. 미등록 항목은 원문 fallback으로 안전하게 표시하며 이름 기반 추측 매핑은 하지 않는다.

### 18.2 실제 지역 21개·태그 11개

지역은 기존 API 그룹을 그대로 유지한다. 홍대·신촌/강남·서초/경기·인천 등의 복합 그룹을 별개 지역으로 분할하지 않았고, API에 없는 시부야·신주쿠 등을 추가하지 않았다.

| 지역 ID | 국가 | 기존 한국어 | 일본어 표시 | 번역 key |
| --- | --- | --- | --- | --- |
| 1 | KR | 성수 | 聖水 | `place.filters.regions.seongsu` |
| 2 | KR | 여의도 | 汝矣島 | `place.filters.regions.yeouido` |
| 3 | KR | 잠실 | 蚕室 | `place.filters.regions.jamsil` |
| 4 | KR | 홍대·신촌 | 弘大・新村 | `place.filters.regions.hongdae` |
| 5 | KR | 강남·서초 | 江南・瑞草 | `place.filters.regions.gangnam` |
| 6 | KR | 용산 | 龍山 | `place.filters.regions.yongsan` |
| 7 | KR | 서울 기타 | ソウルその他 | `place.filters.regions.otherSeoul` |
| 8 | KR | 경기·인천 | 京畿・仁川 | `place.filters.regions.gyeonggiIncheon` |
| 9 | KR | 부산 | 釜山 | `place.filters.regions.busan` |
| 10 | KR | 대구·경북 | 大邱・慶北 | `place.filters.regions.daeguGyeongbuk` |
| 11 | KR | 대전·충청 | 大田・忠清 | `place.filters.regions.daejeonChungcheong` |
| 12 | KR | 광주·전라 | 光州・全羅 | `place.filters.regions.gwangjuJeolla` |
| 13 | KR | 강원 | 江原 | `place.filters.regions.gangwon` |
| 14 | KR | 제주 | 済州 | `place.filters.regions.jeju` |
| 15 | JP | 도쿄 | 東京 | `place.filters.regions.tokyo` |
| 16 | JP | 오사카 | 大阪 | `place.filters.regions.osaka` |
| 17 | JP | 교토 | 京都 | `place.filters.regions.kyoto` |
| 18 | JP | 나고야 | 名古屋 | `place.filters.regions.nagoya` |
| 19 | JP | 후쿠오카 | 福岡 | `place.filters.regions.fukuoka` |
| 20 | JP | 삿포로 | 札幌 | `place.filters.regions.sapporo` |
| 21 | JP | 일본 기타 | 日本その他 | `place.filters.regions.otherJapan` |

한국 지명 표기는 [한국관광공사 성수 안내](https://japanese.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=223377), [관광공사 지역 안내](https://japanese.visitkorea.or.kr/svc/whereToGo/allRgn/allRegionList.do?menuSn=216), [서울관광재단 성수·용산 안내](https://japanese.visitseoul.net/attractions/2024-gureumdari/JPPouf85a)의 한자 표기를 참고했다. 실제 데이터의 지역 그룹·한국어 이름은 유지하며 도시/행정구역의 전체 공식 명칭을 새 필터로 추가하지 않았다.

| 태그 ID | 기존 한국어 | 일본어 표시 | 번역 key |
| --- | --- | --- | --- |
| 1 | 캐릭터/IP | キャラクター・IP | `place.filters.interests.animeCharacter` |
| 2 | 게임/디지털 | ゲーム・デジタル | `place.filters.interests.game` |
| 3 | 연예/크리에이터 | 芸能・クリエイター | `place.filters.interests.entertainment` |
| 4 | 패션 | ファッション | `place.filters.interests.fashion` |
| 5 | 뷰티 | ビューティー | `place.filters.interests.beauty` |
| 6 | F&B | グルメ・飲食 | `place.filters.interests.foodBeverage` |
| 7 | 아트/전시 | アート・展示 | `place.filters.interests.exhibitionArt` |
| 8 | 문구/소품 | 文具・雑貨 | `place.filters.interests.stationery` |
| 9 | 라이프 | ライフスタイル | `place.filters.interests.lifestyle` |
| 10 | 패밀리/펫 | ファミリー・ペット | `place.filters.interests.familyPet` |
| 11 | 기타 | その他 | `place.filters.interests.other` |

### 18.3 현지화 범위와 번역 리소스

- 홈: HomeBanner의 지역명, HomeTrendingSection/HomeNewPopupSection 카드의 지역·태그를 표시 시 번역한다. 기존 2단계 고정 문구, 카드 action·찜·더보기·날짜·캐러셀·이미지는 유지한다.
- 플레이스 전체: 제목, 탐색/전체 표시, 일반/고정 검색창 placeholder·검색·지우기 접근성, 빈 목록·로딩·오류·재시도, 찜 복원 오류, 적용 필터와 이번 주 오픈 chip, 카드 상태/지역/태그/찜 접근성을 번역했다.
- 플레이스 탐색: 종료 임박 제목·설명·빈 안내·오늘 종료 badge·이전/다음 접근성, 지역 캐러셀·설명, 주간 제목·로딩·오류/재시도·페이지 접근성, 주간 카드 상태/지역/태그/찜, 관심 분야 제목·설명·4개 tile을 번역했다.
- 필터: 국가·빠른 필터, 지역/관심/상태/기간 section 제목, API 지역21·태그11 라벨, 운영 상태·기간 옵션, 초기화·팝업 보기·닫기·상세·해제·지역 펼침/접힘 접근성·옵션 로딩/오류 안내를 번역했다. disabled custom 날짜와 미노출 정렬/행사 유형은 기능을 추가하거나 노출하지 않았다.
- 이번 추가 표시 범위에서 **신규 33개 + 기존 재사용 58개 = 91개 key**를 사용한다. 기존 58개 중 일본어 누락 50개를 보완하고, 8개는 번역값을 그대로 재사용했다. 한국어 기존 key의 값 변경은 0개다. 양쪽 언어 key와 치환 변수 일치를 테스트했다. 기존 전체 감사의 누락·하드코딩 수치는 재집계하지 않았다.
- 신규 33개 key: `place.explore.tab`, `place.all.loading`, `place.all.empty`, `place.all.search`, `place.all.searchPlaceholder`, `place.all.clearSearch`, `place.all.openingWeek`, `place.all.card.upcoming`, `place.all.card.ended`, `place.all.card.ongoing`, `place.explore.endingSoonTitle`, `place.explore.endingSoonDescription`, `place.explore.endingSoonEmpty`, `place.explore.endsToday`, `place.explore.weeklyTitle`, `place.explore.loadFailedRetry`, `place.explore.weeklyPage`, `place.filters.quick._label`, `place.filters.loading`, `place.filters.loadFailed`, `place.filters.regions.yongsan`, `place.filters.regions.otherSeoul`, `place.filters.regions.gyeonggiIncheon`, `place.filters.regions.daeguGyeongbuk`, `place.filters.regions.daejeonChungcheong`, `place.filters.regions.gwangjuJeolla`, `place.filters.regions.gangwon`, `place.filters.regions.jeju`, `place.filters.regions.otherJapan`, `place.filters.interests.entertainment`, `place.filters.interests.stationery`, `place.filters.interests.familyPet`, `place.filters.interests.other`.
- 기존 home 오류/찜 오류, 국가·접기, 기간 제목, community 상세의 재시도 및 category.all을 재사용했다. 전체 label에 중복 신규 key를 만들지 않았다. 공용 리소스의 기존 key 보완은 해당 key를 쓰는 다른 화면에도 자연스럽게 반영되지만 다른 화면 코드/하드코딩을 현지화하지 않았다.
- 대상 11개 화면·컴포넌트의 styles 정의가 작업 전과 동일한 것을 비교했다. 카드 크기·간격·폰트·색상·이미지 비율·애니메이션·Sheet 구조는 유지했다. 일본어 텍스트의 실제 줄바꿈/잘림은 iPhone 검증이 필요하다.

### 18.4 반응성과 필터·요청 보존

- 기존 useTranslation을 유지하고 HomeBanner 페이지·PlaceWeeklySection/PlaceWeeklyPopupList에 필요한 구독을 추가했다. 유지된 화면 및 동일한 props의 카드가 언어 변경에 반응한다.
- Place 전체 FlatList, 종료 임박 FlatList, 주간 FlatList에 resolvedLanguage를 extraData로 전달하여 native list의 순수 렌더 최적화 아래에서도 문구 갱신을 알린다. 언어를 key로 사용하거나 화면을 재마운트하지 않는다.
- 요청 useEffect의 dependencies, queryKey, region/tag options cache, getApiLocale 정책은 그대로다. 언어만 변경해서 국가/지역/태그/운영 상태/기간/검색·팝업 데이터를 초기화하거나 API를 재요청하지 않는다.
- RegionFilterGroup의 기존 측정·접힘 로직은 유지한다. name이 바뀐 Text의 native onLayout 측정으로 칩 너비가 갱신되며, 선택 여부는 숫자 ID로 유지한다. 테스트에서는 측정 event를 주입했고 실제 일본어 너비를 측정한 것으로 주장하지 않는다.

### 18.5 수정 파일

- 신규 공통 표시: src/locales/filterLabels.ts.
- 번역: src/locales/ko.json, src/locales/ja.json.
- 화면: src/screens/PlaceScreen.tsx.
- 홈: src/components/home/HomeBanner.tsx, HomeTrendingSection.tsx, HomeNewPopupSection.tsx.
- 플레이스: src/components/place/AppliedFilterBar.tsx, PlaceFilterSheet.tsx, PlaceInterestSection.tsx, PopupGridCard.tsx, PlaceWeeklySection.tsx, PlaceWeeklyPopupList.tsx, TodayOpeningCarousel.tsx.
- 신규 테스트: tests/filterLabels.test.cjs, tests/placeI18n.test.cjs, tests/helpers/i18nRuntime.cjs.
- 보완 테스트: tests/homeI18n.test.cjs, tests/i18n.test.cjs, tests/placePagination.test.cjs, tests/placePeriodFilter.test.cjs, tests/placeFavoriteUi.test.cjs, tests/popupCategoryPolicy.test.cjs, tests/helpers/uiDependencies.cjs.
- 기록: docs/I18N_AUDIT.md. 총 25개 파일. 기존 미커밋 변경은 보존했다. 인증·저장·지도·상세 화면·API 호출 구현·패키지·native 설정을 수정하지 않았다.

### 18.6 검증 결과

프로젝트의 실제 Node v22.23.3 실행 파일로 아래 명령을 실행했다. 최종 결과 기준이며 초기 실패를 포함한 중간 결과를 통과로 기록하지 않았다.

| 순서 | 명령 | 결과 |
| --- | --- | --- |
| 1 | node --test tests/filterLabels.test.cjs tests/placeI18n.test.cjs tests/i18n.test.cjs | 46/46 통과. 신규 지역·태그3 + Place7 =10, 기존 기반36 |
| 2 | node --test tests/place*.test.cjs tests/popupCategoryPolicy.test.cjs | 48개 중46 통과, 기존 placeFavoriteUi2 실패 |
| 3 | node --test tests/home*.test.cjs tests/popupFavoritesRecovery.test.cjs tests/endingSoonCarousel.test.cjs tests/mainBanners.test.cjs | 52개 중48 통과, 기존 endingSoonCarousel1·mainBanners3 실패. homeI18n은 기존5+신규1 모두 통과 |
| 4 | node node_modules/typescript/bin/tsc --noEmit --incremental false | 통과(exit0) |
| 5 | node --test tests/*.test.cjs | 556개 중548 통과, 기존8 실패; 신규 실패0 |
| 6 | 변경 파일 git diff --check 및 신규/미추적 파일 whitespace 검사 | 통과(exit0), 신규/미추적 파일 trailing whitespace 0건 |

- 작업 전 관련 baseline: 92개 중86 통과·실패6(endingSoonCarousel1/mainBanners3/placeFavoriteUi2). 전체 최종 실패8은 여기에 communityFeed1·recovery1이 더해진 기존 실패 목록과 일치한다. 기존 기대값/정상 기능/스타일을 삭제하거나 완화하지 않았다.
- 구체적 기존 실패: communityFeed의 popup 줄높이, endingSoonCarousel badge 색상, mainBanners footer 위치/gradient/HomeQuickMenu 유지 기대, placeFavoriteUi 기간 margin/주간 태그색, recovery profile 안내 기대다. 이번 범위 밖의 디자인·인증을 고치지 않았다.
- Node hook harness에서 실제 TS 컴포넌트·t·languageStore·useTranslation·목록/옵션 요청 로직을 실행했다. region/tag 매핑21/11, 미등록/동명 다른 ID/국가 불일치/JA 누락 fallback/원본 불변, 즉시 ko↔ja/system, 다중 지역·태그/상태/기간 선택·적용·취소·초기화·chip 해제·탭 복귀, 선택 ID 및 API URL/요청 횟수, 카드 이동/찜/원문 이미지·날짜·스타일 보존을 검증했다.
- 기존 i18n fallback 테스트는 이제 실제로 채워진 상세 필터의 일본어를 명시적으로 검사하고, 여전히 미번역인 back key로 KO fallback 검증을 보존했다. 기존 격리 테스트의 key 반환 mock은 한국어 탭/상태 기대를 유지하도록 보완하고, Sheet의 표시용 복사 배열도 원래 모든 ID/name이 같은지 검증한다.
- React Native 실제 렌더러·네이티브 build·iPhone Stage3 실기기 검증은 수행하지 않았다. F06/로그인/상세 이동 등 기존 테스트 실행은 해당 실제 기기 동작을 확인했다는 뜻이 아니다.

### 18.7 남은 영역·iPhone 검증·다음 작업

- 범위 안에서 남아 있는 한국어 코드 리터럴은 내부 탭/상태 비교와 비노출 알림 주석이다. 미등록 지역/태그의 원문 fallback은 한국어일 수 있다. 실제 API에 없는 기존 정적 지역·미노출 기능의 미번역 key는 이번에 임의로 채우지 않았다.
- 팝업 제목·소개·공지·자유 운영시간·공식 행사명, 사용자 리뷰/커뮤니티/닉네임은 자동번역하지 않는다. 지도/팝업 상세/커뮤니티 전체 UI·공용 FloatingTabBar·로그인/설정 밖 화면은 이번 현지화 범위 밖이다.
- iPhone: ko/ja/system 전환을 홈·Place가 유지된 상태와 다른 탭에서 설정 후 복귀 상태에서 확인한다. 초기 복원은 사용자 확인된 Stage1을 유지했으며 Stage3에서 재실행 실기기 검증을 다시 수행한 것은 아니다.
- iPhone: 한국/일본×한국어/일본어 4조합의 지역·태그 라벨, 다중 지역/태그·상태·기간 선택 유지, Sheet 임시 변경/취소/적용/초기화, 지역 펼침/접힘·선택 숨김 자동 펼침을 확인한다.
- iPhone: 작은 화면·큰 글자·VoiceOver에서 복합 지역명과 긴 일본어 태그, 필터 버튼·상태 badge·검색 placeholder·오류/페이지 접근성의 잘림·겹침을 확인한다. 카드/찜 탭, 국가 전환, 캐러셀 swipe/주간 선택/페이지, 다음 페이지/재시도/이미지·상세 이동도 확인한다.
- iPhone: 언어 변경만으로 요청/필터/스크롤/지도 카메라/마커·로그인 상태가 바뀌지 않는지 기존 로그·동작으로 확인한다.
- 다음 단계: 이번 공통 라벨 유틸을 지도·팝업 상세의 표시 영역에 적용하고 각 화면의 고정 UI를 순차 현지화한다. F06·지도 검색·상세 데이터/인증은 독립적으로 보존하며 서버 콘텐츠 번역과 공용 탭바 문구는 별도 범위로 결정한다.

## 19. I18N 4단계 — 지도·팝업 상세 UI 현지화 (2026-10-09)

### 19.1 구현 범위

- 지도 native 화면: 장소/팝업 검색 placeholder, 검색어 지우기·취소, 전체/태그 칩, 현재 위치 접근성·권한/위치 오류 안내, 팝업 조회 오류, 지역 팝업 개수 버튼·지도로 돌아가기 문구를 현지화했다.
- 지도 검색 overlay: 장소/팝업 제목, 검색 중·위치 확인 중·위치 확인 오류·검색 오류·결과 없음 문구를 현지화했다. 기존 검색 상태/query/debounce/결과 선택/카메라 이동/pending search를 수정하지 않았다. 내부 resolveError 값은 그대로 두고 해당 오류의 표시 영역만 번역한다.
- 지도 미리보기·목록: 운영 상태, 일정 미정, 숫자 ID가 있는 태그, 목록 로딩·오류/재시도·빈 안내를 현지화했다. 날짜 계산/포맷, 원본 팝업 제목, 포스터·이미지·카드 이동은 그대로다.
- 실제 native 지도에 지도 설정·지도 종류·일반/위성 지도 선택 UI가 없어 이번에 기능·문구를 새로 만들지 않았다. web 지도 구현은 이번 범위 밖이다.
- 팝업 상세: 팝업 정보/방문 리뷰 탭, 기존 기본정보·예약·기간/시간/장소 및 미정 라벨, 공지/혜택 제목, 운영 상태·지역/태그, 찜/공유/별점/후기 접근성·개수, 위치·지도 보기·길찾기, 소개·하이라이트·공식 채널·정보 수정 제보, 조회/찜/링크 오류 안내를 현지화했다. 입장료/무료/유료 등 실제 표시되지 않는 항목은 추가하지 않았다.
- 상세 리뷰 탭: 작성/로그인 후 작성, 빈 목록·안내, 오류/재시도·더 보기, 화면 열기/좋아요 오류를 현지화했다. 직접 사용하는 공유 리뷰 카드의 사진/좋아요 접근성과 리뷰 분류·상대 시간도 번역한다. 리뷰 본문·닉네임·평점·사진·상호작용을 유지했다. 공유 키 보완은 다른 소비 화면에도 자연스럽게 반영되지만 커뮤니티 전체를 현지화한 것은 아니다.
- 공지/혜택의 측정된 하위 GuidanceCard에도 useTranslation 구독을 추가했다. 소개 이미지 오류는 번역하고 기존 FlatList에 resolvedLanguage extraData를 전달한다. 지도 목록 FlatList와 하위 카드도 언어 갱신을 구독한다.

### 19.2 공통 지역/태그와 번역 키

- 3단계 src/locales/filterLabels.ts를 수정하지 않고 재사용했다. 상세는 regionId/countryCode/regionName으로 지역을 표시하고, 지도 카드/목록·상세의 태그는 tag.id로 표시한다. 원본 API 객체와 숫자 ID는 불변이며 미등록 ID는 원문 fallback을 유지한다. 기존 지역21·태그11 레지스트리를 그대로 사용하고 신규 지역/태그를 추가하지 않았다.
- 지도 검색 PopupSearchResult에는 regionName만 있고 regionId/countryCode가 없다. 이름으로 ID를 추정하지 않고 검색 결과 지역명·주소를 원문으로 유지한다. PopupMapMarker에는 지역 필드가 없어 지역 UI를 새로 추가하지 않았다.
- 지도 필터의 기존 내부 값(한국어 카테고리 문자열)과 마커 스타일/분기/필터링은 그대로다. 표시 전용 대응표만 기존 검증된 태그 숫자 ID와 연결하여 getTagDisplayName으로 라벨을 렌더링한다. chip key와 선택값은 번역 문자열로 바꾸지 않는다.
- 대상 표시 범위는 **신규 공통 키47개 + 기존 키74개 재사용 =121개**다. 74개에는 공통 지역21·태그11 및 동적으로 선택하는 하이라이트/공지/혜택·상태 키를 포함한다. 이번 기능에 쓰이는 양 언어 키와 치환 변수 일치를 검사했다. 기존 한국어 번역값 변경은 0개다. 전체 감사의 누락 수치는 재집계하지 않았다.
- 신규47개: map.search.* 6개, map.currentLocation/returnToMap/viewPopups/popupLoadFailed/popupMissing/refreshAndRetry/locationPermissionTitle/locationPermissionDescription/locationFailed/checkLocationService/listLoading/listEmpty 12개, place.detail의 일정·정보 탭·공유·찜·오류·별점/후기·위치/지도/길찾기·제보·이미지 키18개, place.detail.reviews.* 11개.
- 기존 한국어 키6개의 일본어를 보완했다: place.explore.back, place.filters.eventTypes.popup, community.reviewFilterLabel, community.time.minutesAgo/hoursAgo/daysAgo. reviewFilterLabel은 일본어 리소스에 없던 기존 한국어 키를 등록한 경우다. 나머지 재사용 키의 일본어는 유지했다.
- 기존 기본정보/예약·하이라이트·공지/혜택·공식 채널, operationStatuses, place.all.card.*, 찜/검색어 지우기, category.all·취소·재시도·목록 오류 문구를 재사용했다.

### 19.3 기존 기능과 디자인 보존

- 언어 설정 저장/마이그레이션·LanguageProvider·인증·API 구현·Root Stack·native 지도 설정·패키지 변경은 없다. 기존 미커밋 변경을 보존했다.
- 지도/상세 데이터는 getApiLocale의 기존 ko 요청 정책을 유지한다. UI 언어를 요청 파라미터/캐시 키로 사용하지 않고 검색·상세 조회 effect 의존성에 추가하지 않았다.
- 작업 직전 snapshot과 비교하여 대상9개 TSX의 styles 및 React key가 동일함을 확인했다. 지도 useEffect/useMemo 본문·의존성과 상세 조회 effect 의존성도 그대로다. F06 bounds/overscan/클러스터/선택 마커 보존, Reanimated/스냅/시트 높이·카메라·검색 행동을 수정하지 않았다.
- MapView·포스터·시트·상세 전체에 언어 key를 추가하지 않는다. 공지 pager key의 API languageCode도 ko를 유지하여 UI 언어 전환이 pager를 재마운트하지 않는다. 언어 변경만으로 필터·query·선택 마커/팝업·시트 열림·상세 탭·이미지 페이지를 초기화하지 않는다.
- 리뷰 작성/수정/삭제·찜·로그인 복귀의 기존 핸들러/라우트는 유지한다. 리뷰 메뉴 바텀시트는 수정 금지 범위여서 ReviewActions 및 해당 메뉴/삭제 안내의 한국어는 남겨두었다. 길찾기/제보 등 기존 미구현 동작을 새로 구현하거나 우회하지 않았다.

### 19.4 수정 파일 (19개)

- 화면2: src/screens/MapScreen.native.tsx, src/app/places/[id].tsx.
- 지도3: src/components/map/MapSearchOverlay.tsx, MapPopupPreviewCard.tsx, MapPopupListSheet.tsx.
- 상세3: src/components/place/PopupReviews.tsx, IntroductionImageCarousel.tsx, PopupGuidanceCarousel.tsx.
- 공유 리뷰 카드1: src/components/community/CommunityPostItem.tsx.
- 번역2: src/locales/ko.json, src/locales/ja.json.
- 신규 테스트1: tests/mapDetailI18n.test.cjs (8건).
- 보완 테스트6: tests/mapSearch.test.cjs (신규2건 및 locale mock), popupFavoriteDetail.test.cjs, reviewSynchronization.test.cjs, communityComments.test.cjs, communityLikes.test.cjs, i18n.test.cjs.
- 기록1: docs/I18N_AUDIT.md. 기존 테스트 기대값/정상 기능은 유지하고 번역 키를 그대로 반환하던 격리 mock을 필요한 소비 컴포넌트에서 실제 한국어 번역으로 바꿨다. 기존 back fallback 테스트는 새 일본어를 명시적으로 검사하고 여전히 빈 notFound 키로 fallback 검증을 유지했다.

### 19.5 검증 결과

Node v22.23.3으로 아래 명령을 실행했다. 기존 디자인/인증 실패를 고치기 위한 관련 없는 변경은 하지 않았다.

| 순서 | 명령 | 최종 결과 |
| --- | --- | --- |
| 1 | node --test tests/mapDetailI18n.test.cjs tests/i18n.test.cjs tests/filterLabels.test.cjs tests/homeI18n.test.cjs tests/placeI18n.test.cjs | 60/60 통과 (이번 신규8 포함) |
| 2 | node --test tests/mapSearch.test.cjs tests/mapMarkerBounds.test.cjs | 58/58 통과 (이번 신규2 포함) |
| 3 | node --test tests/popupStructuredDetail.test.cjs tests/popupFavoriteDetail.test.cjs tests/popupGuidance.test.cjs tests/popupHeroImage.test.cjs tests/popupNavigation.test.cjs tests/reviews.test.cjs tests/reviewSynchronization.test.cjs tests/reviewMenus.test.cjs | 99/99 통과 |
| 추가 | node --test tests/communityComments.test.cjs tests/communityLikes.test.cjs | 공유 소비 화면 회귀 38/38 통과 |
| 4 | node node_modules/typescript/bin/tsc --noEmit | 통과(exit0) |
| 5 | node --test tests/*.test.cjs | 566개 중558 통과·기존8 실패·신규 실패0 |
| 6 | 변경 파일 git diff --check 및 신규/미추적 파일 whitespace 검사 | 통과(exit0) |

- 작업 전 지도/상세 관련 baseline 155/155 통과. 전체 최종 실패는 직전556/548 기준의 동일한8건이다: communityFeed1(카드 popup 줄높이), endingSoonCarousel1(badge 색상), mainBanners3(footer/gradient/HomeQuickMenu 기대), placeFavoriteUi2(기간 margin/주간 태그색), recovery1(profile 안내 기대).
- 실제 TS 화면·컴포넌트·languageStore·t·useTranslation을 실행하는 Node hook harness로 ko↔ja/system, 탭/측정 pager/이미지 페이지·시트 열림·마커 선택·태그 선택·MapView ref/key 보존을 검사했다. query/태그 internal key/마커 ID·좌표·API locale/파라미터/호출 횟수·클러스터 인덱스 갱신 횟수도 검사했다. 미등록 태그 fallback·API 원본 불변, 카드/지도 이동·공유·공식 채널·리뷰 로그인 진입, 이미지·서버 본문 보존을 확인했다.
- 별도 key/문자열 검사는 실제 동작 테스트를 보조한다. Native 렌더러/레이아웃 측정·Google Maps 실제 카메라·Gesture/Reanimated 애니메이션·네이티브 빌드·iPhone 실기기 검증은 수행하지 않았다. 지도 검색 기능의 기존 문제나 native 흰 배경 문제를 해결했다는 의미가 아니다.

### 19.6 서버 콘텐츠·남은 영역·iPhone 확인·다음 단계

- 번역 제외: 서버 팝업 제목/공식 행사명, 소개/공지/혜택/하이라이트 본문, 자유 운영시간, 상세 주소/층수, 리뷰 본문/닉네임, Google 장소 결과/제공자 이름. 원문 유지하며 자동번역을 추가하지 않았다.
- 남은 영역: 리뷰 메뉴/삭제 확인 안내, 공용 FloatingTabBar, web 지도, 리뷰 작성/별도 리뷰 상세, 커뮤니티/프로필 등 다른 화면의 하드코딩 UI. ID 없는 지도 검색 지역·미등록 ID fallback은 한국어 원문일 수 있다. 미노출 설정/입장료 UI와 미사용 일본어 키는 새로 채우지 않았다.
- iPhone: ko/ja/system 전환과 다른 탭의 설정 변경 후 지도 복귀, 열린 지도 목록/미리보기·선택 마커/태그/query/카메라 위치 유지, 상세 정보/리뷰 sticky 탭 및 공지/혜택·소개 이미지 페이지 유지를 확인한다.
- iPhone: 모든11개 태그·상세 지역/미등록 fallback, 일본어 검색 placeholder/검색 중·오류·빈 상태·팝업 개수·위치 권한 안내, 상세 기본정보/예약·리뷰 빈/오류·공식 채널·제보 접근성을 확인한다. 작은 화면/큰 글자/VoiceOver의 잘림·겹침은 실기기로 확인해야 한다.
- iPhone: 지도 검색/마커·클러스터/스크롤·시트 터치/스와이프, 상세 이동/뒤로/지도 복귀·공유/찜·리뷰 작성/수정/삭제·로그인 복귀·이미지 표시가 기존과 같고 언어만 바꿀 때 추가 API 요청이 없는지 확인한다. 기존 Google Maps 설정·검색 장애 검증은 별도 작업으로 유지한다.
- 다음 단계 권장: 별도 리뷰 상세·작성/수정 및 리뷰 메뉴의 고정 UI를 범위 승인 후 현지화하고, 이후 커뮤니티/마이페이지를 화면 단위로 진행한다. 공용 탭바는 디자인을 유지하는 문구 작업으로 별도 범위를 정한다. ID 없는 검색 지역의 다국어 표시와 서버 콘텐츠 번역은 별도 데이터/API 정책 설계가 필요하다.

## 20. 실행 중 언어 변경 누락 수정 (2026-10-09)

- 실기기 재현 근거: 한국어에서 일본어로 변경할 때 일부 제목·설명·배너 지역명은 한국어로 남고, 앱을 완전히 종료한 뒤 실행하면 일본어로 표시된다. 이번 작업에서 직접 iPhone을 검증한 것은 아니다.
- 실제 원인: app.json의 experiments.reactCompiler=true. 대상 컴포넌트는 이미 useTranslation 구독과 정상 ko/ja 키를 사용하고 있었다. 그러나 구독 결과를 버리고 전역 t()/기본 언어 인자가 생략된 지역명 함수로 번역했다. 설치된 babel-plugin-react-compiler(target19)로 변환한 코드를 확인하니 제목/설명의 JSX는 memo_cache_sentinel 분기에서 처음 한 번만 계산되고, 배너 popups.map 캐시에는 UI 언어 의존성이 없었다. 컴포넌트가 재렌더되어도 이전 번역 JSX가 재사용된다. 번역 리소스 누락·useState 초기 번역 저장·명시적 React.memo가 원인이 아니었다.
- 홈 인기 제목/설명과 신규 제목/설명: useTranslation에서 반환하는 현재 resolvedLanguage에 연결된 t를 사용한다. 이번 주 신규 섹션에도 동일 원인이 확인되어 수정했다. 카드의 공통 지역/태그 함수에도 resolvedLanguage를 명시한다.
- 플레이스 지역 제목, 취향 제목/설명·카테고리: 동일한 hook t를 사용한다. 지역 FlatList에는 resolvedLanguage extraData도 전달하여 고정 pages 아래의 지역 라벨·페이지 설명 접근성도 갱신한다. 지역 페이지의 설명은 현재 코드에서 페이지 버튼의 접근성 라벨이며 별도의 설명 UI를 추가하지 않았다.
- 배너의 장소 표시는 GET /api/main-banners 응답의 regionName이며, MainBannerPopup에 countryCode/regionId가 있다. 기존 getPopupRegionDisplayName(popup, resolvedLanguage)을 호출한다. API 원본·배너 행사명/name·미등록/누락 regionId의 장소 원문은 유지한다. 이름 추정 매핑이나 API 계약 변경은 없다.
- useTranslation에 언어에 연결된 t를 추가했다. useMemo의 resolvedLanguage 의존성으로 번역 함수가 변경되므로 Compiler/메모 소비자가 변경을 인식한다. 같은 resolvedLanguage에서는 t 참조를 유지한다. 기존 snapshot 필드·전역 t·LanguageProvider·저장/복원·인증 구조는 유지한다.
- 변경 파일10개: src/hooks/useTranslation.ts; src/components/home/HomeTrendingSection.tsx, HomeNewPopupSection.tsx, HomeBanner.tsx; src/components/place/PlaceRegionSection.tsx, PlaceInterestSection.tsx; tests/i18nCompiler.test.cjs(신규), tests/helpers/i18nRuntime.cjs, tests/helpers/uiDependencies.cjs; docs/I18N_AUDIT.md. PlaceScreen은 호출/유지 경로만 확인했고 수정하지 않았다. 리소스·패키지·app.json도 변경하지 않았다.
- 테스트 보완: 기존 TS transpile만 수행하던 harness에 선택적 Compiler 변환/메모 캐시 실행을 추가했다. Native I/O는 계속 mock이고 실제 Compiler의 캐시 분기를 실행한다. 실제 subscribe 변경 시 재구독도 반영한다. 격리 mock에는 hook t를 제공한다. 기존 테스트 기대값은 유지했다.

| 검증 | 명령 | 결과 |
| --- | --- | --- |
| Compiler 회귀 | node --test tests/i18nCompiler.test.cjs | 신규5/5 통과. 수정 전 기존4개 화면 시나리오는 일본어 갱신 assertion에서 실패함을 확인 |
| 관련 기존 회귀 | node --test tests/i18n.test.cjs tests/homeI18n.test.cjs tests/placeI18n.test.cjs tests/filterLabels.test.cjs tests/homeNewPopup.test.cjs tests/homeNewRules.test.cjs tests/mainBanners.test.cjs tests/placePagination.test.cjs tests/placePeriodFilter.test.cjs tests/placeFilterSheetUi.test.cjs | 106개 중103 통과·기존 mainBanners3 실패 |
| TypeScript | node node_modules/typescript/bin/tsc --noEmit | 통과(exit0) |
| 전체 | node --test tests/*.test.cjs | 571개 중563 통과·기존8 실패·신규 실패0 |
| Diff | 변경 파일 git diff --check 및 신규/미추적 파일 whitespace 검사 | 통과(exit0) |

- 기존8 실패는 직전566/558과 같다: communityFeed1, endingSoonCarousel1, mainBanners3, placeFavoriteUi2, recovery1. 관련 없는 디자인/인증 실패는 수정하지 않았다.
- Compiler 적용 후 동일한 컴포넌트/props·API 데이터를 유지한 ko→ja→ko/system 전환, 부모 재진입 없이 구독에 의한 갱신, 숨긴 플레이스 탐색 후 복귀를 검사했다. 제목/설명·지역/카테고리·페이지 접근성, memo [t] 값 갱신, 국가/다중 지역·태그/탭/랭킹 펼침·지역/배너 페이지·key/ref 보존, 원문·API locale/요청 URL/호출 횟수 유지가 통과했다. 대상5개 TSX의 styles·key와 데이터 요청 hook/상태 처리 코드는 작업 전과 동일하다. 화면 key/Root Stack 변경·강제 reload/navigation.reset·언어 변경을 이유로 한 API 재호출은 추가하지 않았다.
- iPhone 재확인: 홈 유지 및 다른 탭의 설정 변경 후 복귀에서 인기/신규 제목·설명, 배너 지역명을 ko↔ja 양방향 확인한다. 플레이스 탐색/전체 전환 뒤 지역/취향 제목·설명·카테고리·지역 페이지 접근성과 선택 국가/다중 필터·랭킹 펼침·캐러셀 위치가 유지되는지 확인한다. 언어 변경만으로 추가 요청이 없는지, 일본어 레이아웃과 서버 제목·ID 없는 장소 원문이 보존되는지도 확인한다. 실기기/native build 검증은 수행하지 않았다.

## 21. I18N 5단계 — 리뷰 현지화 및 Compiler 안전 규칙 (2026-10-09)

### 21.1 구현 범위와 공식 규칙

- 공식 규칙은 [CONVENTIONS.md의 i18n 절](./CONVENTIONS.md#i18n--react-compiler-환경의-ui-작성-규칙)에 한 곳으로 정리했다. Hook의 언어에 연결된 t, memo/callback 의존성, 전역 t 제한, ID/표시 라벨 분리, 고정 UI/서버 콘텐츠 구분, 기존 한국어 보존 및 마운트 중 ko↔ja 테스트 의무를 포함한다. LanguageProvider·언어 저장·Hook 구현은 이번에 변경하지 않았다.
- 리뷰 상세 src/app/reviews/[id].tsx: 방문 리뷰 제목/표시, 메뉴 접근성, 읽기 실패/없음/재시도, 편집 화면·팝업 열기 오류, 좋아요 접근성/실패, 삭제 확인/실패를 현지화했다. 시간 유틸에 Hook t를 명시하여 분/시간/일 표시도 반응한다.
- 작성/수정은 src/app/reviews/write.tsx 한 폼을 공유한다. 헤더/등록/수정 완료, 별점 안내·접근성, 후기 안내·placeholder·접근성, 사진/최대 5장/추가/삭제, 길이 검증, 읽기/등록/수정/중복/권한 오류, 미확정 결과 안내, 작성 중 이탈 확인을 현지화했다. 등록/수정 오류 state에는 번역 결과 대신 키를 저장하여 이미 표시된 오류도 즉시 번역된다.
- 리뷰 카드의 ReviewActions와 공통 CommunityPostMenu에 Hook t를 연결했다. 메뉴는 기존 수정/삭제/취소 문구만 대상이며, 실제 존재하지 않는 신고 UI를 추가하지 않았다. Modal·Animated·제스처·완료 콜백·160/200ms 타이밍·safe area·edgeToEdge·backdrop·pointerEvents·열림/닫힘 처리를 변경하지 않았다.
- 공유 CommunityImageCarousel에 Hook t와 FlatList extraData=resolvedLanguage를 연결했다. 이미지 접근성만 변경되며 기존 width key·사진 원문·이미지 순서·현재 페이지 유지 경로는 그대로다. 기존 방문 리뷰 탭(PopupReviews)은 중복 수정하지 않았다. 공유 컴포넌트의 기존 커뮤니티 소비자도 이 두 컴포넌트의 번역 반응성은 함께 적용받는다.
- 상세/ReviewActions의 비동기 삭제 실패 및 상세 좋아요 실패 Alert는 [t] Effect로 최신 Hook 번역 함수를 ref에 보관하고 완료 시 호출한다. 작업 중 언어를 바꾼 뒤 실패해도 새 언어를 사용한다. 이미 열린 네이티브 Alert는 생성 당시 문구를 유지하며 재호출 시 새 언어가 적용된다. 이를 위해 Alert나 화면을 재마운트하지 않는다.

### 21.2 번역 키와 원문 보존

- **신규30 + 재사용22 = 대상52개 키**. 신규는 review.* 6개, review.write.* 24개이며 양 언어에 등록했다. 기존 community.writeBack의 빈 일본어만 戻る로 보완했다. 기존 한국어 리소스 변경0개를 작업 전 스냅샷과 비교했다. 한국어 문장부호·공백과 대상5개 TSX의 StyleSheet 값은 보존했다. 레이아웃/폰트/버튼/이미지 비율 변경은 없다.
- 재사용22: place.explore.back; place.detail.reviews.write/openFailed/like/unlike/likeFailed; place.detail.tryLater; community.delete.message/confirm/action; community.cancel; community.writeBack; community.reviewFilterLabel; community.detail.retry/image; community.edit.action; community.imageError.permission/limit/conversion; community.time.minutesAgo/hoursAgo/daysAgo.
- 리뷰 원문·닉네임·팝업 제목·이미지·서버 자유 텍스트는 자동번역하지 않는다. 기존 API 상태 코드에 따른 앱 메시지 매핑만 번역하고 서버 오류 원문을 임의 변환하지 않는다. 리뷰의 popup에는 지역/태그 표시 UI가 없어 새 매핑을 추가하지 않았다. 공통 숫자 ID 라벨 유틸은 그대로다.

### 21.3 Compiler 검증 및 재발 방지

- tests/helpers/reactCompiler.cjs에 기존 Babel Compiler 변환을 재사용 가능한 테스트 함수로 분리했다. React19 target 및 source hot-reload cache reset 비활성화 조건을 유지한다. 기존 home/place Compiler 테스트의 캐시 생성 assertion은 유지했다.
- 이번 대상도 실제 설치된 Compiler를 실행한 출력을 테스트 런타임으로 렌더링했다. useTranslation과 CommunityImageCarousel은 실제 memo 캐시가 생성되었다. 작성/수정 화면·상세·ReviewActions는 기존 try/finally 처리 제약으로, CommunityPostMenu는 기존 render 중 ref 접근 제약으로 Compiler가 최적화를 건너뛰었다. 이 네 파일은 캐시가 생성됐다고 주장하지 않는다. 해당 bailout 사유를 명시적으로 assertion하고 로직을 변경해서 강제 최적화하지 않았다.
- tests/i18nUiConventions.test.cjs + helpers/i18nUiGuard.cjs: 직전 수정한 홈/플레이스5개와 이번 대상5개 TSX를 검사한다. TypeScript symbol 기반으로 전역 t alias/namespace 호출, 모듈 번역값, translated useState, literal memo/callback 의존성의 명백한 누락을 검출한다. memo wrapper·변수 shadowing·React 외부 유틸의 허용도 테스트한다. 동적 의존성 배열·spread·복잡한 데이터 흐름은 추정해서 차단하지 않는다. 후속 작업자가 대상 컴포넌트를 scope에 추가해야 하며 앱 전체 자동 검사는 아니다.
- 렌더링 테스트는 동일 컴포넌트를 유지한 ko→ja→ko 및 system의 적용 언어 변경, 이미 표시된 오류/미확정 상태의 갱신을 확인했다. 작성/수정 모드·대상ID·본문·별점·기존/새 이미지 순서·캐러셀 page/key·열린 메뉴를 유지한다. 언어 변경만으로 읽기/쓰기/이미지 선택 요청이 늘지 않으며 실제 submit handler에 전달되는 ID/rating/content/retained image ID/새 이미지와 완료 이동을 검사했다.
- 네이티브 UI/라우터/네트워크 경계는 mock이다. 실기기 포커스·키보드·일본어 줄바꿈·120Hz 성능·실제 서버/업로드 성공은 자동 테스트만으로 검증됐다고 주장하지 않는다.

### 21.4 변경 파일 (19개)

- 제품 코드8개: src/app/reviews/[id].tsx; src/app/reviews/write.tsx; src/components/reviews/ReviewActions.tsx; src/components/community/CommunityPostMenu.tsx; src/components/community/CommunityImageCarousel.tsx; src/lib/communityTime.ts; src/locales/ko.json; src/locales/ja.json.
- 테스트/헬퍼9개: tests/reviewI18n.test.cjs(신규); tests/i18nUiConventions.test.cjs(신규); tests/helpers/reactCompiler.cjs(신규); tests/helpers/i18nUiGuard.cjs(신규); tests/i18nCompiler.test.cjs; tests/reviews.test.cjs; tests/writeNavigation.test.cjs; tests/communityLikes.test.cjs; tests/loginReturn.test.cjs. 기존 기능 assertion을 유지하면서 대상 화면의 key→key 번역 mock을 실제 한국어 번역으로 교체했다. 리뷰 상세 뒤로가기 테스트도 이제 실제 한국어 접근성 라벨을 조회한다.
- 문서2개: docs/CONVENTIONS.md; docs/I18N_AUDIT.md. 기존 미커밋 코드/문서와 감사 기록을 보존했다. 신규 패키지·API·auth·F02·F10·Root Stack·지도/F06·다크모드 변경은 없다.

### 21.5 실행 결과

명령의 node는 설치된 Node22.23.3 실행 파일을 직접 사용했다.

| 순서 | 검증/명령 | 결과 |
| --- | --- | --- |
| 1 | node --test tests/reviewI18n.test.cjs tests/i18nUiConventions.test.cjs | 신규20/20 통과 (리뷰15 + 정적 규칙5) |
| 2 | node --test tests/i18nCompiler.test.cjs | 기존Compiler5/5 통과 |
| 3 | node --test tests/reviews.test.cjs tests/reviewMenus.test.cjs tests/reviewSynchronization.test.cjs tests/writeNavigation.test.cjs tests/communityLikes.test.cjs tests/communityComments.test.cjs tests/communityDetail.test.cjs tests/communityMutations.test.cjs tests/communityPost.test.cjs tests/loginReturn.test.cjs | 관련152/152 통과 |
| 4 | node node_modules/typescript/bin/tsc --noEmit | 통과(exit0) |
| 5 | node --test tests/*.test.cjs | 591개 중583 통과·기존8 실패(exit1)·신규 실패0 |
| 6 | 변경 파일 git diff --check + 미추적 파일 no-index --check | 통과(exit0) |

- 직전571/563에 신규20개를 추가한 결과다. 기존 실패8의 분포와 테스트는 동일하다: communityFeed1, endingSoonCarousel1, mainBanners3, placeFavoriteUi2, recovery1. 관련 없는 기존 실패를 수정하지 않았다.
- 미추적 파일은 git diff --no-index --check의 출력이 없는 차이 exit1을 정상으로 처리하여 공백 오류 여부를 확인했다. 전체 변경19개 검사 스크립트의 최종 exit는0이다.
- 작업 전 관련 리뷰/메뉴/동기화/이탈 방지71개도 전부 통과했으며 작업 후 동일 기능 기대값을 유지했다. 대상5개 styles 및 메뉴 state/ref/effect/callback/memo/animation 코드를 작업 전과 비교하여 동일함을 확인했다. API 구현/요청 조건·폼 복원 Effect 의존성·리뷰 집계·mutation lock·로그인 복귀/이탈 guard는 변경하지 않았다.

### 21.6 남은 영역과 후보 위험

앱 전체 감사는 재실행하지 않았다. 직접 관련 경로에서 확인한 기존 후보이며, 이번 범위에서 일괄 수정하지 않았다. 실행 시 실제 증상이 있다고 단정하지 않고 후속 단계에서 Compiler 출력과 유지 화면 전환을 검증한다.

| 기존 후보 | 근거 | 위험도 |
| --- | --- | --- |
| src/components/place/PopupReviews.tsx:20 | discard Hook 호출과 전역 t; 방문 리뷰 탭은 4단계 범위라 중복 작업 제외 | 높음 |
| src/components/community/CommunityPostItem.tsx:45 | discard Hook 호출, 전역 t 및 기본 언어 시간 유틸 경로 | 높음 |
| src/components/place/PopupGuidanceCarousel.tsx:34,139 | 상위/하위 컴포넌트 discard Hook + 전역 t | 높음 |
| src/components/place/PlaceWeeklySection.tsx:71 | resolvedLanguage 구독과 별개로 전역 t 사용 | 중간~높음 |
| src/components/map/MapSearchOverlay.tsx:50 | discard Hook + 전역 t | 높음 |
| src/components/map/MapPopupListSheet.tsx:36,114 | 하위 카드 discard Hook/암묵 언어 라벨, 상위 전역 t | 높음 |
| src/app/places/[id].tsx:111,181,558 | discard Hook, 전역 번역 및 지역/태그 유틸에 언어 미전달 | 높음 |

- 커뮤니티 본문/작성·마이페이지 내 리뷰 목록 등 전체 현지화는 이번 대상 밖이다. 대상 리뷰 화면에서 확인한 고정 UI는 번역했고 사용자/서버 원문은 의도적으로 유지했다.
- 다음 권장 범위: 위 후보의 Compiler 반응성 보완을 먼저 진행하고 커뮤니티 상세·작성/댓글 고정 UI를 다음 현지화 단계로 다룬다. 지도 검색·F06·API·애니메이션은 계속 별도 범위로 유지한다.

### 21.7 iPhone 실기기 확인 항목 (미실행)

- 리뷰 상세를 유지하거나 다른 탭 설정에서 돌아와 ko↔ja/system 전환 시 헤더·시간·좋아요 접근성·오류/재시도 갱신, 닉네임/리뷰/팝업 원문 유지.
- 작성/수정 중 본문·별점·사진 여러 장/순서·수정ID·입력 포커스/키보드를 유지하고 placeholder·버튼·사진 접근성·이미 표시된 검증 오류만 갱신되는지 확인.
- 열린 리뷰 메뉴의 언어 전환, 취소/수정/삭제, iOS Modal dismiss 뒤 확인창, 반복 탭/스와이프, safe area 및 120Hz 성능이 기존과 같은지 확인. 이미 열린 네이티브 확인창은 원래 언어를 유지하는 정책 확인.
- 작성 중 이탈 취소/동의, 로그인 복귀, 등록/수정/삭제 완료 이동, 이미지 선택/권한/압축/업로드 및 실패 재시도 흐름 확인.
- 일본어 줄바꿈·사진 삭제 버튼/별점 접근성·큰 글씨 레이아웃, 언어 변경만으로 추가 API 요청·폼 초기화·캐러셀 위치 이동이 없는지 확인. 실기기/native build 검증은 수행하지 않았다.

## 22. I18N 6단계 — 커뮤니티 현지화 및 잔여 반응성 점검 (2026-10-09)

### 22.1 구현 범위

- 목록: 커뮤니티 제목, 기존 전체/방문 리뷰/질문/자유 필터, 글쓰기·설정 접근성, 빈 목록·읽기 실패·재시도 및 이동/좋아요 실패 안내를 현지화했다. 기존 `ALL/REVIEW/QUESTION/FREE`, `LATEST`, cursor와 요청 조건을 유지한다.
- 공용 게시글 카드/작성자: 유형·상대시간·이미지/메뉴/댓글 접근성에 Hook의 `t`를 사용한다. 게시글/리뷰 본문·닉네임·팝업명·이미지는 원문을 유지한다. 기존 POST 좋아요·조회수 UI를 추가하지 않았다.
- 상세: 제목·유형·상대시간·오류/재시도·편집/삭제 확인과 실패 안내를 현지화했다. 이미 열린 메뉴가 보관한 콜백도 실행 시 최신 Hook 번역을 사용하도록 `[t]` Effect로 ref를 갱신한다.
- 작성/수정: 현재 단일 본문 입력 폼의 헤더·유형·placeholder·등록/저장·이미지 첨부/삭제·오류·작성 중 이탈 확인을 현지화했다. 제목 입력란은 실제 코드에 없으므로 추가하지 않았다. 이탈 확인은 기존 `review.write.leaveTitle/leaveMessage/continue/leave`를 재사용한다.
- 댓글/대댓글: 개수·답글 대상/답글쓰기·빈 상태·읽기/작성/인증/길이 오류·등록·메뉴/삭제 확인·입력 접근성을 현지화했다. 오류 state에는 번역 키를 저장하고 현재 Hook `t`로 표시한다. 비동기 삭제 실패도 최신 번역 ref를 사용한다. `parentCommentId/replyToUserId/commentId`와 댓글 순서는 그대로다.
- 기존 `CommunityPostMenu` 및 `CommunityImageCarousel`은 5단계 Hook 기반 구현을 재사용했다. Modal·Animated·safe area·메뉴 닫힘·이미지 순서/페이지 로직을 변경하지 않았다. 네이티브 Alert는 이미 열린 동안 문구를 유지하고, 다음 생성 시 최신 언어를 사용한다.
- 실제 코드에 게시글 검색·인기순·신고/신고 사유·댓글 수정·댓글 페이지네이션 UI는 없다. 이를 추가하거나 서버 신고 코드를 만들지 않았다. 리뷰 댓글의 기존 호환 코드도 리뷰 화면에 다시 연결하지 않았다.

### 22.2 번역 키 및 날짜/시간

- 커뮤니티 대상 6개 TSX의 고정/동적 키 기준 **신규19 + 재사용52 = 71개**를 확인했다. 잔여 지도/상세 후보는 기존 키를 사용하며 키를 추가하지 않았다. 한국어의 기존 번역 값은 작업 전 리소스와 비교하여 모두 동일하다.
- 신규19: `community.feed.loadFailed/empty`, `community.comments.authFailed/lengthExceeded/createFailed/deleteFailed/deleteTitle/deleteMessage/loadFailed/retry/empty/replyTo/reply/writeReply/menu/cancelReply/input/placeholder/register`.
- 기존 일본어14개 보완: `community.title/settings/write/register/registering/writeFailed/writeContent/writePlaceholder/attachImage/views`, `community.category.question/free/info/review`. `free`는 기존 한국어 키에 대응하는 일본어 키가 없었으므로 추가했다. 사용하지 않는 예전 정렬 키·mock 콘텐츠는 범위 밖으로 남겼다.
- 기존 상세/편집/삭제·이미지 오류·상대시간·작성 중 이탈 확인·리뷰 접근성 키를 재사용했다. 이번에 사용하는 키의 ko/ja 존재·빈 값·치환 변수 일치를 검사한다. 앱 전체의 과거 누락 키까지 채운 것은 아니다.
- `formatCommunityTime(createdAt, now, t)`에 현재 Hook 번역 함수를 명시한다. 목록 카드·작성자·상세·댓글에서 같은 경로를 사용한다. 분/시간/일 계산, timestamp, 날짜 구분과 정렬 기준은 변경하지 않았다.

### 22.3 잔여 React Compiler 후보 점검

| 대상 | 실제 확인 및 처리 |
| --- | --- |
| CommunityPostItem | 수정 전 소스에 실제 Compiler를 적용해 언어 전환 뒤에도 한국어 유형/시간 JSX가 캐시에 남는 것을 재현했다. Hook `t`와 시간 유틸의 명시적 번역 인자를 사용한다. |
| MapSearchOverlay | 수정 전 소스의 검색 오류 UI가 ko→ja 후 한국어로 남는 캐시 문제를 재현했다. Hook `t`를 사용한다. query·검색 API·선택 로직은 그대로다. |
| MapScreen.native / MapPopupListSheet / MapPopupPreviewCard | 전역 `t`와 암묵 언어 태그 라벨 경로의 위험을 확인해 Hook `t/resolvedLanguage`를 연결했다. 필터 내부 문자열·숫자 ID·선택 마커·지도 ref/key·카메라·F06 로직을 유지한다. 목록 시트 행은 자체 구독한다. |
| places/[id] / DetailTabs | 탭/정보 UI의 전역 `t`와 지역/태그 유틸의 언어 미전달을 수정했다. 선택 탭·팝업 ID·캐시/API locale·포스터 key를 유지한다. |
| PopupReviews | 방문 리뷰 탭의 discard Hook + 전역 `t`를 Hook `t`로 연결했다. 목록/빈 상태·쓰기 안내의 실시간 전환을 검사했다. 리뷰 요청 의존성과 API는 그대로다. |
| PopupGuidanceCarousel / IntroductionImageCarousel | 하위 안내 카드 제목과 소개 이미지 오류/접근성의 전역 `t`를 교체했다. 측정 높이·서버 공지/혜택·이미지·현재 페이지·기존 key는 그대로다. |
| PlaceWeeklySection | 주간 제목의 전역 `t`를 Hook `t`로 연결했다. 선택 주/국가·캐러셀·요청 캐시 조건은 그대로다. |
| 공유 UI | 대상 지도/상세/공용 컴포넌트 경로에 별도 이미지 생성 공유 카드는 없다. 상세의 기존 `Share.share({ message: detail.name })`만 확인했으며 접근성 번역에 Hook `t`를 사용한다. 공유 payload는 서버 팝업명 원문으로 유지하는 테스트를 추가했다. |
| 5단계 메뉴/이미지 캐러셀 및 이전 홈·플레이스 수정 | Hook `t`/언어 의존성이 이미 연결되어 있어 수정하지 않았다. 기존 Compiler 전환 테스트와 정적 규칙 검사를 재실행했다. |

- 공식 작성 규칙은 [CONVENTIONS.md](./CONVENTIONS.md)의 기존 i18n 절을 그대로 따른다. 언어 Hook/Provider/저장 구조를 재설계하지 않았다. 새 파일마다 전역 번역 함수를 JSX에서 호출하지 않고, 지역/태그 라벨에는 현재 언어를 전달한다.
- 실제 설치된 `babel-plugin-react-compiler`(target19)로 변환한 소스를 기존 구독/렌더 harness에서 실행한다. 커뮤니티 목록·카드·작성자, 지도 검색/미리보기/목록 행, 상세 탭·안내 카드·소개 이미지 등의 캐시가 유지된 상태에서 ko→ja→ko/system 갱신을 검증했다.
- 제한: 커뮤니티 상세/작성/댓글·팝업 상세/리뷰 목록은 기존 try/finally 등의 이유로 일부 함수가 Compiler 최적화에서 제외된다. 메뉴·주간 섹션은 기존 render 중 ref 접근, 댓글에는 캡처된 변수의 UpdateExpression 진단도 있다. native MapScreen 본체는 try 내부 throw/finally, MapPopupListSheet 본체는 ternary 진단이 있으나 해당 파일의 마커/행 등은 컴파일된다. 이러한 화면을 모두 캐시 최적화됐다고 주장하지 않는다. 대상15개 TSX의 작업 전/후 Compiler 진단이 동일함을 확인했으며, 우회 리팩터링 없이 변환 결과에서 실제 언어 구독·상태 보존을 검사했다.
- 기존 정적 규칙 검사 범위를 이번15개 TSX로 확대했다. 전역/별칭/namespace `t`, 모듈 번역 계산, 고정 번역 초기 state, 확실히 누락된 memo/callback 의존성을 기존 검사기로 확인한다. React 외부 유틸·불확실한 의존성 흐름까지 차단하지 않는다.

### 22.4 변경 파일

- 커뮤니티6: `src/screens/CommunityScreen.tsx`, `src/app/community/[id].tsx`, `src/app/community/write.tsx`, `src/components/community/CommunityPostItem.tsx`, `CommunityAuthor.tsx`, `CommunityComments.tsx`.
- 잔여 후보9: `src/screens/MapScreen.native.tsx`, `src/components/map/MapSearchOverlay.tsx`, `MapPopupListSheet.tsx`, `MapPopupPreviewCard.tsx`, `src/app/places/[id].tsx`, `src/components/place/PopupReviews.tsx`, `PopupGuidanceCarousel.tsx`, `PlaceWeeklySection.tsx`, `IntroductionImageCarousel.tsx`.
- 리소스/기록3: `src/locales/ko.json`, `src/locales/ja.json`, `docs/I18N_AUDIT.md`.
- 신규 테스트/헬퍼5: `tests/communityI18n.test.cjs`, `tests/i18nResidualCompiler.test.cjs`, `tests/helpers/communityI18nRuntime.cjs`, `mapDetailRuntime.cjs`, `mapI18nRuntime.cjs`.
- 기존 테스트7: `tests/i18nUiConventions.test.cjs`, `mapDetailI18n.test.cjs`, `communityComments.test.cjs`, `communityRefresh.test.cjs`, `communityStability.test.cjs`, `writeNavigation.test.cjs`, `popupGuidance.test.cjs`. 기존 격리 mock에 Hook `t`/한국어 표시값을 제공하고 접근성/답글 표기의 구조를 반영했다. 페이지/수정/이탈/이미지 및 API 동작 기대값은 유지한다. 지도/상세 fixture는 공용 helper로 추출해 같은 검증 경로를 재사용한다.
- 이번 변경 총30개. 기존 사용자 변경사항은 보존했으며 패키지·인증·언어 저장·Root Stack·지도 검색/F06·메뉴 애니메이션 파일을 변경하지 않았다.

### 22.5 테스트 및 기능 보존

| 검증 | 명령 | 결과 |
| --- | --- | --- |
| 신규 i18n/Compiler 및 정적 규칙 | node --test tests/communityI18n.test.cjs tests/i18nResidualCompiler.test.cjs tests/i18nUiConventions.test.cjs | 27/27 통과: 신규22 + 기존 정적 검사5 |
| 기존 Compiler/리뷰 i18n | node --test tests/i18nCompiler.test.cjs tests/reviewI18n.test.cjs | 20/20 통과 |
| 관련 회귀 | 커뮤니티10개 테스트 파일 + writeNavigation/loginReturn/reviews/reviewMenus/reviewSynchronization/mapSearch/mapMarkerBounds/mapDetailI18n/popupGuidance | 268개 중267 통과·기존 communityFeed1 실패 |
| TypeScript | node node_modules/typescript/bin/tsc --noEmit | 통과(exit0) |
| 전체 | node --test tests/*.test.cjs | 613개 중605 통과·기존8 실패(exit1)·신규 실패0 |
| Diff | 변경 파일 git diff --check + 신규/미추적 파일 no-index --check | 통과(exit0) |

- 기존 실패는 communityFeed1, endingSoonCarousel1, mainBanners3, placeFavoriteUi2, recovery1로 직전591/583과 동일하다. 이번 테스트22개를 추가했으며 관련 없는 기존 실패를 수정하지 않았다.
- 같은 인스턴스/구독을 유지하며 ko↔ja/system 전환·system 기기 언어 갱신, 유형/목록 cursor·본문·이미지 순서·편집 ID/모드·이탈 guard, 댓글 입력/부모/답글 대상 ID·댓글 순서·열린 메뉴, 상세 탭·지도 필터/query/마커/ref·목록 시트·공유 원문을 검사했다. 전환만으로 추가 API 요청이 없고 생성/수정/대댓글 payload가 원래 값인 것을 검증했다.
- 대상15개 TSX의 StyleSheet·JSX key·API 호출 인자·기존 Effect 의존성을 작업 전 소스와 비교해 동일함을 확인했다. 추가 Effect는 최신 번역 ref 갱신용이다. API/DB/타임스탬프/인증/압축·업로드/F02/F10/F06 구현은 변경하지 않았다.
- 검증 harness는 실제 소스·Compiler·언어 store/Hook을 실행하며 Native UI/I/O를 mock한다. 실제 iOS 스크롤 위치·키보드/포커스·화면 레이아웃·MapView 성능·네이티브 Alert/Modal 애니메이션·서버 연결까지 검증한 것은 아니다.

### 22.6 남은 영역 및 iPhone 확인 항목 (미실행)

- 게시글/댓글/닉네임/팝업명/이미지·서버 자유 오류 텍스트는 번역 제외 원문이다. 실제 없는 신고·댓글 수정 등을 미번역 기능으로 새로 구현하지 않는다. 미사용 예전 community 키와 마이페이지/내 게시글·알림/문의 등 다른 화면의 UI는 후속 범위다. 앱 전체 잔여 번역 감사를 재실행하지 않았다.
- iPhone에서 목록/상세를 유지하거나 다른 탭 설정 변경 후 복귀하여 ko↔ja/system 제목·유형·시간·빈/오류 상태·댓글 안내가 즉시 갱신되는지 확인한다. 현재 스크롤·목록 페이지·필터·게시글 ID·이미지 페이지가 유지되어야 한다.
- 작성/수정 중 본문·유형·이미지 여러 장/순서·수정 ID·키보드/입력 포커스를 보존하고 이탈 취소/동의·로그인 복귀·등록/수정/삭제 완료 이동을 확인한다. 일본어 문구·VoiceOver·큰 글씨가 기존 버튼/카드 레이아웃에서 잘리는지도 확인한다.
- 댓글/대댓글 입력과 답글 대상·부모 연결, 열린 메뉴의 수정/삭제/취소, 삭제 확인/실패, 인증 만료와 실제 댓글 등록/삭제를 확인한다. 이미 열린 네이티브 Alert의 언어 정책은 기존과 같다.
- 지도 query·선택 태그/마커·카메라·열린 목록 시트, 상세 sticky 탭·공지/혜택·소개 이미지 페이지·방문 리뷰/공유 원문이 언어 변경으로 초기화되지 않는지 확인한다. 기존 지도 검색/Google Maps 문제와 F06 성능 검증은 별도이며 수정하지 않았다.
- 실제 네트워크에서 언어 변경만으로 추가 요청이 없는지, 이미지 선택/권한/압축/업로드·메뉴 dismiss/애니메이션이 기존과 같은지 확인한다. 실기기/native build 검증은 실행하지 않았다.
- 다음 권장 범위: 마이페이지·내 게시글/리뷰 목록을 화면별로 현지화하고 같은 유지 화면 Compiler 전환 테스트를 적용한다. 기존 Compiler bailout 자체 해결은 별도 승인 범위로 남긴다.

## 23. I18N 7단계 — 마이페이지·내 활동 (2026-10-09)

- 완료: 마이페이지 제목/내 활동/서비스 메뉴/로그인 안내/접근성, 내 게시글·방문 리뷰 목록의 제목/로딩/빈 상태/오류/재시도/더 보기, 찜 목록의 제목/빈 상태/오류/접근성/미정 일정 및 숫자 ID 기반 태그 표시, 기존 닉네임 변경 화면의 입력/검증/저장/성공·실패 안내.
- 프로필 닉네임/이메일·게시글/리뷰 본문·팝업명/이미지는 원문이다. 실제 없는 프로필 이미지 편집·목록 내 찜 해제·새 삭제 UI는 추가하지 않았다. 기존 카드/ReviewActions의 유형·별점·수정/삭제 번역을 재사용한다.
- **신규47개(`profile.*`) + 기존 UI 키9개 재사용**. 재사용: `language.settings/back`, `community.feed.loadFailed`, `place.detail.reviews.openFailed/loadFailed/more`, `place.detail.tryLater/schedulePending`, `place.explore.viewDetails`. 사용 키의 양 언어 값과 치환 변수를 검사했다. 기존 한국어 리소스 값은 모두 동일하며, 새 한국어 값은 기존 표시 문구를 유지한다.
- 닉네임/비밀번호가 공용 `AccountSettingsScreen`을 사용하므로 닉네임 경로만 번역한다. 기존 앱 오류 매퍼가 반환하는 고정 메시지를 번역 키로 보관하며 서버 자유 메시지는 임의 번역하지 않는다. 비밀번호 화면·설정 전체·로그인/회원가입 UI와 인증/API 구현은 변경하지 않았다.
- React UI는 Hook `t`, 태그는 `getTagDisplayName(tag, resolvedLanguage)`를 사용한다. 유지된 컴포넌트의 ko→ja→ko/system 및 system 적용 언어 변경을 실제 Compiler 변환 코드에서 검사했다. 캐시를 생성하는 메뉴 행과 Hook도 실행했다. 화면 본체는 기존 try/finally, 찜 화면은 기존 `Existing memoization could not be preserved` 진단으로 최적화에서 제외된다. 대상5개 파일의 변경 전/후 Compiler 진단은 동일하며, 모든 화면이 캐시 최적화됐다고 주장하지 않는다.
- 데이터/안전성: 스타일·JSX key·API 호출 인자·기존 Effect/Focus/Callback 의존성을 변경 전과 비교하여 동일함을 확인했다. 목록 페이지/cursor·원본 ID/이미지·사용자/찜 캐시·입력 내용·오류 상태가 언어 전환 중 유지되고 추가 요청이 없음을 테스트했다. F12 오류/빈 상태 구분·재시도 잠금·인증/세션·캐시 정책을 유지한다.
- 변경13개: `src/app/(tabs)/profile/{index,posts,reviews,favorites}.tsx`, `src/components/profile/AccountSettingsScreen.tsx`, `src/locales/{ko,ja}.json`, `tests/myPosts.test.cjs`, `tests/i18nUiConventions.test.cjs`, 신규 `tests/profileI18n.test.cjs`, `tests/profileI18nCompiler.test.cjs`, `tests/helpers/profileI18nRuntime.cjs`, `docs/I18N_AUDIT.md`. 내 게시글의 기존 고정 라벨 정적 검사를 Hook 키로 갱신하면서 이동 경로·중복 이동 방지 기대값은 유지했다.

| 순서 | 검증 | 결과 |
| --- | --- | --- |
| 1 | profileI18n + myPosts/myReviews/profileFavoritesUi/popupFavoritesRecovery/accountSettings | 신규7 포함 관련64개 통과. 고정 라벨 정적 검사 수정 후 해당15개만 재실행하여 통과 |
| 2 | profileI18nCompiler + i18nUiConventions | 신규 Compiler2 + 기존 정적 검사5 모두 통과. 기존 찜 화면 Compiler 진단은 변경 전과 대조한 뒤 정확한 진단 문자열로 검사 |
| 3 | node node_modules/typescript/bin/tsc --noEmit | 통과(exit0) |
| 4 | 변경12개 git diff --check / 미추적 no-index --check | 통과. 전체 실행 후 추가한 이 문서도 별도 diff 검사 통과 |
| 마지막 1회 | node --test tests/*.test.cjs | **622개 중614 통과·기존8 실패·신규 실패0**(exit1). 전체 테스트 재실행/기존 실패 재조사 없음 |

기존 실패 이름:

1. communityFeed: `cards render review popup and rating; posts have no popup, rating or image`
2. endingSoonCarousel: `ending badge uses D-5, D-1 and today with actual same-year and cross-year periods`
3. mainBanners: `hero title/period/MapPin region uses white typography, two-line title and shared date formatting`
4. mainBanners: `footer gradient remains above poster and below text with specified opacity stops`
5. mainBanners: `HomeScreen shares existing detail navigation and keeps other sections on banner failure`
6. placeFavoriteUi: `grid information has four compact lines with inclusive status dates and an unambiguous single period`
7. placeFavoriteUi: `place weekly favorite uses 22px heart/shadow without changing body colors, target or toggle`
8. recovery: `auth: profile network failure preserves user, token and logged-in UI; cold failure is not a login prompt`

- 남은 UI: 설정 전체·비밀번호/회원탈퇴·로그인/회원가입·공지/문의/정책 본문 화면은 이번 제외 범위다. 마이페이지의 해당 진입 문구만 번역했다. 새 패키지 설치나 관련 없는 코드 변경은 없다.
- iPhone **미검증**: 마이페이지/각 목록 유지 및 다른 탭 설정 변경 후 복귀 시 ko↔ja/system 즉시 표시, 스크롤·목록 페이지·찜 상태·닉네임 입력/포커스 유지, 큰 글씨/일본어 줄바꿈·VoiceOver, 실제 저장/중복 닉네임/로그인 복귀/재시도·카드 이동·리뷰 메뉴를 확인한다. Native I/O를 mock한 테스트이므로 실제 레이아웃·스크롤 좌표·키보드·서버 연결까지 검증한 것은 아니다.

## I18N 8단계 — 설정·인증·계정 관리 UI 현지화 (2026-10-09)

- 완료: 설정 메인·기존 언어 선택, 이메일/Google 로그인, 회원가입의 이메일 인증·비밀번호·닉네임·동의 단계, 계정 설정의 비밀번호 변경, 로그아웃·회원탈퇴, 공지 목록/상세, 문의 목록/상세/작성, 정책 목록/상세의 화면 제목과 뒤로가기. 실제 없는 Apple/Kakao/Naver 로그인이나 비밀번호 찾기/재설정 화면은 추가하지 않았다.
- 리소스: `account.*` **143개 신규**, 고정 메시지 매핑에서 기존 키 **29개 재사용**(기존 닉네임 오류 키 포함). 기존 언어 선택 키는 그대로 사용한다. 양쪽 언어의 신규 키·치환 변수 일치를 검사했다. 기존 한국어 고정 문구와 공백·줄바꿈을 유지한다.
- `src/locales/accountUi.ts`: 기존 앱 고정 메시지/검증 결과를 키로 찾는 작은 순수 유틸. React UI는 반드시 `useTranslation()`의 `t`를 명시적으로 전달한다. 오류 state에는 번역 결과 대신 기존 메시지/키를 저장하고 렌더 시 현재 언어로 표시한다. 미등록 오류/서버 자유 텍스트는 원문 유지. 공지 카테고리·문의 유형/상태는 기존 enum 코드와 표시 키를 분리하며 API payload는 그대로다.
- 비동기 완료 Alert는 최신 Hook `t` ref를 사용한다. 원래 Alert 버튼 순서·확인/취소 동작·탈퇴 재시도/중복 요청 방지는 유지한다. 이미 열린 native Alert를 언어 변경 때 다시 띄우거나 재구성하지 않는다.
- 인증/OAuth/세션/SecureStore/AsyncStorage/탈퇴 API 구현은 변경하지 않았다. 14개 UI 파일의 기존 스타일 객체, React key, 입력 value 바인딩, 기존 useEffect/useCallback 의존성이 작업 전과 동일함을 AST 비교로 확인했다. 요청 함수에는 언어 의존성을 추가하지 않았다. 문의 공통 헤더는 원래 한국어 title을 탐색 분기에 그대로 사용하고 표시만 번역한다.

### 변경 파일 (25개)

- 화면: `src/app/(tabs)/profile/{settings,login,signup,withdrawal}.tsx`, `src/app/(tabs)/profile/notices/{index,[id]}.tsx`, `src/app/(tabs)/profile/inquiries/{index,[id],write}.tsx`, `src/app/profile/policies/index.tsx`.
- 공통 UI: `src/components/profile/{AccountSettingsScreen,NoticeLayout,InquiryLayout,PolicyDetailScreen}.tsx`.
- 번역: `src/locales/{ko.json,ja.json,accountUi.ts}`.
- 검증: `tests/{accountI18n,accountI18nCompiler,i18nUiConventions,inquiries,signupProof}.test.cjs`, `tests/helpers/{accountI18nRuntime,uiDependencies}.cjs`. 기존 테스트는 새 Hook/순수 유틸 의존성과 한국어 표시 결과를 제공하도록 보완했고, 인증/payload/재시도 기대값은 유지했다.
- 기록: 이 문서. 기존 사용자 변경과 이전 단계 기록은 보존했다. 패키지 설치 없음.

### React Compiler 및 상태 보존 검증

- 실제 Babel React Compiler(target19)를 적용한 7개 테스트 통과. 유지된 화면에서 ko→ja→ko/system 및 시스템 언어 갱신, 입력값/요청 수/Hook 슬롯 유지, **실제 컴파일된 PasswordField**의 라벨·표시/숨김 문구 캐시 갱신과 비밀번호/표시 상태 보존을 확인했다. 신규 UI도 기존 정적 검사 대상에 추가했다.
- 한계: 로그인·설정·탈퇴·문의 작성은 기존 `try/finally` 또는 try 내부 throw 제한으로 Compiler가 화면 컴파일을 건너뛴다. 회원가입·계정 설정도 주 화면에 같은 제한이 있고 하위 ConsentRow/PasswordField는 컴파일된다. 공지/문의 목록도 기존 finally 제한이 있다. **14개 파일의 Compiler 오류 사유 목록은 작업 전과 동일**했다. 해당 화면의 Hook 반응성 검증과 컴파일된 하위 UI 검증을 구분하며 모든 주 화면이 컴파일됐다고 주장하지 않는다.
- 대표 렌더 테스트: 로그인 검증/이메일/비밀번호와 서버 오류 원문, 인증 완료 후 회원가입 이메일/인증번호/비밀번호/확인값/단계, 비밀번호 변경 입력/검증/표시 상태, 문의 작성 내용/유형 BUG/이탈 방지/전송값, 공지·문의 목록과 상세의 원문·enum 표시·추가 요청 없음, 정책 본문 원문, 로그아웃/탈퇴 중복 요청 잠금과 변경 후 언어의 실패 Alert를 검증했다. 문의 제목을 UI 문구와 같은 `문의하기`로 입력해도 번역되지 않는다.

### 검증 결과

| 검증 | 결과 |
| --- | --- |
| 기존 i18n/profile/정적 검사 | 48개 통과 |
| 신규 accountI18n | 8개 통과 |
| 신규 accountI18nCompiler | 7개 통과; 기존 정적 검사 5개도 통과 |
| 인증·설정·탈퇴·가입 proof·로그인 복귀·공지·문의 회귀 | 94개 검증. 새 번역 의존성을 테스트 mock에 보완한 뒤 영향 받은 문의/signupProof 19개만 재실행하여 통과 |
| TypeScript `--noEmit` | 통과 |
| 변경 파일 `diff --check` | 문서 포함 통과 |
| 마지막 전체 테스트 **1회** | **637개 중629 통과·기존8 실패·신규 실패0**(exit1). 기존 실패 재조사/전체 반복 실행 없음 |

기존 실패: communityFeed 1, endingSoonCarousel 1, mainBanners 3, placeFavoriteUi 2, recovery 1. 구체적인 실패 이름은 직전 7단계 기록과 동일하다.

### 정책 확인 사항·남은 범위·실기기

- **탈퇴 안내 확인 필요**: 현재 화면은 질문/자유 게시글과 연결 댓글 삭제 및 방문 리뷰/일부 댓글 유지라고 안내한다. `docs/ACCOUNT_WITHDRAWAL_DESIGN.md`는 아직 구현하지 않은 설계 제안이며 댓글/대댓글 보존을 제안한다. 두 문구의 차이는 기록했지만 제안을 확정 정책으로 적용하거나 안내를 임의 수정하지 않았다. 현재 한국어 안내를 그대로 일본어로 번역했으며 실제 백엔드/운영 데이터 정책 일치 여부는 이번 UI 작업에서 검증하지 않았다. 작성자 표시는 서버의 `탈퇴한 사용자` 원문과 일본어 설명을 함께 유지한다.
- 번역 제외/잔여: 서버 공지 제목·본문, 문의 제목·본문·관리자 답변, 닉네임, 미등록 서버 오류 원문, 법률 정책 본문·조항·시행일 원문. 약관 본문의 일본어 제공은 정책 검토가 필요한 후속 작업이다. 구현되지 않은 인증 기능은 이번 완료 범위에 포함하지 않는다.
- iPhone **직접 미검증**: 설정/가입 단계/비밀번호 입력/문의 작성 유지 중 ko↔ja/system 즉시 표시, 입력 포커스·키보드·스크롤 유지, 일본어 줄바꿈/큰 글씨/VoiceOver, 실제 이메일 인증·재전송 제한·Google 로그인·로그인 복귀, 비밀번호 변경 후 재로그인, 로그아웃 및 탈퇴 확인/실패/정리 재시도, 공지·문의 서버 연결을 확인한다. native UI/API를 mock한 테스트로 실제 키보드·레이아웃·OAuth·운영 서버 동작을 확인했다고 주장하지 않는다.

## I18N 8.5단계 — 약관 원본 정리 확인 및 일본어 본문 적용 (2026-10-09)

- 사용자가 미리 옮긴 `docs/legal/ko/{이용약관,개인정보처리방침,약관정책}.md`와 `docs/legal/ja/{利用規約_ja,プライバシーポリシー_ja,位置情報サービス利用規約_ja}.md` 총6개를 확인했다. docs 루트에 같은 원본은 없고 추가 이동/복제/수정/번역은 하지 않았다. **작업 시작/종료 시 6개 SHA-256 동일**. 사용자 이동 이전 원본이 없으므로 사용자 이동 전후의 바이트 동일성까지 확인했다고 주장하지 않는다.
- `src/content/policies.ja.json`: 제공된 일본어 Markdown에서 추출한 정적 본문. 이용약관12조·개인정보11항목·위치8조 외에도 문서 제목, 서문, 소제목, 문단, 번호/목록, 시행일, 연락처, 부칙을 모두 포함한다. Markdown의 제목/목록 표시 문법만 기존 Text UI에 맞추며 문장 내용은 수정하지 않았다. 일반 번역 JSON에 본문 키를 추가하거나 새 렌더링 패키지를 설치하지 않았다.
- `src/content/policies.ts`: 기존 한국어 객체를 그대로 유지하고 일본어 데이터와 `getLocalizedPolicy(policy, resolvedLanguage)`를 추가했다. 기존 canonical 객체의 식별로 안정적인 약관 키를 결정하며 제목 문자열 추측 매핑은 없다. 문단/목록/소제목의 순서를 보존하는 선택적 `blocks`만 기존 데이터 타입에 추가했다.
- `src/components/profile/PolicyDetailScreen.tsx`: Hook의 `resolvedLanguage`에 따라 전체 제목/시행일/본문 선택. 기존 스타일, ScrollView, Safe Area, 뒤로가기와 경로는 유지한다. 기존 목록 화면은 이미 현지화되어 있어 수정하지 않고 기존 키를 재사용했다. 3개 라우트 wrapper도 변경하지 않았다.
- 변경5개: 위 콘텐츠2개·상세 컴포넌트·`tests/legalI18n.test.cjs`·이 문서. 기존 미커밋 변경사항은 보존했다. 인증/API/탈퇴/지도/언어 저장 로직 변경 없음.

### 원문·정책 확인 사항

- 일본어3개 전체의 비어 있지 않은 원문 텍스트를 데이터에서 순서대로 복원하여 비교했다. 제목/조항 번호/문단/목록/연락처/시행일/부칙 누락 없음. 소제목 및 번호 목록도 그대로 포함한다.
- **기존 한국어 앱과 ko 원본은 다름**: 앱은 이용12조·개인정보8항목·위치7조의 축약본이며, ko 원본은12조·11항목·8조 및 부칙/연락처를 포함한다. 한국어 앱은 `POPKU`, `시행일: 추후 확정`; ko 원본은 `[서비스명]`, `[YYYY.MM.DD]` 등 미확정 값이다. 요청대로 한국어 앱을 원본으로 덮어쓰지 않았고 변경 전 객체와 deep equality를 확인했다. 따라서 한국어/일본어 앱의 상세 설명 분량은 다르다.
- 일본어 원문의 브랜드 `ポップカイブ（POPCHIVE）`, `[運営者名]`, `[サービス専用メールアドレス]`, 시행일/부칙 날짜의 미확정 표기를 그대로 표시한다. 14세 미만 가입 정책과 해외 이전 공표 사항의 출시 전 확정 필요 안내도 생략하지 않았다.
- 원문은 탈퇴 시 질문/자유 글과 연결 댓글이 삭제될 수 있고, 방문 리뷰 및 다른 유지되는 글의 댓글/대댓글은 보존될 수 있다고 설명한다. 서버의 한국어 탈퇴자 표시와 일본어 원문의 `退会したユーザー` 표시명 차이는 데이터/인증 로직을 수정하지 않고 유지한다. 직전 단계의 미구현 탈퇴 설계 제안과 현 안내 차이도 남아 있다. 위치정보 원문은 자체 서버 좌표/이동경로 저장 및 지속적인 백그라운드 추적을 하지 않는다고 설명한다. 실제 백엔드/운영 정책 일치 여부를 이번 본문 연결 작업에서 확정한 것은 아니다.

### 검증 및 실기기

- 관련 테스트 **18개 통과**: 신규 약관5개(원문3개 + 일반 Hook1 + 실제 React Compiler1), 기존 accountI18n8개, 정적 규칙5개. 실제 Compiler가 목록/상세/번역 Hook을 컴파일한 출력으로 ko→ja→ko/system 및 시스템 언어 갱신을 검증했다. 3개 상세 전체 텍스트, 목록 라벨/경로, 유지된 Hook 슬롯·ScrollView 스타일, 데이터 불변/추가 API 요청 없음/뒤로가기를 확인했다.
- TypeScript `--noEmit` exit0. 변경 파일 `diff --check` 및6개 원본 SHA-256 검사 통과. 기존 한국어 데이터와 스타일 변경 없음.
- 전체 테스트 **마지막1회**: **642개 중634 통과·기존8 실패·신규 실패0**(exit1). 실패 이름은 직전 단계와 동일; communityFeed1, endingSoonCarousel1, mainBanners3, placeFavoriteUi2, recovery1. 재조사/전체 재실행 없음.
- iPhone **직접 미검증**: 3개 약관을 열린 상태에서 ko↔ja/system 전환, 스크롤 위치·뒤로가기 유지, 일본어 전체 문서/긴 제목·소제목/번호 목록/연락처/부칙·큰 글씨/VoiceOver 확인. mock 기반 테스트는 실제 native 스크롤 좌표나 레이아웃을 검증하지 않는다.
- 후속 확인: 한국어 앱 축약본과 원본의 통일 여부, 시행일·운영자·연락처·미성년자 정책·해외 이전 사항 확정, 탈퇴자 표시명과 운영 정책 확인은 별도 승인된 정책 작업으로 진행한다.

## Place 전체 카드 태그·상태 즉시 전환 수정 (2026-10-09)

- 실제 카드: `PlaceScreen` 전체 목록의 `PopupGridCard`. 부모의 FlatList `extraData`에는 이미 `resolvedLanguage`가 포함되어 있었다. 카드는 Hook을 호출만 하고 전역 `t()`로 상태·찜 접근성 문구를 표시했으며, 태그/지역 유틸에는 현재 언어를 전달하지 않았다. Compiler가 전역 언어에 의존하는 계산을 동일 인수로 캐시하는 경로를 실제 변환 코드 테스트로 재현했다. 태그는 API name 직접 표시가 아니라 기존 ID 유틸의 언어 기본값에 의존했고, 상태는 API 상태명이 아니라 기존 날짜 계산 결과를 번역 키로 표시했다.
- 수정: 카드에서 Hook의 `t, resolvedLanguage`를 사용하고 `getTagDisplayName`/`getPopupRegionDisplayName`에 언어를 명시한다. 기존 `place.all.card.{ongoing,upcoming,ended}` 키를 재사용한다(한국어 `진행중/오픈예정/종료됨`, 일본어 `開催中/オープン予定/終了`). 찜 접근성 라벨도 Hook t를 사용한다. 기간은 기존 숫자 포맷, 팝업 제목은 원문 유지. 다른 화면·필터·API·날짜 계산·스타일·이미지 로직 변경 없음.
- 검증: 수정 전 실제 Compiler에서 일본어 태그/상태 검증 실패를 재현하고 수정 후 통과했다. 태그 및 상태 각각 신규2개 Compiler 테스트를 추가하여 ko→ja→ko/system, 시스템 ja→ko 변경, ID/미등록 태그 fallback/선택 필터/목록 참조/카드 스타일·찜·이동/이미지 cachePolicy/요청 수 유지 확인. 기존 Place/ID 라벨/페이지네이션/카테고리/정적 검사 포함 **41개 통과**. 시스템 언어 갱신 시나리오를 추가한 신규2개만 재실행하여 통과. TypeScript `--noEmit` exit0 및 변경 파일 `diff --check` 통과. 작은 UI 수정으로 전체 테스트는 실행하지 않았다.
- 변경: `src/components/place/PopupGridCard.tsx`, `tests/placeI18n.test.cjs`, `tests/i18nUiConventions.test.cjs`, 이 기록. 기존 미커밋 작업을 보존했고 패키지 설치 없음.
- iPhone 직접 미검증: 전체 목록을 유지한 상태 및 다른 탭에서 언어 변경 후 복귀 시 태그/3종 상태/찜 접근성 문구, 필터·스크롤 위치·찜·상세 이동·이미지 유지 확인. mock 테스트는 실제 native 스크롤 좌표나 이미지 캐시 동작을 측정하지 않는다.
