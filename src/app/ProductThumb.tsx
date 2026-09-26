import { useEffect, useState } from "react";
import type { MarketProduct } from "./marketData";
import { PRODUCT_GRADIENTS } from "./marketData";
import { getProductImages } from "../lib/merchant/productImages";

export const ProductThumb = ({
  product,
  gradientIndex = 0,
  size = "card",
  className = "",
}: {
  product: Pick<MarketProduct, "name" | "emoji" | "imageUrl" | "imageUrls">;
  gradientIndex?: number;
  size?: "card" | "detail" | "mini";
  className?: string;
}) => {
  const sizeClass = size === "detail" ? "gp-product-thumb--detail" : size === "mini" ? "gp-product-thumb--mini" : "";
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getProductImages(product)[0];

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageFailed) {
    return (
      <div className={`gp-product-thumb-wrap ${sizeClass} ${className}`}>
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          className="gp-product-thumb-img"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`gp-product-thumb-wrap gp-product-thumb-fallback ${sizeClass} ${className}`}
      style={{ background: `linear-gradient(135deg, ${PRODUCT_GRADIENTS[gradientIndex % PRODUCT_GRADIENTS.length]}, transparent)` }}
    >
      <span className="gp-product-thumb-emoji" aria-hidden>{product.emoji}</span>
    </div>
  );
};
