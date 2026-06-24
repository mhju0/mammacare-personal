import { useState } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { ApiError } from "../api/client";
import { BabyInfoForm, DEFAULT_BABY_FORM } from "../components/BabyInfoForm";
import { Plus, X, Venus, Mars } from "lucide-react";
import type { BabyProfile } from "../context/AppContext";

function DefaultProfileIcon({ gender }: { gender: BabyProfile["gender"] }) {
  const strokeColor =
    gender === "girl" ? "#FFB7A5" : gender === "boy" ? "#B3DAF5" : "#A1A1A1";

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#FAFAFA]">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3/4 h-3/4"
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
        <path d="M15 12h.01" />
        <path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" />
        <path d="M9 12h.01" />
      </svg>
    </div>
  );
}

export default function ProfileSelect() {
  const { user, babies, addBaby, selectBaby } = useApp();
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  useBodyScrollLock(showAddModal);

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  const handleSelectBaby = (id: string) => {
    selectBaby(id);
    navigate("/profile");
  };

  const handleAddSave = async (info: Parameters<typeof addBaby>[0], file?: File | null) => {
    try {
      await addBaby(info, file);
      setShowAddModal(false);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "프로필 추가에 실패했습니다. 다시 시도해주세요.";
      alert(message);
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center px-4 py-10">
      <h1
        className="text-3xl font-bold text-foreground mb-2"
        style={{ fontFamily: "'Paperlogic', sans-serif" }}
      >
        누구의 기록을 볼까요?
      </h1>
      <p className="text-xl text-muted-foreground mb-12">
        아기 프로필을 선택해주세요
      </p>

      {/* Profile cards row */}
      <div className="flex flex-wrap items-start justify-center gap-6 max-w-4xl">
        {babies.map((baby) => (
          <button
            key={baby.id}
            onClick={() => handleSelectBaby(baby.id)}
            className="group flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-primary/10 transition-all duration-200"
          >
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-transparent group-hover:border-[#FFF5D4] transition-all duration-200 shadow-md">
              {baby.photo ? (
                <img src={baby.photo} alt={baby.name} className="w-full h-full object-cover" />
              ) : (
                <DefaultProfileIcon gender={baby.gender} />
              )}
            </div>
            <span className="text-lg font-bold text-foreground transition-colors">
              {baby.name}
            </span>
            {baby.gender && (
              <span
                className="inline-flex items-center gap-1.5 h-8 text-base text-foreground px-3 rounded-full font-semibold"
                style={{
                  background: baby.gender === "girl"
                    ? "radial-gradient(ellipse at center, #FFFAF0 0%, #FFB7A5 100%)"
                    : "radial-gradient(ellipse at center, #EBF7FF 0%, #B3DAF5 100%)",
                }}
              >
                {baby.gender === "girl" ? <><Venus size={16} /> 여아</> : <><Mars size={16} /> 남아</>}
              </span>
            )}
          </button>
        ))}

        {/* Add profile button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="group flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-primary/10 transition-all duration-200"
        >
          <div className="w-28 h-28 rounded-full border-4 border-dashed border-border group-hover:border-[#FFF5D4] flex items-center justify-center bg-muted/30 transition-all duration-200">
            <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground transition-colors" />
          </div>
          <span className="text-lg font-bold text-foreground transition-colors">
            프로필 추가
          </span>
        </button>
      </div>

      {/* Add profile modal */}
      {showAddModal &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center px-4 pt-20 pb-8">
            <div className="bg-card rounded-3xl w-full max-w-xl shadow-2xl border border-border flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
                <h2
                  className="text-xl font-bold text-foreground"
                  style={{ fontFamily: "'Paperlogic', sans-serif" }}
                >
                  아기 프로필 추가
                </h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors"
                >
                  <X size={18} className="text-muted-foreground" />
                </button>
              </div>
              <div className="overflow-y-auto px-6 pb-5
                [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-white [&::-webkit-scrollbar-track]:rounded-full
                [&::-webkit-scrollbar-thumb]:bg-[#D9F0FF] [&::-webkit-scrollbar-thumb]:rounded-full">
                <BabyInfoForm
                  initial={DEFAULT_BABY_FORM}
                  onSave={handleAddSave}
                  onCancel={() => setShowAddModal(false)}
                  title=""
                  saveLabel="프로필 추가 완료"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}