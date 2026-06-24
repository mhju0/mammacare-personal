package com.mammacare.app;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private int statusBarInsetPx;
    private int navigationBarInsetPx;
    private boolean statusBarVisible;
    private boolean navigationBarVisible;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets statusBars = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets navigationBars = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            statusBarInsetPx = statusBars.top;
            navigationBarInsetPx = navigationBars.bottom;
            statusBarVisible = windowInsets.isVisible(WindowInsetsCompat.Type.statusBars());
            navigationBarVisible = windowInsets.isVisible(WindowInsetsCompat.Type.navigationBars());
            updateWebViewOverlap();
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            ViewCompat.requestApplyInsets(findViewById(android.R.id.content));
            updateWebViewOverlap();
        }
    }

    private void updateWebViewOverlap() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().post(() -> {
            int[] location = new int[2];
            getBridge().getWebView().getLocationInWindow(location);
            int webViewTop = location[1];
            int webViewBottom = webViewTop + getBridge().getWebView().getHeight();
            int windowHeight = getWindow().getDecorView().getHeight();

            int topOverlapPx = statusBarVisible
                ? Math.max(0, Math.min(statusBarInsetPx, statusBarInsetPx - webViewTop))
                : 0;
            int navigationTop = windowHeight - navigationBarInsetPx;
            int bottomOverlapPx = navigationBarVisible
                ? Math.max(0, Math.min(navigationBarInsetPx, webViewBottom - navigationTop))
                : 0;

            syncSafeAreaCss(topOverlapPx, bottomOverlapPx);
        });
    }

    private void syncSafeAreaCss(int topOverlapPx, int bottomOverlapPx) {
        float density = getResources().getDisplayMetrics().density;
        float statusBarCssPx = topOverlapPx / density;
        float navigationBarCssPx = bottomOverlapPx / density;
        String script = String.format(
            Locale.US,
            "document.documentElement.style.setProperty('--app-safe-area-top','%.2fpx');" +
            "document.documentElement.style.setProperty('--app-safe-area-bottom','%.2fpx');",
            statusBarCssPx,
            navigationBarCssPx
        );
        getBridge().getWebView().evaluateJavascript(script, null);
        getBridge().getWebView().postDelayed(
            () -> getBridge().getWebView().evaluateJavascript(script, null), 500
        );
    }
}
