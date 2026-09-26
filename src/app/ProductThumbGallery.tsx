import { useEffect, useState } from "react";
import type { MarketProduct } from "./marketData";
import { PRODUCT_GRADIENTS } from "./marketData";
import { getProductImages } from "../lib/merchant/productImages";
import { ProductThumb } from "./ProductThumb";

export const ProductThumbGallery = ({
  product,
  gradientIndex = 0,
  size = "card",
  className = "",
  max = 3,
}: {
  product: Pick<MarketProduct, "name" | "emoji" | "imageUrl" | "imageUrls">;
  gradientIndex?: number;
  size?: "card" | "detail" | "mini";
  className?: string;
  max?: number;
}) => {
  const images = getProductImages(product).slice(0, max);

  if (images.length <= 1) {
    return (
      <ProductThumb
        product={{ ...product, imageUrl: images[0] }}
        gradientIndex={gradientIndex}
        size={size}
        className={className}
      />
    );
  }

  const sizeClass =
    size === "detail" ? "gp-product-thumb-gallery--detail"
      : size === "mini" ? "gp-product-thumb-gallery--mini"
        : "";

  return (
    <div className={`gp-product-thumb-gallery ${sizeClass} ${className}`}>
      {images.map((url, i) => (
        <GalleryCell
          key={`${url.slice(0, 48)}-${i}`}
          url={url}
          name={product.name}
          emoji={product.emoji}
          gradientIndex={gradientIndex + i}
        />
      ))}
    </div>
  );
};

const GalleryCell = ({
  url,
  name,
  emoji,
  gradientIndex,
}: {
  url: string;
  name: string;
  emoji: string;
  gradientIndex: number;
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (failed) {
    return (
      <div
        className="gp-product-thumb-gallery__cell gp-product-thumb-fallback"
        style={{
          background: `linear-gradient(135deg, ${PRODUCT_GRADIENTS[gradientIndex % PRODUCT_GRADIENTS.length]}, transparent)`,
        }}
      >
        <span className="gp-product-thumb-emoji" aria-hidden>{emoji}</span>
      </div>
    );
  }

  return (
    <div className="gp-product-thumb-gallery__cell">
      <img
        src={url}
        alt=""
        className="gp-product-thumb-img"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
};
