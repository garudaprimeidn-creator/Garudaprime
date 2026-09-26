export type FundIcon = "zap" | "sprout" | "store" | "building";
export type FundContract = "Mudharabah" | "Musyarakah" | "Ijarah Sukuk";

export type InvestmentFund = {
  id: number;
  name: string;
  type: FundContract;
  typeColor: string;
  apr: string;
  min: number;
  term: string;
  /** Persen target dana terkumpul (0-100). Slot tersisa = 100 − raised */
  raised: number;
  /** Kapasitas target dalam USD, gelombang alokasi saat ini */
  capacityUsd: number;
  myInvest: number;
  myProfit: number;
  cert: string;
  category: string;
  risk: "Low" | "Medium" | "High";
  icon: FundIcon;
  round: string;
};

/** Gelombang 2, alokasi dibuka ulang Mei 2026 */
export const INVESTMENT_FUNDS: InvestmentFund[] = [
  {
    id: 1,
    name: "Mudharabah Fund Alpha",
    type: "Mudharabah",
    typeColor: "text-emerald-400",
    apr: "12.5%",
    min: 500,
    term: "12M",
    raised: 22,
    capacityUsd: 2_500_000,
    myInvest: 0,
    myProfit: 0,
    cert: "SC-MY-2026-001",
    category: "Digital Economy",
    risk: "Low",
    icon: "zap",
    round: "Gelombang 2",
  },
  {
    id: 2,
    name: "Green Agriculture Musyarakah",
    type: "Musyarakah",
    typeColor: "text-amber-400",
    apr: "15.8%",
    min: 1000,
    term: "24M",
    raised: 28,
    capacityUsd: 1_800_000,
    myInvest: 0,
    myProfit: 0,
    cert: "SC-MY-2026-002",
    category: "Agriculture",
    risk: "Medium",
    icon: "sprout",
    round: "Gelombang 2",
  },
  {
    id: 3,
    name: "UMKM Halal Marketplace",
    type: "Mudharabah",
    typeColor: "text-emerald-400",
    apr: "10.2%",
    min: 200,
    term: "6M",
    raised: 18,
    capacityUsd: 950_000,
    myInvest: 0,
    myProfit: 0,
    cert: "SC-MY-2026-003",
    category: "UMKM",
    risk: "Low",
    icon: "store",
    round: "Gelombang 2",
  },
  {
    id: 4,
    name: "Property Sukuk Fund",
    type: "Ijarah Sukuk",
    typeColor: "text-indigo-400",
    apr: "8.5%",
    min: 5000,
    term: "36M",
    raised: 35,
    capacityUsd: 5_000_000,
    myInvest: 0,
    myProfit: 0,
    cert: "SC-MY-2026-004",
    category: "Property",
    risk: "Low",
    icon: "building",
    round: "Gelombang 2",
  },
];

export function fundSlotsLeft(fund: InvestmentFund): number {
  return Math.max(0, 100 - fund.raised);
}

export function isFundAlmostFull(fund: InvestmentFund): boolean {
  return fund.raised >= 85;
}

export function formatCapacityUsd(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${usd.toLocaleString()}`;
}
