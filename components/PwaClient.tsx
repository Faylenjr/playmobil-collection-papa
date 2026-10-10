"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaClient() {
  const [online, setOnline] = useState(true);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);

    const hidden = localStorage.getItem("pwa-install-dismissed") === "yes" || isStandalone();
    setDismissed(hidden);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setShowIosHelp(ios && !hidden);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setDismissed(false);
    };
    const onInstalled = () => { setPrompt(null); setShowIosHelp(false); setDismissed(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem("pwa-install-dismissed", "yes");
    setDismissed(true);
  };

  return <>
    {!online && <div className="offline-status" role="status">Hors connexion · les modifications nécessitent une connexion</div>}
    {!dismissed && (prompt || showIosHelp) && <aside className="install-card" aria-label="Installer l’application">
      <div><strong>Installer l’application</strong><span>{prompt ? "Accédez plus vite à votre collection depuis l’écran d’accueil." : "Sur iPhone ou iPad : Partager, puis Ajouter à l’écran d’accueil."}</span></div>
      {prompt && <button type="button" onClick={async () => { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === "accepted") setDismissed(true); setPrompt(null); }}>Installer</button>}
      <button type="button" className="install-dismiss" onClick={dismiss}>Plus tard</button>
    </aside>}
  </>;
}
