import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "@/lib/push";

createRoot(document.getElementById("root")!).render(<App />);

// PWA shell (scheduling audit stage 3): registration is safe on every load —
// the permission prompt only ever fires from an explicit user gesture.
registerServiceWorker();
