/**
 * Read-only audit: GAT balances on protocol SCs (no private key required).
 *   npm run audit:sc-gat
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });
const { ethers } = require("ethers");

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function totalPrincipal() view returns (uint256)",
];

async function main() {
  const rpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
  const gat = process.env.VITE_GAT_TOKEN_ADDRESS;
  const treasury = process.env.VITE_GAT_TREASURY_ADDRESS;
  const feeRouter = process.env.VITE_GAT_FEE_ROUTER_ADDRESS;
  const staking = process.env.VITE_GAT_STAKING_POOL_ADDRESS;
  const vault = process.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS;
  const backing =
    process.env.VITE_PAY_HUB_BACKING_ADDRESS || process.env.PROTOCOL_OWNER_ADDRESS;
  const ledgerAnchor =
    process.env.VITE_PAY_HUB_LEDGER_ANCHOR_ADDRESS
    || process.env.PAY_HUB_LEDGER_ANCHOR_ADDRESS;

  if (!gat?.startsWith("0x")) throw new Error("Set VITE_GAT_TOKEN_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpc, Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453);
  const token = new ethers.Contract(gat, ERC20, provider);

  async function balOf(addr, label) {
    if (!addr?.startsWith("0x")) return;
    const b = await token.balanceOf(addr);
    console.log(`${label}: ${ethers.formatUnits(b, 18)} GAT (${addr})`);
    return b;
  }

  console.log("RPC:", rpc);
  console.log("GAT token:", gat);
  console.log("");

  await balOf(backing, "Pay Hub backing (EOA)");
  await balOf(treasury, "SC Treasury");
  await balOf(feeRouter, "FeeRouter");
  await balOf(staking, "StakingPool");
  await balOf(vault, "InvestmentVault");

  if (staking?.startsWith("0x")) {
    try {
      const pool = new ethers.Contract(staking, ERC20, provider);
      const staked = await pool.totalStaked();
      console.log(`  └ reserved (totalStaked): ${ethers.formatUnits(staked, 18)} GAT`);
    } catch {
      console.log("  └ totalStaked: (kontrak lama / tidak ada)");
    }
  }
  if (vault?.startsWith("0x")) {
    try {
      const v = new ethers.Contract(vault, ERC20, provider);
      const p = await v.totalPrincipal();
      console.log(`  └ reserved (totalPrincipal): ${ethers.formatUnits(p, 18)} GAT`);
    } catch {
      console.log("  └ totalPrincipal: (kontrak lama / tidak ada)");
    }
  }

  const checkRecover = async (addr, label) => {
    if (!addr?.startsWith("0x")) return;
    const code = (await provider.getCode(addr)).toLowerCase();
    const sel = ethers.FunctionFragment.from("recoverAllGatWhenIdle(address)").selector.slice(2).toLowerCase();
    const ok = code.includes(sel);
    console.log(`${label} recoverAllGatWhenIdle: ${ok ? "tersedia" : "TIDAK ADA (kontrak lama, GAT tidak bisa dipindah)"}`);
  };
  await checkRecover(staking, "StakingPool");
  await checkRecover(vault, "InvestmentVault");

  if (ledgerAnchor?.startsWith("0x")) {
    try {
      const anchor = new ethers.Contract(
        ledgerAnchor,
        [
          "function latest() view returns (bytes32 snapshotHash, uint256 ledgerCount, uint256 totalLedgerGatMicro, uint40 anchoredAt)",
          "function anchorCount() view returns (uint256)",
        ],
        provider,
      );
      const latest = await anchor.latest();
      const n = await anchor.anchorCount();
      console.log(`\nPayHubLedgerAnchor (${ledgerAnchor}):`);
      console.log(`  anchors: ${n}`);
      console.log(`  latest hash: ${latest.snapshotHash}`);
      console.log(`  ledger: ${latest.ledgerCount} accounts · ${Number(latest.totalLedgerGatMicro) / 1e6} GAT`);
    } catch (e) {
      console.log("\nPayHubLedgerAnchor: read failed", e.message);
    }
  }

  console.log("\nPerintah:");
  console.log("  npm run audit:sc-gat         , audit ini");
  console.log("  npm run recover:stranded:dry , simulasi recover ke SC treasury");
  console.log("  npm run recover:stranded     , eksekusi (hanya jika recover tersedia di bytecode)");
  console.log("  npm run redeploy:pools-recovery, deploy pool/vault baru (butuh gas native owner)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
