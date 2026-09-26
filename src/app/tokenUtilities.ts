/** GAT utility definitions, Garuda Asset Token use cases */

export type GatUtilityId =
  | "ecosystem_payment"
  | "halal_transaction"
  | "staking"
  | "investment_participation"
  | "community_reward"
  | "merchant_payment"
  | "premium_membership"
  | "ai_service_access"
  | "marketplace_payment";

export type GatUtilityStatus = "active" | "future";

export type GatUtilityAction =
  | "screen:invest"
  | "screen:market"
  | "screen:community"
  | "scan:pay"
  | "overlay:ai"
  | "profile:subscription"
  | "staking:demo"
  | "halal:info"
  | "ecosystem:info"
  | "none";

export type GatUtilityDef = {
  id: GatUtilityId;
  status: GatUtilityStatus;
  action: GatUtilityAction;
};

export const GAT_UTILITIES: GatUtilityDef[] = [
  { id: "ecosystem_payment", status: "active", action: "ecosystem:info" },
  { id: "halal_transaction", status: "active", action: "halal:info" },
  { id: "staking", status: "active", action: "staking:demo" },
  { id: "investment_participation", status: "active", action: "screen:invest" },
  { id: "community_reward", status: "active", action: "screen:community" },
  { id: "merchant_payment", status: "active", action: "scan:pay" },
  { id: "premium_membership", status: "active", action: "profile:subscription" },
  { id: "ai_service_access", status: "active", action: "overlay:ai" },
  { id: "marketplace_payment", status: "active", action: "screen:market" },
];

export const getGatUtilities = (): GatUtilityDef[] => GAT_UTILITIES;
