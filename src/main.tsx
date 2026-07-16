import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { loadProgressAsync } from "./lib/storage";
import "./styles.css";

async function bootstrap() {
  if (!Capacitor.isNativePlatform()) registerSW({ immediate: true });
  const initialProgress = await loadProgressAsync();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App initialProgress={initialProgress} />
    </React.StrictMode>,
  );
}

void bootstrap();
