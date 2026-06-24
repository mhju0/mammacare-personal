import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="text-6xl mb-4">🍼</div>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "'Paperlogic', sans-serif" }}
      >
        앗! 페이지를 찾을 수 없어요~ 메롱~~~~
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        요청하신 페이지가 없거나 이동되었어요
      </p>
      <Link to="/">
        <button className="px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-full hover:opacity-90 transition-opacity text-sm">
          홈으로 돌아가기
        </button>
      </Link>
    </div>
  );
}
