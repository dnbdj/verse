import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadPrefs } from "./lib/prefs";
import { appearanceOf, applyAppearance } from "./lib/theme";
import "./styles.css";

// Paint the saved theme before React mounts, so a restart never flashes the default palette.
applyAppearance(appearanceOf(loadPrefs()));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
