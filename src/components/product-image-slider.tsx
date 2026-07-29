import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryIllustration } from "@/components/category-illustration";

// A compact, always-visible (not hover-gated — this is a mobile-first storefront with no hover
// state) prev/next + dot slider for a product card's small thumbnail area. The prebuilt shadcn/
// embla Carousel positions its controls OUTSIDE the container (negative offsets), which doesn't
// fit a thumbnail-sized card — this is a plain index-state slider instead, appropriately light
// for cycling 2-4 images.
export function ProductImageSlider({
  images, name, categoryName, className,
}: { images: string[]; name: string; categoryName?: string; className?: string }) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) return <CategoryIllustration categoryName={categoryName} className={className} />;
  const safeIndex = Math.min(index, images.length - 1);

  return (
    <div className={`relative ${className ?? ""}`}>
      <img src={images[safeIndex]} alt={name} className="h-full w-full object-cover" />
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={e => { e.stopPropagation(); setIndex(i => (i - 1 + images.length) % images.length); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-background/80 backdrop-blur flex items-center justify-center shadow-sm"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={e => { e.stopPropagation(); setIndex(i => (i + 1) % images.length); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-background/80 backdrop-blur flex items-center justify-center shadow-sm"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {images.map((_, i) => (
              <span key={i} className={`h-1 w-1 rounded-full ${i === safeIndex ? "bg-primary" : "bg-background/70"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
