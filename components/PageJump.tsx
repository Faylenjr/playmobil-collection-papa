import type { SearchParamRecord } from "../lib/navigation-context";

export function PageJump({ action, currentPage, pages, params }: { action: string; currentPage: number; pages: number; params: SearchParamRecord }) {
  if (pages <= 1) return null;
  return (
    <form className="page-jump" action={action} method="get">
      {Object.entries(params).flatMap(([key, rawValue]) => {
        if (key === "page" || rawValue === undefined) return [];
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        return values.filter(Boolean).map((value, index) => <input key={`${key}-${index}`} type="hidden" name={key} value={value} />);
      })}
      <label htmlFor={`page-jump-${action.replaceAll("/", "-")}`}>Page {currentPage} sur {pages} · Aller à la page</label>
      <input id={`page-jump-${action.replaceAll("/", "-")}`} name="page" type="number" inputMode="numeric" min={1} max={pages} step={1} defaultValue={currentPage} required />
      <button type="submit">Aller</button>
    </form>
  );
}
