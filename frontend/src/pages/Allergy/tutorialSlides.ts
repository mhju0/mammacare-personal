import type { Slide } from "../../components/TutorialModal";

/* 알레르기 관리 페이지 튜토리얼 슬라이드
 *
 *  - 문구/순서/화살표를 바꾸려면 이 배열만 고치면 됩니다.
 *  - 이미지는 public/tutorial/ 안에 두고 "/tutorial/파일명" 으로 참조해요.
 *  - 주석(annotations) 좌표는 이미지 기준 %(0~100).
 */
export const allergySlides: Slide[] = [
  {
    image: "/tutorial/allergy_1.webp",
    caption: "처음 등록하는 재료라면, \n 이미 테스트를 끝낸 재료인지 먼저 체크해요.",
    annotations: [{ type: "box", x: 6, y: 59, w: 88, h: 14, pulse: true }],
  },
  {
    image: "/tutorial/allergy_2.webp",
    caption: "테스트 중인 재료는 시간대별 경과를 보여줘요. \n 이상이 보이면 ‘반응 기록하기’를 누르세요.",
    annotations: [
      { type: "callout", x: 87, y: 2, tx: 87, ty: 28, text: "이상 반응 기록" },
    ],
  },
  {
    image: "/tutorial/allergy_3.webp",
    caption: "안전하게 통과한 재료, 알레르기 반응 재료, \n 알레르기 확정 재료를 등록할 수 있어요.",
    annotations: [
      { type: "box", x: 1, y: 2, w: 48, h: 63 },
      { type: "box", x: 52, y: 2, w: 48, h: 63 },
      { type: "box", x: 1, y: 73, w: 99, h: 26 },
    ],
  },
  {
    image: "/tutorial/allergy_4.webp",
    caption: "반응을 보인 재료를 등록할 때는 \n 재료 이름을 입력하고 추천에서 선택하세요.",
    annotations: [{ type: "box", x: 5, y: 48, w: 88, h: 20, pulse: true }],
  },
  {
    image: "/tutorial/allergy_5.webp",
    caption: "발생 일시와 증상, 심각도를 골라 기록해요.",
    annotations: [{ type: "box", x: 4, y: 19, w: 86, h: 46, pulse: true }],
  },
  {
    image: "/tutorial/allergy_6.webp",
    caption: "시간대별로 여러 증상을 기록할 수 있어요.",
    annotations: [
      { type: "callout", x: 96, y: 30, tx: 21, ty: 33.5, text: "시간대별 기록 추가" },
    ],
  },
  {
    image: "/tutorial/allergy_7.webp",
    caption: "의사 확진을 받으면 ‘확정하기’를 눌러 알레르기를 확정해요.",
    annotations: [
      { type: "callout", x: 59, y: 50, tx: 59, ty: 33, text: "눌러서 확정" },
    ],
  },
  {
    image: "/tutorial/allergy_8.webp",
    caption: "AI가 단백질 구조가 비슷한 의심 재료를 분석해줘요. \n ‘높음’은 특히 주의하세요.",
    annotations: [
      { type: "box", x: 4, y: 41, w: 92, h: 44.5 },
    ],
  },
  {
    image: "/tutorial/allergy_9.webp",
    caption: "증상 기록을 종합해 리포트를 만들고, \n 현재 위치를 기반으로 가까운 병원도 안내해줘요.",
    annotations: [
      { type: "box", x: 3, y: 5, w: 94, h: 24 },
      { type: "box", x: 3, y: 33, w: 94, h: 62 },
    ],
  },
  {
    image: "/tutorial/allergy_10.webp",
    caption: "가까운 병원의 정보를 알려줘요.",
    annotations: [{ type: "box", x: 4, y: 17, w: 86, h: 25, pulse: true }],
  },
  {
    image: "/tutorial/allergy_11.webp",
    caption: "완성된 리포트는 PDF나 JPG로 저장해 병원 진료 시 보여주세요.",
    annotations: [
      { type: "box", x: 55, y: 7, w: 43, h: 9, pulse: true }
    ],
  },
];
