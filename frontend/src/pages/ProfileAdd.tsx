import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { BabyInfoForm, DEFAULT_BABY_FORM } from "../components/BabyInfoForm";
import { ChevronLeft } from "lucide-react";
import { ApiError } from "../api/client";

export default function ProfileAdd() {
  const { user, addBaby, selectBaby } = useApp();
  const navigate = useNavigate();

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  const handleSave = async (info: Parameters<typeof addBaby>[0], file?: File | null) => {
    try {
      const id = await addBaby(info, file);
      selectBaby(id);
      navigate("/profile");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "프로필 추가에 실패했습니다. 다시 시도해주세요.";
      alert(message);
    }
  };

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
          아기 프로필 추가
        </h1>
      </div>

      <BabyInfoForm
        initial={DEFAULT_BABY_FORM}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
        title=""
        saveLabel="추가 완료"
      />
    </div>
  );
}
