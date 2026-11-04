"use client";

import { useEffect } from "react";
import { assetPath } from "@/lib/base-path";

/**
 * Регистрирует service worker (офлайн-оболочка + установка как PWA).
 * Только в production-сборке: dev-сервер перехватывать кешем нельзя.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = (): void => {
      /* Базовый путь известен на сборке: /repo/ на GitHub Pages, / на своём домене */
      navigator.serviceWorker
        .register(assetPath("/sw.js"), { scope: assetPath("/") })
        .catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
