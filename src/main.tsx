import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Component foundations load before App so every screen stylesheet App pulls in can refine them.
import "./pretendard.css";
import "./kickon-ui.css";
import App from "./App";
import { initializeTheme } from "./theme";
import "./styles.css";
import "./admin-design.css";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
