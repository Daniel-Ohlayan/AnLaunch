import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import LogsApp from "./components/LogsApp";

// Определяем, что это окно логов (через URL query или window flag)
const isLogsWindow =
  window.location.hash === "#logs" ||
  new URLSearchParams(window.location.search).get("logs") === "1" ||
  !!window.electronAPI?.isLogsWindow;

const Component = isLogsWindow ? LogsApp : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Component />
  </StrictMode>
);
