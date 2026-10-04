import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import {LaunchGate} from './LaunchGate';
import "./styles.css";
import "./redesign.css";
import './fanCards.css';
import './designSync.css';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LaunchGate><App /></LaunchGate>
    </BrowserRouter>
  </StrictMode>,
);
