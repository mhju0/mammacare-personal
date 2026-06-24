import type { Slide } from "../../components/TutorialModal";

export const scheduleSlides: Slide[] = [
  {
    image: "/tutorial/schedule_1.webp",
    caption: "AI로 식단을 손쉽게 일정에 추가할 수 있어요.",
    annotations: [
      { type: "callout", x: 49, y: 80, tx: 49, ty: 55, text: "AI가 개인에 맞게 식단을 구성" },
    ],
  },
  {
    image: "/tutorial/schedule_2.webp",
    caption: "식단 기간을 고르고, 추가하고 싶은 재료를 입력하세요.",
    annotations: [{ type: "box", x: 4, y: 36, w: 92, h: 13, pulse: true }],
  },
  {
    image: "/tutorial/schedule_3.webp",
    caption: "‘AI 식단 생성하기’를 누르면 잠깐 기다리는 사이 식단이 만들어져요.",
    annotations: [{ type: "box", x: 4, y: 85, w: 92, h: 13, pulse: true }],
  },
  {
    image: "/tutorial/schedule_4.webp",
    caption: "만들어진 식단을 살펴보고, 마음에 들면 ‘이대로 만들기’를 누르세요.",
    annotations: [
      { type: "callout", x: 73, y: 75, tx: 73, ty: 90, text: "등록해서 반영하기" },
    ],
  },
  {
    image: "/tutorial/schedule_5.webp",
    caption: "AI가 만든 식단은 일정에서 확인할 수 있어요.",
    annotations: [
      { type: "box", x: 2, y:22, w: 62, h: 40, pulse: true, },
    ],
  },
  {
    image: "/tutorial/schedule_6.webp",
    caption: "‘식단 추가’ 버튼을 눌러서 원하는 날짜에 직접 식단을 추가할 수 있어요.",
    annotations: [
      { type: "callout", x: 70, y: 50, tx: 79, ty: 13, text: "여기서 식단 추가하기" },
    ],
  },
  {
    image: "/tutorial/schedule_7.webp",
    caption: "식단 이름을 입력하면 추천 식단이 떠요.",
    annotations: [{ type: "box", x: 35, y: 30.5, w: 56, h: 40, pulse: true }],
  },
  {
    image: "/tutorial/schedule_8.webp",
    caption: "식단을 고르면 재료가 자동으로 등록돼요. 시간과 메모도 입력할 수 있어요.",
    annotations: [
      { type: "callout", x: 80, y: 28, tx: 62, ty: 38, text: "재료 입력" },
      { type: "callout", x: 81, y: 55, tx: 60, ty: 55, text: "식사 시간 입력" },
      { type: "callout", x: 80, y: 80 , tx: 62, ty: 70, text: "메모 입력" },
    ],
  },
  {
    image: "/tutorial/schedule_9.webp",
    caption: "재료를 바꾸려면 ‘재료 변경’을 누르세요.",
    annotations: [
      { type: "callout", x: 80, y: 42, tx: 58, ty: 42, text: "재료 직접 변경" },
      { type: "box", x: 42, y: 39, w: 14, h: 6 },
    ],
  },
  {
    image: "/tutorial/schedule_10.webp",
    caption: "재료 이름을 입력하고 식단에 재료를 직접 추가하세요.",
    annotations: [{ type: "box", x: 36, y: 58.5, w: 56, h: 9, pulse: true }],
  },
  {
    image: "/tutorial/schedule_11.webp",
    caption: "추가한 재료가 목록에 들어왔어요.",
    annotations: [
      { type: "callout", x: 82, y: 70, tx: 82, ty: 53, text: "새 재료 추가" },
    ],
  },
  {
    image: "/tutorial/schedule_12.webp",
    caption: "저장된 식단이에요. 언제든 ‘수정’으로 다시 바꿀 수 있어요.",
    annotations: [
      { type: "callout", x: 85, y: 58, tx: 85, ty: 25, text: "다시 수정하기" },
    ],
  },
  {
    image: "/tutorial/schedule_13.webp",
    caption: "하루에 여러 끼니를 추가할 수도 있어요.",
    annotations: [
      { type: "box", x: 1, y: 28.5, w: 20, h: 20 },
      { type: "callout", x: 83, y: 28, tx: 62, ty: 22, text: "08:00 식사" },
      { type: "callout", x: 83, y: 60, tx: 62, ty: 54, text: "12:00 식사" },
    ],
  },
];