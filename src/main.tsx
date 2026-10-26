import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initializeTheme } from "./theme";
import "@seed-design/css/base.css";
import "./styles.css";
import "./admin-design.css";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
