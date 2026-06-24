import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { BabyInfoForm } from "../components/BabyInfoForm";
import { ApiError } from "../api/client";
import { ChevronLeft } from "lucide-react";
import {
  listConfirmedAllergies,
  createConfirmedAllergy,
  deleteConfirmedAllergy,
  listTestings,
  createTesting,
  deleteTesting,
  type ConfirmedAllergyResponse,
  type IngredientTestingResponse,
} from "../api/allergy";

export default function ProfileEdit() {
  const { activeBaby, updateActiveBaby, token, refreshConfirmedAllergies } = useApp();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [existingConfirmed, setExistingConfirmed] = useState<ConfirmedAllergyResponse[]>([]);
  const [loadingAllergens, setLoadingAllergens] = useState(true);
  const [existingSafeTestings, setExistingSafeTestings] = useState<IngredientTestingResponse[]>([]);
  const [loadingSafe, setLoadingSafe] = useState(true);

  useEffect(() => {
    if (!activeBaby || !token) { setLoadingAllergens(false); return; }
    listConfirmedAllergies(activeBaby.id, token)
      .then(setExistingConfirmed)
      .catch(() => {})
      .finally(() => setLoadingAllergens(false));
  }, [activeBaby?.id, token]);

  useEffect(() => {
    if (!activeBaby || !token) { setLoadingSafe(false); return; }
    listTestings(activeBaby.id, token)
      .then((all) => setExistingSafeTestings(all.filter((t) => t.test_status === "completed_safe")))
      .catch(() => {})
      .finally(() => setLoadingSafe(false));
  }, [activeBaby?.id, token]);

  if (!activeBaby) {
    navigate("/profile");
    return null;
  }

  const initialAllergens: { id: number; name: string; emoji: string | null }[] = existingConfirmed
    .filter((c) => c.ingredient_id != null && c.ingredient_name != null)
    .map((c) => ({ id: c.ingredient_id, name: c.ingredient_name!, emoji: c.ingredient_emoji ?? null }));

  const initialSafeIngredients: { id: number; name: string; emoji: string | null }[] = existingSafeTestings
    .map((t) => ({ id: t.ingredient_id, name: t.ingredient_name, emoji: t.ingredient_emoji }));

  return (
    <div className="max-w-xl mx-auto px-4 py-4">
      <div className="relative flex items-center justify-center mb-3 py-3">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="absolute left-0 top-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          뒤로 가기
        </button>
        <h1
          className="text-2xl font-medium text-foreground text-center"
          style={{ fontFamily: "'paperlogic', sans-serif" }}
        >
          아기 프로필 수정
        </h1>
      </div>

      {loadingAllergens || loadingSafe ? (
        <div className="text-center py-10 text-muted-foreground text-sm">불러오는 중...</div>
      ) : (
        <BabyInfoForm
          initial={{ ...activeBaby, allergens: initialAllergens, safeIngredients: initialSafeIngredients }}
          saving={saving}
          onSave={async (info, file) => {
            if (!token) return;
            setSaving(true);
            try {
              await updateActiveBaby({ ...info, id: activeBaby.id }, file);

              const today = new Date().toISOString().split("T")[0];
              const safeStartDate = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

              // 알레르기 확정 목록 동기화
              const newAllergenIds = new Set(info.allergens.map((a) => a.id));
              const oldAllergenIds = new Set(existingConfirmed.map((c) => c.ingredient_id));
              const allergenToAdd = info.allergens.filter((a) => !oldAllergenIds.has(a.id));
              const allergenToDelete = existingConfirmed.filter((c) => !newAllergenIds.has(c.ingredient_id));

              // 안전 재료 동기화
              const newSafeIds = new Set(info.safeIngredients.map((s) => s.id));
              const oldSafeIds = new Set(existingSafeTestings.map((t) => t.ingredient_id));
              const safeToAdd = info.safeIngredients.filter((s) => !oldSafeIds.has(s.id));
              const safeToDelete = existingSafeTestings.filter((t) => !newSafeIds.has(t.ingredient_id));

              await Promise.allSettled([
                ...allergenToAdd.map((a) =>
                  createConfirmedAllergy({ baby_id: activeBaby.id, ingredient_id: a.id, confirmed_date: today }, token),
                ),
                ...allergenToDelete.map((c) => deleteConfirmedAllergy(c.id, token)),
                ...safeToAdd.map((s) =>
                  createTesting({ baby_id: activeBaby.id, ingredient_id: s.id, test_start_date: safeStartDate, test_status: "completed_safe" }, token),
                ),
                ...safeToDelete.map((t) => deleteTesting(t.id, token)),
              ]);

              refreshConfirmedAllergies();
              navigate("/profile");
            } catch (e) {
              const message = e instanceof ApiError ? e.message : "수정에 실패했습니다. 다시 시도해주세요.";
              alert(message);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => navigate("/profile")}
          title=""
          saveLabel="수정 완료"
        />
      )}
    </div>
  );
}
