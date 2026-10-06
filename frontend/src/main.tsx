import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {createBrowserRouter,RouterProvider} from "react-router";
import App from "./App";
import {LaunchGate} from './LaunchGate';
import "./styles.css";
import "./redesign.css";
import './fanCards.css';
import './designSync.css';

const router=createBrowserRouter([{path:'*',element:<LaunchGate><App/></LaunchGate>}]);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router}/>
  </StrictMode>,
);
