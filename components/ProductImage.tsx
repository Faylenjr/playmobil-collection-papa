"use client";

import { useEffect, useRef, useState } from "react";

type ProductImageProps = {
  src?: string | null;
  candidates?: readonly string[];
  alt: string;
  priority?: boolean;
  className?: string;
};

export function ProductImage({ src, candidates, ...props }: ProductImageProps) {
  const urls = [...new Set((candidates ?? (src ? [src] : [])).filter(Boolean))];
  return <ImageAttempt key={JSON.stringify(urls)} urls={urls} {...props} />;
}

function ImageAttempt({ urls, alt, priority = false, className }: Omit<ProductImageProps, "src" | "candidates"> & { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const src = urls[index];
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      setIndex((current) => current === index ? current + 1 : current);
    }
  }, [index, src]);

  if (!src) {
    return (
      <div className={`image-fallback ${className ?? ""}`} role="img" aria-label={`${alt} — image indisponible`}>
        <span aria-hidden="true">◆</span>
        <small>Image indisponible</small>
      </div>
    );
  }

  return (
    <img
      key={src}
      ref={imageRef}
      className={className}
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setIndex((current) => current === index ? current + 1 : current)}
    />
  );
}
