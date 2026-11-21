/** True when Verse is running inside the Android WebView. */
export const isAndroid = (): boolean =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
