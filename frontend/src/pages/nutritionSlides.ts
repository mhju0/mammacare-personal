import type { Slide } from "../components/TutorialModal";

/* 영양 관리 페이지 튜토리얼 슬라이드
 *
 *  ⚠️ 이 파일은 pages/ 바로 아래(영양 페이지와 같은 폴더)에 둡니다.
 *     그래서 import 경로가 "../components/..." (한 단계 위) 입니다.
 *
 *  - 문구/순서/화살표를 바꾸려면 이 배열만 고치면 됩니다.
 *  - 이미지는 public/tutorial/ 안에 두고 "/tutorial/파일명" 으로 참조해요.
 *  - 주석(annotations) 좌표는 이미지 기준 %(0~100).
 */
export const nutritionSlides: Slide[] = [
  {
    image: "/tutorial/nutrition_1.webp",
    caption: "지난 7일 영양 상태와 균형을 한눈에 보고, 부족한 영양을 채울 재료를 추천받아요.",
    annotations: [
      { type: "box", x: 2, y: 4, w: 96, h: 33 },
      { type: "box", x: 51, y: 39, w: 47, h: 56, pulse: true },
    ],
  },
  {
    image: "/tutorial/nutrition_2.webp",
    caption: "추천 재료의 장바구니를 누르면 '쿠팡·마켓컬리'로 바로 연결돼요.",
    annotations: [{ type: "box", x: 23, y: 40, w: 53, h: 12, pulse: true }],
  },
];
