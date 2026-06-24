import detail1 from "../asset/detail_1.webp";
import detail2 from "../asset/detail_2.webp";
import detail3 from "../asset/detail_3.webp";
import detail4_1 from "../asset/detail_4_1.webp";
import detail4_2 from "../asset/detail_4_2.webp";
import detail5 from "../asset/detail_5_0.webp";
import type { Slide } from "./TutorialModal";

/* ────────────────────────────────────────────────────────────────────────
 *  튜토리얼 슬라이드 — 실제 스크린샷 이미지 버전
 *  STEP 4 는 둘로 나뉘어 두 장, STEP 5 는 한 화면에 두 장(좌:커뮤니티 / 우:챗봇)
 * ──────────────────────────────────────────────────────────────────────── */
export const tutorialSlides: Slide[] = [
  {
    image: detail1,
    caption:
      "STEP 1. 알레르기 이력 먼저 등록해요\n" +
      "테스트가 끝난 재료를 미리 등록하면, 위험 재료는 식단 추천에서 자동으로 제외해요.",
  },
  {
    image: detail2,
    caption:
      "STEP 2. 이유식 일정을 기록해요\n" +
      "날짜를 고르고 재료·식단 이름으로 레시피를 검색해 일정에 추가하세요.",
  },
  {
    image: detail3,
    caption:
      "STEP 3. 영양 관리로 한 주를 돌아봐요\n" +
      "5일 이상 식단을 등록하면 영양 관리 탭이 활성화돼요. 보완할 영양소를 식단에 반영하세요.",
  },
  {
    image: detail4_1,
    caption:
      "STEP 4. 알레르기 테스트 중이라면 알림을 보내드려요\n" +
      "시간대별 알림에서 반응 여부·증상·사진을 바로 기록할 수 있어요.",
  },
  {
    image: detail4_2,
    caption:
      "STEP 5. 반응이 있으면 리포트로 정리해요\n" +
      "병원 제출용 리포트를 자동 생성하고, 내 위치 기반 병원도 안내받을 수 있어요.",
  },
  {
    // STEP 5 — 한 화면에 두 장 (좌: 커뮤니티 / 우: AI 챗봇)
    image: detail5,
    caption:
      "STEP 6. 커뮤니티와 챗봇도 활용해보세요\n" +
      "부모들과 정보를 나누고, 궁금한 점은 AI 챗봇에게 바로 물어보세요.",
  },
];
