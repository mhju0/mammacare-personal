// Cross-reactivity data based on SDAP 2.0 and WHO/IUIS Allergen Nomenclature DB
// Reference: https://www.allergen.org / https://sdap.ucsd.edu

export interface CrossReactiveIngredient {
  name: string;
  reason: string;
  severity: "high" | "medium" | "low";
}

export interface SuspectedIngredient {
  suspectedName: string;
  reason: string;
  severity: "high" | "medium" | "low";
  sourceAllergen: string;
}

// Key: known allergen (Korean name matching DB ingredient.name), Value: cross-reactive ingredients to suspect
export const CROSS_REACTIVITY_MAP: Record<string, CrossReactiveIngredient[]> = {
  // ── 갑각류 — 트로포미오신(tropomyosin) 교차반응 ──────────────────────────────
  새우: [
    { name: "게", reason: "갑각류 트로포미오신(Pen a 1) 교차반응", severity: "high" },
    { name: "바닷가재", reason: "갑각류 트로포미오신 교차반응", severity: "high" },
    { name: "가재", reason: "갑각류 트로포미오신 교차반응", severity: "high" },
    { name: "오징어", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "낙지", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "문어", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "전복", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "굴", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "바지락", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],
  게: [
    { name: "새우", reason: "갑각류 트로포미오신 교차반응", severity: "high" },
    { name: "바닷가재", reason: "갑각류 트로포미오신 교차반응", severity: "high" },
    { name: "가재", reason: "갑각류 트로포미오신 교차반응", severity: "high" },
    { name: "오징어", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "낙지", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "문어", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "전복", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "굴", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "바지락", reason: "연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],

  // ── 연체동물 — 트로포미오신(tropomyosin) 교차반응 ────────────────────────────
  오징어: [
    { name: "낙지", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "문어", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "전복", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "굴", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "바지락", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "새우", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "게", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],
  낙지: [
    { name: "오징어", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "문어", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "전복", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "굴", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "바지락", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "새우", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "게", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],
  문어: [
    { name: "오징어", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "낙지", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "전복", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "굴", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "바지락", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "새우", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "게", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],
  전복: [
    { name: "굴", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "바지락", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "오징어", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "낙지", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "문어", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "새우", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "게", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],
  굴: [
    { name: "전복", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "바지락", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "오징어", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "낙지", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "문어", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "새우", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "게", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],
  바지락: [
    { name: "굴", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "전복", reason: "연체동물 트로포미오신 교차반응", severity: "high" },
    { name: "오징어", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "낙지", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "문어", reason: "연체동물 트로포미오신 교차반응", severity: "medium" },
    { name: "새우", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
    { name: "게", reason: "갑각류-연체동물 트로포미오신 부분 교차반응", severity: "low" },
  ],

  // ── 어류 — 파르발부민(parvalbumin) 교차반응 ────────────────────────────────
  고등어: [
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  연어: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  대구: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  명태: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  멸치: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  갈치: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  삼치: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "가자미", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],
  가자미: [
    { name: "고등어", reason: "어류 파르발부민 교차반응", severity: "high" },
    { name: "연어", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "대구", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "명태", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "멸치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "갈치", reason: "어류 파르발부민 교차반응", severity: "medium" },
    { name: "삼치", reason: "어류 파르발부민 교차반응", severity: "medium" },
  ],

  // ── 두류 — 종자저장단백질(seed storage protein) 교차반응 ──────────────────
  땅콩: [
    { name: "대두", reason: "두류 2S 알부민·7S 글로불린 교차반응", severity: "medium" },
    { name: "두부", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "완두", reason: "두류 비씨린/레구민 교차반응", severity: "medium" },
    { name: "렌틸콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "병아리콩", reason: "두류 종자저장단백질 교차반응", severity: "low" },
    { name: "강낭콩", reason: "두류 비씨린 교차반응", severity: "low" },
    { name: "참깨", reason: "2S 알부민 교차반응", severity: "medium" },
  ],
  대두: [
    { name: "땅콩", reason: "두류 2S 알부민·7S 글로불린 교차반응", severity: "medium" },
    { name: "두부", reason: "대두 Gly m 단백질 동일 성분", severity: "high" },
    { name: "콩나물", reason: "대두 Gly m 단백질 동일 성분", severity: "high" },
    { name: "완두", reason: "두류 비씨린/레구민 교차반응", severity: "medium" },
    { name: "렌틸콩", reason: "두류 종자저장단백질 교차반응", severity: "low" },
  ],
  두부: [
    { name: "대두", reason: "대두 동일 단백질(Gly m 4 등)", severity: "high" },
    { name: "콩나물", reason: "대두 동일 단백질", severity: "high" },
    { name: "땅콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "완두", reason: "두류 비씨린/레구민 교차반응", severity: "low" },
  ],
  콩나물: [
    { name: "대두", reason: "대두 동일 단백질(콩 유래 성분)", severity: "high" },
    { name: "두부", reason: "대두 동일 단백질", severity: "high" },
    { name: "땅콩", reason: "두류 종자저장단백질 교차반응", severity: "low" },
  ],
  완두: [
    { name: "땅콩", reason: "두류 비씨린/레구민 교차반응", severity: "medium" },
    { name: "대두", reason: "두류 비씨린/레구민 교차반응", severity: "medium" },
    { name: "두부", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "렌틸콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "병아리콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "강낭콩", reason: "두류 비씨린 교차반응", severity: "low" },
  ],
  렌틸콩: [
    { name: "땅콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "대두", reason: "두류 종자저장단백질 교차반응", severity: "low" },
    { name: "완두", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "병아리콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "강낭콩", reason: "두류 비씨린 교차반응", severity: "medium" },
  ],
  병아리콩: [
    { name: "땅콩", reason: "두류 종자저장단백질 교차반응", severity: "low" },
    { name: "대두", reason: "두류 종자저장단백질 교차반응", severity: "low" },
    { name: "완두", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "렌틸콩", reason: "두류 종자저장단백질 교차반응", severity: "medium" },
    { name: "강낭콩", reason: "두류 비씨린 교차반응", severity: "medium" },
  ],
  강낭콩: [
    { name: "완두", reason: "두류 비씨린 교차반응", severity: "low" },
    { name: "렌틸콩", reason: "두류 비씨린 교차반응", severity: "medium" },
    { name: "병아리콩", reason: "두류 비씨린 교차반응", severity: "medium" },
    { name: "땅콩", reason: "두류 비씨린 교차반응", severity: "low" },
  ],

  // ── 참깨 — 2S 알부민 교차반응 ─────────────────────────────────────────────
  참깨: [
    { name: "땅콩", reason: "2S 알부민 교차반응", severity: "medium" },
    { name: "호두", reason: "2S 알부민·저장단백질 교차반응", severity: "low" },
    { name: "아몬드", reason: "2S 알부민 교차반응", severity: "low" },
  ],

  // ── 곡류 — 글루텐/프롤라민(prolamin) 교차반응 ────────────────────────────
  밀: [
    { name: "보리", reason: "곡류 호데인-글리아딘 교차반응", severity: "high" },
    { name: "귀리", reason: "곡류 아베닌 교차반응", severity: "medium" },
    { name: "호밀", reason: "곡류 세카린 교차반응", severity: "high" },
    { name: "오트밀", reason: "귀리 아베닌 교차반응", severity: "medium" },
  ],
  보리: [
    { name: "밀", reason: "곡류 호데인-글리아딘 교차반응", severity: "high" },
    { name: "오트밀", reason: "곡류 아베닌 교차반응", severity: "medium" },
  ],
  오트밀: [
    { name: "밀", reason: "곡류 아베닌 교차반응", severity: "medium" },
    { name: "보리", reason: "곡류 아베닌 교차반응", severity: "medium" },
  ],
  메밀: [
    { name: "퀴노아", reason: "메밀 파고피린 유사 단백질 부분 교차반응", severity: "low" },
  ],

  // ── 견과류 — 2S 알부민·11S 글로불린 교차반응 ──────────────────────────────
  호두: [
    { name: "잣", reason: "견과류 종자저장단백질 교차반응", severity: "medium" },
    { name: "아몬드", reason: "견과류 2S 알부민 교차반응", severity: "medium" },
    { name: "캐슈너트", reason: "견과류 11S 글로불린 교차반응", severity: "medium" },
    { name: "피스타치오", reason: "캐슈너트 유사 단백질 교차반응", severity: "medium" },
    { name: "피칸", reason: "호두 Jug r 동족체(homolog) 교차반응", severity: "high" },
    { name: "헤이즐넛", reason: "견과류 PR-10 단백질 교차반응", severity: "medium" },
    { name: "마카다미아", reason: "견과류 2S 알부민 교차반응", severity: "low" },
  ],
  잣: [
    { name: "호두", reason: "견과류 종자저장단백질 교차반응", severity: "medium" },
    { name: "아몬드", reason: "견과류 2S 알부민 교차반응", severity: "low" },
    { name: "캐슈너트", reason: "견과류 11S 글로불린 교차반응", severity: "low" },
    { name: "피스타치오", reason: "견과류 종자저장단백질 교차반응", severity: "low" },
  ],
  아몬드: [
    { name: "호두", reason: "견과류 2S 알부민 교차반응", severity: "medium" },
    { name: "잣", reason: "견과류 2S 알부민 교차반응", severity: "low" },
    { name: "캐슈너트", reason: "견과류 11S 글로불린 교차반응", severity: "medium" },
    { name: "헤이즐넛", reason: "견과류 PR-10·LTP 교차반응", severity: "medium" },
    { name: "복숭아", reason: "장미과(핵과) LTP 교차반응", severity: "medium" },
    { name: "참깨", reason: "2S 알부민 교차반응", severity: "low" },
  ],
  캐슈너트: [
    { name: "피스타치오", reason: "옻나무과 종자저장단백질 교차반응", severity: "high" },
    { name: "호두", reason: "견과류 11S 글로불린 교차반응", severity: "medium" },
    { name: "아몬드", reason: "견과류 11S 글로불린 교차반응", severity: "medium" },
    { name: "잣", reason: "견과류 종자저장단백질 교차반응", severity: "low" },
  ],
  밤: [
    { name: "호두", reason: "견과류 LTP 교차반응", severity: "low" },
    { name: "아몬드", reason: "견과류 LTP 교차반응", severity: "low" },
  ],

  // ── 복숭아 — LTP(Lipid Transfer Protein)·PR-10 교차반응 ──────────────────
  복숭아: [
    { name: "사과", reason: "장미과 LTP(Pru p 3) 교차반응", severity: "high" },
    { name: "배", reason: "장미과 LTP 교차반응", severity: "high" },
    { name: "자두", reason: "장미과 LTP 교차반응", severity: "high" },
    { name: "살구", reason: "장미과 LTP 교차반응", severity: "high" },
    { name: "체리", reason: "장미과 LTP·PR-10 교차반응", severity: "medium" },
    { name: "매실", reason: "장미과 LTP 교차반응", severity: "medium" },
    { name: "딸기", reason: "장미과 Fra a 3 교차반응", severity: "medium" },
    { name: "아몬드", reason: "장미과(핵과) LTP 교차반응", severity: "medium" },
    { name: "망고", reason: "LTP 교차반응", severity: "medium" },
    { name: "토마토", reason: "LTP 부분 교차반응", severity: "low" },
  ],
  사과: [
    { name: "복숭아", reason: "장미과 LTP·PR-10 교차반응", severity: "high" },
    { name: "배", reason: "장미과 LTP 교차반응", severity: "high" },
    { name: "체리", reason: "장미과 PR-10 교차반응", severity: "high" },
    { name: "자두", reason: "장미과 LTP 교차반응", severity: "medium" },
    { name: "살구", reason: "장미과 LTP 교차반응", severity: "medium" },
    { name: "딸기", reason: "장미과 Fra a 3 교차반응", severity: "medium" },
    { name: "망고", reason: "LTP 부분 교차반응", severity: "low" },
  ],
  딸기: [
    { name: "복숭아", reason: "장미과 Fra a 3·LTP 교차반응", severity: "medium" },
    { name: "사과", reason: "장미과 Fra a 3·PR-10 교차반응", severity: "medium" },
    { name: "배", reason: "장미과 LTP 교차반응", severity: "medium" },
    { name: "체리", reason: "장미과 PR-10·LTP 교차반응", severity: "low" },
  ],
  배: [
    { name: "복숭아", reason: "장미과 LTP 교차반응", severity: "high" },
    { name: "사과", reason: "장미과 LTP 교차반응", severity: "high" },
    { name: "자두", reason: "장미과 LTP 교차반응", severity: "medium" },
    { name: "딸기", reason: "장미과 LTP 교차반응", severity: "medium" },
  ],
  망고: [
    { name: "복숭아", reason: "LTP 교차반응", severity: "medium" },
    { name: "사과", reason: "LTP 부분 교차반응", severity: "low" },
    { name: "키위", reason: "유사 LTP 교차반응", severity: "low" },
    { name: "아보카도", reason: "라텍스-과일 증후군 부분 교차반응", severity: "low" },
  ],
  키위: [
    { name: "아보카도", reason: "라텍스-과일 증후군 교차반응", severity: "medium" },
    { name: "바나나", reason: "라텍스-과일 증후군 교차반응", severity: "medium" },
    { name: "복숭아", reason: "LTP 교차반응", severity: "medium" },
    { name: "망고", reason: "유사 LTP 교차반응", severity: "low" },
  ],
  바나나: [
    { name: "아보카도", reason: "라텍스-과일 증후군 교차반응", severity: "high" },
    { name: "키위", reason: "라텍스-과일 증후군 교차반응", severity: "medium" },
    { name: "망고", reason: "라텍스-과일 증후군 부분 교차반응", severity: "low" },
  ],
  아보카도: [
    { name: "바나나", reason: "라텍스-과일 증후군 교차반응", severity: "high" },
    { name: "키위", reason: "라텍스-과일 증후군 교차반응", severity: "medium" },
    { name: "망고", reason: "라텍스-과일 증후군 부분 교차반응", severity: "low" },
  ],
  귤: [
    { name: "오렌지", reason: "감귤류 프로필린 교차반응", severity: "high" },
    { name: "파인애플", reason: "프로필린 부분 교차반응", severity: "low" },
  ],
  오렌지: [
    { name: "귤", reason: "감귤류 프로필린 교차반응", severity: "high" },
    { name: "파인애플", reason: "프로필린 부분 교차반응", severity: "low" },
  ],
  파인애플: [
    { name: "귤", reason: "프로필린 부분 교차반응", severity: "low" },
    { name: "오렌지", reason: "프로필린 부분 교차반응", severity: "low" },
  ],
  감: [
    { name: "복숭아", reason: "LTP 교차반응", severity: "medium" },
    { name: "사과", reason: "LTP 부분 교차반응", severity: "low" },
  ],

  // ── 토마토 — 가지과(Solanaceae) LTP 교차반응 ──────────────────────────────
  토마토: [
    { name: "감자", reason: "가지과 LTP·프로필린 교차반응", severity: "low" },
    { name: "가지", reason: "가지과 LTP 교차반응", severity: "low" },
    { name: "파프리카", reason: "가지과 LTP 교차반응", severity: "medium" },
    { name: "복숭아", reason: "LTP(Lyc e 3) 부분 교차반응", severity: "low" },
  ],

  // ── 우유·유제품 — 카세인(casein)·유청단백질 교차반응 ─────────────────────
  우유: [
    { name: "치즈", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "아기치즈", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "버터", reason: "우유 카세인 성분 포함", severity: "high" },
    { name: "요거트", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "크림", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "분유", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
  ],
  치즈: [
    { name: "우유", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "아기치즈", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "버터", reason: "우유 카세인 성분 포함", severity: "medium" },
    { name: "요거트", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
  ],
  아기치즈: [
    { name: "우유", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "치즈", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
    { name: "버터", reason: "우유 카세인 성분 포함", severity: "medium" },
    { name: "요거트", reason: "우유 카세인·유청단백질 동일 성분", severity: "high" },
  ],

  // ── 달걀·계란 — 오보뮤코이드(ovomucoid)·오발부민(ovalbumin) 교차반응 ───────
  달걀: [
    { name: "달걀 노른자", reason: "달걀 동일 단백질(리베틴 등)", severity: "high" },
    { name: "달걀 흰자", reason: "달걀 오발부민·오보뮤코이드 동일 성분", severity: "high" },
    { name: "메추리알", reason: "조류 난백 오보뮤코이드 교차반응", severity: "high" },
    { name: "오리알", reason: "조류 난백 오보뮤코이드 교차반응", severity: "medium" },
  ],
  계란: [
    { name: "달걀 노른자", reason: "달걀 동일 단백질(리베틴 등)", severity: "high" },
    { name: "달걀 흰자", reason: "달걀 오발부민·오보뮤코이드 동일 성분", severity: "high" },
    { name: "메추리알", reason: "조류 난백 오보뮤코이드 교차반응", severity: "high" },
    { name: "오리알", reason: "조류 난백 오보뮤코이드 교차반응", severity: "medium" },
  ],
  "달걀 노른자": [
    { name: "달걀", reason: "달걀 동일 단백질(리베틴 등)", severity: "high" },
    { name: "달걀 흰자", reason: "달걀 오발부민·오보뮤코이드 동일 성분", severity: "high" },
    { name: "메추리알", reason: "조류 난백 교차반응", severity: "high" },
  ],
  "달걀 흰자": [
    { name: "달걀", reason: "달걀 오발부민·오보뮤코이드 동일 성분", severity: "high" },
    { name: "달걀 노른자", reason: "달걀 동일 성분", severity: "high" },
    { name: "메추리알", reason: "조류 난백 오보뮤코이드 교차반응", severity: "high" },
  ],

  // ── 가금류 — 혈청 알부민(serum albumin) 교차반응 ─────────────────────────
  닭고기: [
    { name: "오리고기", reason: "가금류 혈청 알부민 교차반응", severity: "high" },
  ],
  오리고기: [
    { name: "닭고기", reason: "가금류 혈청 알부민 교차반응", severity: "high" },
  ],

  // ── 포유류 육류 — 알파갈(alpha-Gal)·혈청 알부민 교차반응 ─────────────────
  소고기: [
    { name: "양고기", reason: "포유류 혈청 알부민·알파갈 교차반응", severity: "medium" },
    { name: "돼지고기", reason: "포유류 혈청 알부민 부분 교차반응", severity: "low" },
  ],
  쇠고기: [
    { name: "양고기", reason: "포유류 혈청 알부민·알파갈 교차반응", severity: "medium" },
    { name: "돼지고기", reason: "포유류 혈청 알부민 부분 교차반응", severity: "low" },
  ],
  돼지고기: [
    { name: "소고기", reason: "포유류 혈청 알부민 부분 교차반응", severity: "low" },
    { name: "양고기", reason: "포유류 혈청 알부민 교차반응", severity: "medium" },
  ],
};

// 식품의약품안전처 표시대상 알레르기 유발물질 (2023 기준)
export const STANDARD_KOREAN_ALLERGENS: {
  name: string;
  note: string | null;
}[] = [
  { name: "토마토", note: null },
  { name: "새우", note: null },
  { name: "소고기", note: null },
  { name: "돼지고기", note: null },
  { name: "복숭아", note: null },
  { name: "닭고기", note: null },
  { name: "땅콩", note: null },
  { name: "호두", note: null },
  { name: "계란", note: null },
  { name: "잣", note: null },
  { name: "메밀", note: null },
  { name: "밀", note: null },
  { name: "대두", note: null },
  { name: "고등어", note: null },
  { name: "오징어", note: null },
  { name: "게", note: null },
  { name: "조개류", note: null },
  { name: "우유", note: null },
];

// 알레르기 반응 재료 이름 목록 → 교차반응 의심 재료 목록 반환 (위험도 높은 순 정렬)
export function getSuspectedIngredients(
  reactionIngredientNames: string[],
): SuspectedIngredient[] {
  const seen = new Set<string>();
  const result: SuspectedIngredient[] = [];

  for (const reactionName of reactionIngredientNames) {
    for (const cr of CROSS_REACTIVITY_MAP[reactionName] ?? []) {
      if (reactionIngredientNames.includes(cr.name)) continue;
      if (seen.has(cr.name)) continue;
      seen.add(cr.name);
      result.push({
        suspectedName: cr.name,
        reason: cr.reason,
        severity: cr.severity,
        sourceAllergen: reactionName,
      });
    }
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return result.sort((a, b) => order[a.severity] - order[b.severity]);
}

// 확정 재료 + 반응 재료를 모두 참고해 교차반응 의심 재료 목록 반환
// 확정 재료 기반 의심 재료가 먼저, 각 그룹 내에서는 위험도 높은 순 정렬
export function getSuspectedIngredientsPrioritized(
  confirmedAllergenNames: string[],
  reactionAllergenNames: string[],
): SuspectedIngredient[] {
  const allKnownNames = new Set([...confirmedAllergenNames, ...reactionAllergenNames]);
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };

  // 확정·반응 그룹을 독립적인 seen으로 처리해, 같은 의심 재료가 양쪽 출처를 모두 가질 수 있게 함
  const seenConfirmed = new Set<string>();
  const fromConfirmed: SuspectedIngredient[] = [];
  for (const name of confirmedAllergenNames) {
    for (const cr of CROSS_REACTIVITY_MAP[name] ?? []) {
      if (allKnownNames.has(cr.name) || seenConfirmed.has(cr.name)) continue;
      seenConfirmed.add(cr.name);
      fromConfirmed.push({ suspectedName: cr.name, reason: cr.reason, severity: cr.severity, sourceAllergen: name });
    }
  }
  fromConfirmed.sort((a, b) => order[a.severity] - order[b.severity]);

  const seenReaction = new Set<string>();
  const fromReaction: SuspectedIngredient[] = [];
  for (const name of reactionAllergenNames) {
    for (const cr of CROSS_REACTIVITY_MAP[name] ?? []) {
      if (allKnownNames.has(cr.name) || seenReaction.has(cr.name)) continue;
      seenReaction.add(cr.name);
      fromReaction.push({ suspectedName: cr.name, reason: cr.reason, severity: cr.severity, sourceAllergen: name });
    }
  }
  fromReaction.sort((a, b) => order[a.severity] - order[b.severity]);

  return [...fromConfirmed, ...fromReaction];
}

// 단일 재료명이 반응 재료와 교차반응 관계인지 확인
export function isCrossReactiveSuspect(
  ingredientName: string,
  reactionIngredientNames: string[],
): {
  isSuspect: boolean;
  sourceAllergen?: string;
  reason?: string;
  severity?: "high" | "medium" | "low";
} {
  for (const reactionName of reactionIngredientNames) {
    const match = (CROSS_REACTIVITY_MAP[reactionName] ?? []).find(
      (cr) => cr.name === ingredientName,
    );
    if (match) {
      return {
        isSuspect: true,
        sourceAllergen: reactionName,
        reason: match.reason,
        severity: match.severity,
      };
    }
  }
  return { isSuspect: false };
}
