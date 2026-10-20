"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { resolveImageUrl } from "../lib/imageUrl";

export default function ProductImage({
  src,
  alt,
  className = "h-20",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = resolveImageUrl(src);

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-lg bg-neutral-50 ${className}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Package size={28} className="text-neutral-300" />
      )}
    </div>
  );
}