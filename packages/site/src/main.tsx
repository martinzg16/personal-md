import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./style.css";

const host = document.getElementById("root");
if (!host) throw new Error("no #root to mount on");

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
