import { useNavigate } from "react-router";
import TutorialModal from "../components/TutorialModal";
import { tutorialSlides } from "../components/tutorialSlides";

export default function Tutorial() {
  const navigate = useNavigate();
  return (
    <TutorialModal
      open={true}
      onClose={() => navigate("/")}
      slides={tutorialSlides}
      title="맘마케어 시작 가이드"
    />
  );
}