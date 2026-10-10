"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateInventoryItemState, type InventoryActionState } from "../app/actions/collector";
import { clampInventoryIndex, updateUnknownCounters, type InventoryPhysicalState } from "../lib/collection-inventory";
import { ProductImage } from "./ProductImage";

export type InventoryItem = InventoryPhysicalState & {
  id: string;
  variantId: string;
  copyIndex: number;
  copyTotal: number;
  notes: string | null;
  name: string;
  reference: string;
  year: number | null;
  theme: string | null;
  imageUrl: string | null;
  variantDescription: string | null;
  needsVariantReview: boolean;
};

type Counters = { condition: number; complete: number; box: number; instructions: number };

function TriButtons({ name, value, onDirty }: { name: string; value: boolean | null; onDirty: () => void }) {
  const initial = value === true ? "yes" : value === false ? "no" : "unknown";
  return <div className="inventory-choice-row">
    {[{ value: "yes", label: "✓ Oui" }, { value: "no", label: "✕ Non" }, { value: "unknown", label: "? Inconnu" }].map((choice) => <label key={choice.value}><input type="radio" name={name} value={choice.value} defaultChecked={initial === choice.value} onChange={onDirty} /><span>{choice.label}</span></label>)}
  </div>;
}

function InventoryEditor({ item, onSaved, onDirty }: { item: InventoryItem; onSaved: (saved: NonNullable<InventoryActionState["saved"]>) => void; onDirty: () => void }) {
  const action = updateInventoryItemState.bind(null, item.id);
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "", revision: 0 } satisfies InventoryActionState);
  const handledRevision = useRef(0);
  useEffect(() => {
    if (state.ok && state.saved && state.revision > handledRevision.current) {
      handledRevision.current = state.revision;
      onSaved(state.saved);
    }
  }, [state, onSaved]);
  return <form action={formAction} className="inventory-form" onChange={onDirty}>
    <fieldset><legend>État</legend><div className="inventory-choice-row inventory-condition-row">
      {[{ value: "SEALED", label: "Sous blister" }, { value: "NEW", label: "Neuf" }, { value: "EXCELLENT", label: "Excellent" }, { value: "GOOD", label: "Très bon" }, { value: "FAIR", label: "Bon" }, { value: "POOR", label: "Usé" }, { value: "UNKNOWN", label: "? Inconnu" }].map((choice) => <label key={choice.value}><input type="radio" name="condition" value={choice.value} defaultChecked={item.condition === choice.value} /><span>{choice.label}</span></label>)}
    </div></fieldset>
    <fieldset><legend>Complet</legend><TriButtons name="isComplete" value={item.isComplete} onDirty={onDirty} /></fieldset>
    <fieldset><legend>Boîte</legend><TriButtons name="hasBox" value={item.hasBox} onDirty={onDirty} /></fieldset>
    <fieldset><legend>Notice</legend><TriButtons name="hasInstructions" value={item.hasInstructions} onDirty={onDirty} /></fieldset>
    <label className="inventory-notes">Notes facultatives<textarea name="notes" rows={3} defaultValue={item.notes ?? ""} placeholder="Détail utile sur cet exemplaire…" /></label>
    {state.message && <p className={`action-message ${state.ok ? "success" : "error"}`} role="status">{state.message}</p>}
    <button className="button inventory-save" disabled={pending} type="submit">{pending ? "Enregistrement…" : "Enregistrer et suivant →"}</button>
  </form>;
}

export function InventorySession({ initialItems, storageKey, initialCounters }: { initialItems: InventoryItem[]; storageKey: string; initialCounters: Counters }) {
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [restored, setRestored] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [counters, setCounters] = useState(initialCounters);
  useEffect(() => {
    const stored = Number.parseInt(window.localStorage.getItem(storageKey) ?? "0", 10);
    const next = clampInventoryIndex(stored, items.length);
    setIndex(next); setRestored(next > 0);
  }, [storageKey, items.length]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const go = useCallback((next: number) => {
    const safe = clampInventoryIndex(next, items.length);
    setIndex(safe); setDirty(false); setRestored(false);
    window.localStorage.setItem(storageKey, String(safe));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [items.length, storageKey]);
  const current = items[index];
  const onSaved = useCallback((saved: NonNullable<InventoryActionState["saved"]>) => {
    if (!current) return;
    const before = current;
    const after = { ...current, ...saved };
    setItems((all) => all.map((item, itemIndex) => itemIndex === index ? after : item));
    setCounters((value) => updateUnknownCounters(value, before, after));
    go(Math.min(index + 1, items.length - 1));
  }, [current, go, index, items.length]);
  const progress = useMemo(() => items.length ? Math.round(((index + 1) / items.length) * 100) : 0, [index, items.length]);
  if (!current) return <section className="empty-state collector-empty"><h2>Aucun objet dans cette sélection</h2><p>Choisissez un autre filtre d’inventaire.</p><Link className="button" href="/collection/inventaire">Changer de sélection</Link></section>;
  return <div className="inventory-session">
    <section className="inventory-quality-strip" aria-label="Informations restantes"><strong>Informations restantes</strong><span>État : {counters.condition}</span><span>Complet : {counters.complete}</span><span>Boîte : {counters.box}</span><span>Notice : {counters.instructions}</span></section>
    {restored && <p className="inventory-resume" role="status">Session reprise à l’objet {index + 1}. <button type="button" onClick={() => go(0)}>Recommencer</button></p>}
    <div className="inventory-progress"><div><strong>{index + 1} / {items.length}</strong><span>exemplaires parcourus</span></div><progress max={100} value={progress}>{progress} %</progress></div>
    <article className="inventory-card">
      <div className="inventory-identification"><div className="inventory-image"><ProductImage src={current.imageUrl} alt={current.name} priority /></div><div><p className="reference">{current.reference}</p><h1>{current.name}</h1>{current.copyTotal > 1 && <p className="copy-position">Exemplaire {current.copyIndex + 1} sur {current.copyTotal}</p>}<p>{[current.year, current.theme].filter(Boolean).join(" · ") || "Métadonnées non renseignées"}</p>{current.variantDescription && <strong>{current.variantDescription}</strong>}{current.needsVariantReview && <span className="variant-review">Variante à vérifier</span>}<Link href={`/sets/${current.variantId}?returnTo=${encodeURIComponent(`/collection/inventaire`)}`}>Ouvrir la fiche complète</Link></div></div>
      <InventoryEditor key={current.id} item={current} onSaved={onSaved} onDirty={() => setDirty(true)} />
    </article>
    <nav className="inventory-navigation" aria-label="Navigation dans l’inventaire"><button type="button" disabled={index === 0} onClick={() => go(index - 1)}>← Précédent</button><button type="button" disabled={index >= items.length - 1} onClick={() => go(index + 1)}>Passer</button></nav>
    <Link className="back-link" href="/collection/inventaire">← Changer la sélection</Link>
  </div>;
}
