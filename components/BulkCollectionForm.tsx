"use client";

import { useActionState, useState } from "react";
import { bulkUpdateCollectionItems, type CollectionActionState } from "../app/actions/collector";

const initialState: CollectionActionState = { ok: false, message: "" };

export function BulkCollectionForm() {
  const [field, setField] = useState("hasBox");
  const [state, action, pending] = useActionState(bulkUpdateCollectionItems, initialState);
  return <form id="bulk-collection-form" action={action} className="bulk-editor" onSubmit={(event) => {
    const count = new FormData(event.currentTarget).getAll("itemIds").length;
    if (!count || (count > 1 && !window.confirm(`${count} objets vont être modifiés. Continuer ?`))) event.preventDefault();
  }}>
    <strong>Modifier la sélection</strong>
    <label>Champ<select name="field" value={field} onChange={(event) => setField(event.target.value)}><option value="hasBox">Boîte</option><option value="hasInstructions">Notice</option><option value="isComplete">Complet</option><option value="condition">État</option></select></label>
    {field === "condition" ? <label>Valeur<select name="condition" defaultValue="GOOD"><option value="SEALED">Sous blister</option><option value="NEW">Neuf</option><option value="EXCELLENT">Excellent</option><option value="GOOD">Bon</option><option value="FAIR">Correct</option><option value="POOR">Usé</option><option value="UNKNOWN">Inconnu</option></select></label> : <label>Valeur<select name="booleanValue" defaultValue="yes"><option value="yes">Oui</option><option value="no">Non</option><option value="unknown">Non renseigné</option></select></label>}
    <button type="submit" disabled={pending}>{pending ? "Modification…" : "Appliquer"}</button>
    {state.message && <span className={`form-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</span>}
  </form>;
}
