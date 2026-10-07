# POPKU Decisions

## 2026-09-20 - Flutter 선택

### 결정

Flutter를 사용하고 모바일 앱을 우선한다.

### 이유

- iOS와 Android에서 코드를 공유할 수 있다.
- POPKU는 모바일 앱 중심의 서비스다.

---

## 2026-09-20 - 플랫폼 우선순위

### 결정

- iOS를 우선한다.
- Web UI는 대응하지 않는다.

---

## 2026-09-20 - 아이콘

### 결정

- 일반 UI 아이콘은 Lucide로 통일한다.
- 브랜드 아이콘은 해당 브랜드의 공식 asset을 사용한다.

---

## 2026-09-26 - 디자인 시스템 v0.1

### 결정

POPKU UI는 흰색 중심의 미니멀한 스타일을 사용하고 브랜드 초록색을 포인트로 사용한다. 상세 토큰은 `docs/DESIGN.md`를 따른다.

---

## 2026-10-05 - TODO: 회원탈퇴와 커뮤니티 대화 보존

- 현재 회원탈퇴 API는 없다. 백엔드 `002_tables.sql` 정의상 `comments.user_id`와 `parent_comment_id`는 ON DELETE CASCADE, `reply_to_user_id`는 ON DELETE SET NULL이다. 운영 DB 직접 확인 결과는 아니다.
- users를 물리 삭제하면 작성 댓글이 삭제되고, root 댓글의 다른 사용자 답글도 cascade 삭제될 수 있다. 작성 게시글도 사용자 FK의 cascade 대상이다. 회원탈퇴 구현 전 게시글·댓글 보존 정책과 익명화/soft-delete 필요 여부를 별도 설계한다.
- 살아남은 답글의 target은 NULL이 되어 현재 멘션이 사라진다. NULL만으로 탈퇴를 판별하지 않는다. 향후 root에는 표시하지 않고, 탈퇴 대상 답글에만 이전 닉네임 대신 `@탈퇴한회원`을 표시할 방법을 설계한다. 탈퇴 때문에 다른 사용자의 답글을 삭제하지 않도록 한다.
- 이번 본인 댓글/답글 삭제 구현에서는 회원탈퇴 관련 schema/FK/멘션을 변경하지 않는다. 직접 root를 삭제할 때 thread 전체를 삭제하는 정책과 회원탈퇴 정책은 구분한다.

## 2026-10-06 - 상세·작성 화면의 일반 Stack 전환 확정

### 결정

- `src/app/_layout.tsx`의 `places/[id]`, `community/[id]`, `reviews/[id]`, `community/write`, `reviews/write`는 `expo-router/js-stack`의 `presentation: 'card'`와 기존 배경색 설정을 사용한다.
- iOS 전환과 swipe-back은 Stack 기본 동작을 사용한다. 상세 진입·복귀 및 swipe-back에서 이전 화면과 FloatingTabBar가 함께 움직이는 UX를 사용자가 실기기에서 확인하고 채택했다.
- 위 상세·작성 route의 기존 `transparentModal`, custom `cardStyleInterpolator`와 `current.progress` 기반 `translateX`, 직접 지정한 open/close `TransitionIOSSpec`, `gestureDirection`, overlay/shadow 비활성화 설정은 제거했다. 추가 transition 커스터마이징은 하지 않는다.
- 정상 대표 이미지 Hero(background blur + foreground contain), 상세·작성 UI/API/데이터 로직, 작성 완료·취소 동작은 유지한다. 나머지 route의 설정은 변경하지 않는다.

---

## 미정 사항

백엔드, API, 데이터베이스와 인프라 기술은 아직 결정되지 않았다. 결정이 확정되면 이유와 함께 이 문서에 기록한다.
