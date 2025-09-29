import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import Page from "@/app/page";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
