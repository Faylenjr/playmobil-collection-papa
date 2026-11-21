"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { personalPhotoUrl } from "../lib/personal-photo";

function photoForUpload(image: HTMLImageElement) {
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de préparer la photo.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Impossible de préparer la photo.")), "image/jpeg", 0.9);
  });
}

export function PersonalPhotoControls({ variantId, revision }: { variantId: string; revision: string | null }) {
  const [preview, setPreview] = useState<string>();
  const [ready, setReady] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, refresh] = useTransition();
  const [message, setMessage] = useState("");
  const image = useRef<HTMLImageElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const busy = uploading || refreshing;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setReady(false);
    setMessage("");
    setRemoving(false);
    if (file.size > 25 * 1024 * 1024) {
      setPreview(undefined);
      setMessage("Choisis une photo de moins de 25 Mo.");
      return;
    }
    if (file.type && !/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type)) {
      setPreview(undefined);
      setMessage("Choisis une photo JPEG, PNG, WebP, AVIF ou HEIC.");
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  function clearPreview() {
    setPreview(undefined);
    setReady(false);
  }

  async function update(remove: boolean) {
    if (busy || (remove ? !revision : !ready || !image.current?.naturalWidth)) return;
    setUploading(true);
    setMessage("");
    try {
      const body = remove ? null : await photoForUpload(image.current!);
      const headers: Record<string, string> = revision ? { "If-Match": `"${revision}"` } : { "If-None-Match": "*" };
      if (body) headers["Content-Type"] = "image/jpeg";
      const response = await fetch(personalPhotoUrl(variantId), {
        method: remove ? "DELETE" : "PUT", headers, body, credentials: "same-origin", redirect: "error",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 412) refresh(() => router.refresh());
        throw new Error(result?.error ?? "La modification a échoué.");
      }
      clearPreview();
      setRemoving(false);
      setMessage(remove ? "La photo personnelle a été retirée." : "Ta photo a été enregistrée.");
      refresh(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof TypeError
        ? "La connexion ou la session a expiré. Vérifie ta connexion et réessaie."
        : error instanceof Error ? error.message : "La modification a échoué.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <details className="personal-photo-controls">
      <summary>{revision ? "Gérer ma photo" : "Ajouter ma photo"}</summary>
      <div className="personal-photo-actions">
        <input type="file" accept="image/*" capture="environment" ref={camera} hidden onChange={(event) => choose(event.currentTarget)} />
        <input type="file" accept="image/*" ref={library} hidden onChange={(event) => choose(event.currentTarget)} />
        <button className="button secondary" type="button" disabled={busy} onClick={() => camera.current?.click()}>Prendre une photo</button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => library.current?.click()}>Choisir une photo</button>
        {revision && !removing && !preview && <button className="button secondary" type="button" disabled={busy} onClick={() => setRemoving(true)}>Retirer</button>}
      </div>
      {preview && <div className="personal-photo-preview">
        <img ref={image} src={preview} alt="Aperçu de ma photo" onLoad={() => setReady(true)} onError={() => {
          clearPreview();
          setMessage("Cet appareil ne peut pas ouvrir cette image. Essaie une photo JPEG.");
        }} />
        {revision && <p>Cette photo remplacera ta photo actuelle.</p>}
        <div className="personal-photo-actions">
          <button className="button" type="button" disabled={busy || !ready} onClick={() => void update(false)}>{revision ? "Confirmer le remplacement" : "Enregistrer ma photo"}</button>
          <button className="button secondary" type="button" disabled={busy} onClick={clearPreview}>Annuler</button>
        </div>
      </div>}
      {removing && <div className="personal-photo-preview">
        <p>Retirer ta photo de cette variante ?</p>
        <div className="personal-photo-actions">
          <button className="button" type="button" disabled={busy} onClick={() => void update(true)}>Confirmer le retrait</button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setRemoving(false)}>Annuler</button>
        </div>
      </div>}
      <p role="status" className="photo-status">{uploading ? "Enregistrement en cours…" : message}</p>
    </details>
  );
}
