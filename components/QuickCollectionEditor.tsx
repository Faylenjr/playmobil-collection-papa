"use client";

import { useActionState } from "react";
import { addToCollectionWithDetails, type CollectionActionState, updateCollectionItemState } from "../app/actions/collector";

type Item = {
  quantity?: number;
  condition?: string;
  isComplete?: boolean | null;
  hasBox?: boolean | null;
  hasInstructions?: boolean | null;
  purchaseDate?: Date | string | null;
  purchasePrice?: unknown;
  currency?: string | null;
  notes?: string | null;
};

const initialState: CollectionActionState = { ok: false, message: "" };
const conditions = [["UNKNOWN", "Inconnu"], ["SEALED", "Sous blister"], ["NEW", "Neuf"], ["EXCELLENT", "Excellent"], ["GOOD", "Bon"], ["FAIR", "Correct"], ["POOR", "Usé"]] as const;

function TriState({ name, label, value }: { name: string; label: string; value?: boolean | null | undefined }) {
  return <label>{label}<select name={name} defaultValue={value === true ? "yes" : value === false ? "no" : "unknown"}><option value="unknown">Non renseigné</option><option value="yes">Oui</option><option value="no">Non</option></select></label>;
}

export function QuickCollectionEditor({ variantId, item, addMode = false, open = false }: { variantId: string; item?: Item; addMode?: boolean; open?: boolean }) {
  const action = addMode ? addToCollectionWithDetails.bind(null, variantId) : updateCollectionItemState.bind(null, variantId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const date = item?.purchaseDate ? new Date(item.purchaseDate).toISOString().slice(0, 10) : "";
  const price = item?.purchasePrice === null || item?.purchasePrice === undefined ? "" : String(item.purchasePrice);
  return <details className="quick-editor" open={open}>
    <summary>{addMode ? "Ajouter avec des détails (facultatif)" : "Modifier rapidement"}</summary>
    <form action={formAction} className="quick-editor-form">
      <label>Quantité<input name="quantity" inputMode="numeric" type="number" min="1" max="999" defaultValue={item?.quantity ?? 1} /></label>
      <label>État<select name="condition" defaultValue={item?.condition ?? "UNKNOWN"}>{conditions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <TriState name="isComplete" label="Complet" value={item?.isComplete} />
      <TriState name="hasBox" label="Boîte" value={item?.hasBox} />
      <TriState name="hasInstructions" label="Notice" value={item?.hasInstructions} />
      <label>Date d’achat<input name="purchaseDate" type="date" defaultValue={date} /></label>
      <label>Prix d’achat<input name="purchasePrice" inputMode="decimal" type="number" min="0" step="0.01" defaultValue={price} /></label>
      <label>Devise<select name="currency" defaultValue={item?.currency ?? "EUR"}><option value="EUR">EUR</option><option value="CHF">CHF</option><option value="GBP">GBP</option><option value="USD">USD</option></select></label>
      <label className="wide-field">Notes<textarea name="notes" rows={2} defaultValue={item?.notes ?? ""} maxLength={2000} /></label>
      <button type="submit" disabled={pending}>{pending ? "Enregistrement…" : addMode ? "Ajouter à ma collection" : "Enregistrer"}</button>
      {state.message && <p className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</p>}
    </form>
  </details>;
}
