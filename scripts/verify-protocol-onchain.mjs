#!/usr/bin/env node
/**
 * Read-only check: vault APR, pool balances, headroom.
 * Usage: node scripts/verify-protocol-onchain.mjs
 */
import { createPublicClient, formatUnits, http } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env.local");

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    const val = m[2].replace(/^["']|["']$/g, "");
    process.env[m[1]] = val;
  }
}

loadEnv();

const rpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const chainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;
const token = process.env.VITE_GAT_TOKEN_ADDRESS?.trim();
const vault = process.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS?.trim();
const pool = process.env.VITE_GAT_STAKING_POOL_ADDRESS?.trim();
const decimals = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);

const GAT_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
const VAULT_ABI = [
  { type: "function", name: "totalPrincipal", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "fundAprBps", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
];
const POOL_ABI = [
  { type: "function", name: "totalStaked", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const client = createPublicClient({
  chain: { id: chainId, name: "Sidra", nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } },
  transport: http(rpc),
});

const fmt = (v) => Number(formatUnits(v, decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function main() {
  console.log("Garuda Protocol, on-chain verification\n");
  console.log("RPC:", rpc);
  console.log("GAT:", token ?? ", ");
  console.log("Vault:", vault ?? ", ");
  console.log("Pool:", pool ?? ", \n");

  if (!token || !vault || !pool) {
    console.error("❌ Missing contract addresses in .env.local");
    process.exit(1);
  }

  let ok = true;

  console.log("── Fund APR ──");
  for (const fundId of [1, 2, 3, 4]) {
    const bps = await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "fundAprBps", args: [BigInt(fundId)] });
    const n = Number(bps);
    const status = n > 0 ? "✓" : "✗";
    if (n <= 0) ok = false;
    console.log(`  ${status} Fund ${fundId}: ${n} bps (${(n / 100).toFixed(2)}%)`);
  }

  const vaultBal = await client.readContract({ address: token, abi: GAT_ABI, functionName: "balanceOf", args: [vault] });
  const principal = await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "totalPrincipal" });
  const poolBal = await client.readContract({ address: token, abi: GAT_ABI, functionName: "balanceOf", args: [pool] });
  const staked = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "totalStaked" });

  const vaultHeadroom = Number(formatUnits(vaultBal - principal, decimals));
  const poolHeadroom = Number(formatUnits(poolBal - staked, decimals));

  console.log("\n── Pool balances ──");
  console.log(`  Vault:   ${fmt(vaultBal)} GAT (principal ${fmt(principal)}, headroom ${vaultHeadroom.toFixed(2)})`);
  console.log(`  Staking: ${fmt(poolBal)} GAT (staked ${fmt(staked)}, headroom ${poolHeadroom.toFixed(2)})`);

  if (vaultHeadroom < 100) {
    console.log("\n⚠ Vault headroom rendah, jalankan: cd contracts && npm run setup:protocol");
    ok = false;
  }
  if (poolHeadroom < 50) {
    console.log("⚠ Staking headroom rendah, jalankan: cd contracts && npm run setup:protocol");
    ok = false;
  }

  console.log(ok ? "\n✓ Protocol siap untuk invest/stake on-chain" : "\n❌ Perlu setup protocol sebelum production");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
