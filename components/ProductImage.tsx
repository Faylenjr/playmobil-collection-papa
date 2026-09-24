"use client";

import { useState } from "react";

type ProductImageProps = {
  src?: string | null;
  alt: string;
  priority?: boolean;
  className?: string;
};

export function ProductImage({ src, alt, priority = false, className }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`image-fallback ${className ?? ""}`} role="img" aria-label={`${alt} — image indisponible`}>
        <span aria-hidden="true">◆</span>
        <small>Image indisponible</small>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
}
