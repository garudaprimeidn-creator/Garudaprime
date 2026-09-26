export const STAKING_POOL_ABI = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "lockDays", type: "uint256" },
    ],
    outputs: [{ name: "stakeId", type: "uint256" }],
  },
  {
    type: "function",
    name: "unstake",
    stateMutability: "nonpayable",
    inputs: [{ name: "stakeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "stakes",
    stateMutability: "view",
    inputs: [{ name: "stakeId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "lockUntil", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "Staked",
    inputs: [
      { indexed: true, name: "stakeId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "lockUntil", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
  },
] as const;

export const INVESTMENT_VAULT_ABI = [
  {
    type: "function",
    name: "invest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fundId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "positionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fundAprBps",
    stateMutability: "view",
    inputs: [{ name: "fundId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "principal", type: "uint256" },
      { name: "startedAt", type: "uint256" },
      { name: "fundId", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "Invested",
    inputs: [
      { indexed: true, name: "positionId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "fundId", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
  },
] as const;
