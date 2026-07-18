import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { createRuaLensApi } from "./api/client";
import { ApiProvider } from "./api/context";
import "./styles.css";

const root = document.getElementById("root");
const api = createRuaLensApi();

if (!root) {
  throw new Error("RUA Lens root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <ApiProvider api={api}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApiProvider>
  </StrictMode>,
);
