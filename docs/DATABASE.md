# POPKU Database

## 현재 구현

팝업 분류는 기존 MySQL `tags` / `place_tags`를 사용한다. 별도 category 테이블이나 JSON tags 필드는 없다.

- `tags`: `id BIGINT AUTO_INCREMENT` PK, `name VARCHAR(50)`, `category VARCHAR(30)`, `(name, category)` UNIQUE. `category`는 기존 태그 그룹 필드이며 개발 DB의 11개 분류는 `GENERAL`이다.
- `place_tags`: `(place_id, tag_id)` 복합 PK, `places(id)` 및 `tags(id)` FK와 `ON DELETE CASCADE`, `tag_id` 인덱스.
- 팝업은 `places.type = 'POPUP'` 및 `popup_place.place_id`로 연결된다. 등록·수정은 기존 `tagIds` 배열을 유지하면서 정확히 하나의 유효한 ID를 서버에서 검증한다. 수정은 기존 place 행 잠금과 transaction 안에서 연결을 교체한다.
- `013_popup_category_names.sql`은 이름만 UPDATE하여 기존 ID·그룹·FK를 보존한다. `013_popup_category_audit.sql`은 카테고리가 0개 또는 복수인 팝업을 조회하는 읽기 전용 SQL이다.
- `014_popup_representative_category.sql`은 사용자가 지정한 아이파크몰 덕후 페스티벌(`901fed19-bcdb-11f1-ad88-f4c88a6f75ec`)의 대표 카테고리 id 1을 유지하고 확인된 id 2 연결만 제거한다. 팝업·태그 행은 삭제하지 않는다.
- 개발 DB에 위 이름 변경과 명시적 대표 선택을 적용했다. 팝업 4건 모두 카테고리 1개이며 tag ID 1~11과 기존 FK를 유지한다. 테이블 구조 변경은 없다.

## 계획

이 문서에서 확인하지 않은 다른 데이터 영역은 해당 구현 작업에서 확정된 내용을 기준으로 문서화한다.

## 미정 사항

- 팝업 분류 외 데이터 영역의 상세 스키마 문서화
- 데이터 보관 정책

미정 항목은 실제 설계 또는 구현이 이루어지기 전까지 임의로 확정하지 않는다.
