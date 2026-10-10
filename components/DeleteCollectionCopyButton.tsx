"use client";

import { deleteCollectionCopy } from "../app/actions/collector";

export function DeleteCollectionCopyButton({ copyId, isLast }: { copyId: string; isLast: boolean }) {
  const action = deleteCollectionCopy.bind(null, copyId);
  return <form action={action} onSubmit={(event) => {
    const message = isLast
      ? "C’est le dernier exemplaire : la référence sera retirée de la collection. Continuer ?"
      : "Supprimer uniquement cet exemplaire physique ?";
    if (!window.confirm(message)) event.preventDefault();
  }}><button type="submit" className="danger-link">{isLast ? "Retirer cette référence" : "Supprimer cet exemplaire"}</button></form>;
}
