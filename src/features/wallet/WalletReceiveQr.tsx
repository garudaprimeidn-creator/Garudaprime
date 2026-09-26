import React, { useEffect } from "react";
import { encodeReceiveQrPayload } from "../../lib/qr/parseQrPayload";
import { warmQrImageCache } from "../../lib/qr/qrImageCache";
import { QrPayloadImage } from "./QrPayloadImage";

type Props = {
  walletAddress: string;
  size?: number;
  className?: string;
};

export const WalletReceiveQr = ({ walletAddress, size = 176, className = "" }: Props) => {
  const payload = walletAddress ? encodeReceiveQrPayload(walletAddress) : "";

  useEffect(() => {
    if (payload) warmQrImageCache(payload, size);
  }, [payload, size]);

  return (
    <div
      className={`gp-wallet-qr-frame rounded-2xl p-2.5 bg-white ring-1 ring-cyan-500/15 ${className}`}
      style={{ width: size + 20, height: size + 20 }}
    >
      <QrPayloadImage payload={payload} size={size} alt="Wallet receive QR" className="w-full h-full" />
    </div>
  );
};
