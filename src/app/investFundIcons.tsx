import React from "react";
import { Zap, Sprout, Store, Building2 } from "lucide-react";
import { type FundIcon, type InvestmentFund } from "./investData";

const FUND_ICON: Record<FundIcon, React.ReactNode> = {
  zap: <Zap className="w-4 h-4" />,
  sprout: <Sprout className="w-4 h-4" />,
  store: <Store className="w-4 h-4" />,
  building: <Building2 className="w-4 h-4" />,
};

export const withFundIcons = (funds: InvestmentFund[]) =>
  funds.map((f) => ({ ...f, icon: FUND_ICON[f.icon] }));
