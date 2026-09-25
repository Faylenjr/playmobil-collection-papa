import Link from "next/link";
import { ProductImage } from "./ProductImage";

type ThemeCardProps = {
  theme: { slug: string; name: string; count: number; imageUrl?: string | null };
  compact?: boolean;
};

export function ThemeCard({ theme, compact = false }: ThemeCardProps) {
  return (
    <Link className={`theme-card ${compact ? "theme-card--compact" : ""}`} href={`/catalogue?theme=${encodeURIComponent(theme.slug)}`}>
      <span className="theme-card__media"><ProductImage src={theme.imageUrl ?? null} alt={`Univers ${theme.name}`} /></span>
      <span className="theme-card__shade" aria-hidden="true" />
      <span className="theme-card__content">
        <small>{theme.count.toLocaleString("fr-FR")} objet{theme.count > 1 ? "s" : ""}</small>
        <strong>{theme.name}</strong>
        {!compact && <b>Explorer ce thème <span aria-hidden="true">→</span></b>}
      </span>
    </Link>
  );
}
