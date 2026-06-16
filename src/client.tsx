import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// StrictMode intentionally runs effects twice in development, causing every
// API call to fire twice. We use a plain hydration here instead.
startTransition(() => {
  hydrateRoot(document, <StartClient />);
});
