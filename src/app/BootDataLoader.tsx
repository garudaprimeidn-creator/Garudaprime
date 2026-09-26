import { useEffect } from "react";
import { loadFeeConfigFromApi } from "../lib/protocol/feeConfig";
import { loadTokenPricesFromApi } from "../app/tokenEconomy";

/** Non-blocking app data, runs after main shell is interactive. */
export const BootDataLoader = () => {
  useEffect(() => {
    const run = () => {
      void loadFeeConfigFromApi();
      void loadTokenPricesFromApi();
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 80);
    return () => window.clearTimeout(t);
  }, []);
  return null;
};
