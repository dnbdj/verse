/** True when Verse is running inside the Android WebView. */
export const isAndroid = (): boolean =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** True when the Tauri runtime is present, i.e. the desktop/mobile app, not a browser. */
export const insideTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
