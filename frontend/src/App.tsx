import { useEffect, useRef } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AppProvider } from "./context/AppContext";
import { useWebPush } from "./hooks/useWebPush";
import { useNativePush } from "./hooks/useNativePush";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { toast } from "sonner";

function WebPushBootstrap() {
  useWebPush();
  return null;
}

function NativePushBootstrap() {
  useNativePush();
  return null;
}

function BackButtonHandler() {
  const backPressedRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapApp.addListener("backButton", () => {
      const canGoBack = (window.history.state?.idx ?? 0) > 0;

      if (canGoBack) {
        router.navigate(-1);
        return;
      }

      if (backPressedRef.current) {
        CapApp.exitApp();
        return;
      }

      backPressedRef.current = true;
      toast("한 번 더 누르면 앱이 종료됩니다", { duration: 2000 });
      setTimeout(() => { backPressedRef.current = false; }, 2000);
    });

    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <AppProvider>
      {Capacitor.isNativePlatform() ? <NativePushBootstrap /> : <WebPushBootstrap />}
      <BackButtonHandler />
      <RouterProvider router={router} />
    </AppProvider>
  );
}
