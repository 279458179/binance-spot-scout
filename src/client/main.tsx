import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");

if (!container) {
  throw new Error("#root container is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <main>
      <h1>币喵雷达 · Spot Scout</h1>
      <p>点击一次，只给你一个候选人。</p>
    </main>
  </StrictMode>,
);
