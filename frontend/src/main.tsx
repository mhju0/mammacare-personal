import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import './styles/fonts.css'
import { Capacitor } from "@capacitor/core";

if (Capacitor.isNativePlatform()) {
  document.documentElement.style.fontSize = "16px";
  document.documentElement.classList.add("app-native");
}

createRoot(document.getElementById("root")!).render(<App />);
