/**
 * Anchor latest settlement hash on-chain (PayHubLedgerAnchor).
 *   node contracts/scripts/anchor-payhub-onchain.cjs
 *   node contracts/scripts/anchor-payhub-onchain.cjs --hash 0x... --count 5 --gat-micro 421985000
 */
const hre = require("hardhat");
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");

function loadEnv() {
  const env = {};
  for (const p of [
    resolve(__dirname, "../../.env.local"),
    resolve(__dirname, "../../admin/.env.local"),
  ]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return env;
}

async function fetchLatestFromApi(env) {
  const api = (env.VITE_PAY_HUB_API_URL || "https://app.garudaprime.id/api").replace(/\/$/, "");
  const secret = env.ADMIN_PAY_OPS_SECRET || env.SETTLEMENT_ANCHOR_SECRET;
  if (!secret) throw new Error("ADMIN_PAY_OPS_SECRET required for API fetch");
  const res = await fetch(`${api}/pay/settlement/audit`, {
    headers: { "x-admin-pay-ops-secret": secret },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  const report = json.report;
  const hash = report.snapshotHash;
  const count = report.snapshot?.ledgerCount ?? 0;
  const gat = report.snapshot?.totalLedgerGat ?? 0;
  const gatMicro = Math.round(gat * 1e6);
  return { hash, count, gatMicro };
}

async function main() {
  const env = loadEnv();
  const anchorAddr =
    env.PAY_HUB_LEDGER_ANCHOR_ADDRESS
    || env.VITE_PAY_HUB_LEDGER_ANCHOR_ADDRESS;
  if (!anchorAddr?.startsWith("0x")) {
    console.error("Set PAY_HUB_LEDGER_ANCHOR_ADDRESS, run: cd contracts && npm run deploy:ledger-anchor");
    process.exit(1);
  }

  let hash;
  let ledgerCount;
  let gatMicro;

  const hashArg = process.argv.find((a) => a.startsWith("0x") && a.length === 66);
  if (hashArg) {
    hash = hashArg;
    const ci = process.argv.indexOf("--count");
    const gi = process.argv.indexOf("--gat-micro");
    ledgerCount = ci >= 0 ? Number(process.argv[ci + 1]) : 0;
    gatMicro = gi >= 0 ? Number(process.argv[gi + 1]) : 0;
  } else {
    const latest = await fetchLatestFromApi(env);
    hash = latest.hash;
    ledgerCount = latest.count;
    gatMicro = latest.gatMicro;
  }

  const bytes32 = hash.startsWith("0x") ? hash : `0x${hash}`;
  const [signer] = await hre.ethers.getSigners();
  const anchor = await hre.ethers.getContractAt("PayHubLedgerAnchor", anchorAddr, signer);

  console.log("Anchor contract:", anchorAddr);
  console.log("Hash:", bytes32);
  console.log("Accounts:", ledgerCount, "· GAT micro:", gatMicro);

  const tx = await anchor.anchorPayHubLedger(bytes32, ledgerCount, gatMicro);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✓ On-chain anchor confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
