import { Loader2, Upload, X } from "lucide-react";
import { PRODUCT_IMAGE_ACCEPT, processProductImage } from "../lib/merchant/productImage";
import { MAX_PRODUCT_IMAGES } from "../lib/merchant/productImages";
import { ProductThumbGallery } from "./ProductThumbGallery";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
  onError: () => void;
  labels: {
    productImage: string;
    imageHint: string;
    pickImage: string;
    addImage: string;
    imageFormat: string;
    removeImage: string;
    imagesMaxReached: string;
  };
  productName?: string;
};

export const ProductImagesUpload = ({
  images,
  onChange,
  loading,
  onLoadingChange,
  onError,
  labels,
  productName = "",
}: Props) => {
  const canAdd = images.length < MAX_PRODUCT_IMAGES;

  const handlePick = async (file: File | null) => {
    if (!file || !canAdd) return;
    onLoadingChange(true);
    try {
      const processed = await processProductImage(file);
      onChange([...images, processed].slice(0, MAX_PRODUCT_IMAGES));
    } catch {
      onError();
    } finally {
      onLoadingChange(false);
    }
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div>
      <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{labels.productImage}</span>
      <p className="gp-muted text-[10px] mt-0.5 mb-2">{labels.imageHint}</p>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((url, index) => (
            <div key={`${index}-${url.slice(0, 24)}`} className="relative">
              <ProductThumbGallery
                product={{ name: productName || labels.productImage, emoji: "📦", imageUrl: url, imageUrls: [url] }}
                size="mini"
                className="!mb-0"
                max={1}
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                aria-label={labels.removeImage}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAdd ? (
        <label className={`block cursor-pointer ${loading ? "pointer-events-none opacity-60" : ""}`}>
          <input
            type="file"
            accept={PRODUCT_IMAGE_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void handlePick(file);
              e.target.value = "";
            }}
          />
          <div className="gp-product-upload-zone flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/[0.04]">
            {loading ? (
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-amber-400" />
            )}
            <span className="gp-text text-xs font-semibold">
              {images.length === 0 ? labels.pickImage : labels.addImage}
            </span>
            <span className="gp-muted text-[10px]">{labels.imageFormat}</span>
          </div>
        </label>
      ) : (
        <p className="gp-muted text-[10px] text-center py-2">{labels.imagesMaxReached}</p>
      )}
    </div>
  );
};
