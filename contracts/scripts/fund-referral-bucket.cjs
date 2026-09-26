/**
 * Deposit GAT into GATProtocolTreasury BUCKET_REFERRAL (index 2).
 *
 *   cd contracts && npm run compile
 *   REFERRAL_FUND_GAT=50000 npm run fund:referral-bucket
 *   REFERRAL_FUND_GAT=50000 npm run fund:referral-bucket:dry
 *
 * Requires PROTOCOL_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY (feeCollector/owner).
 * Env: VITE_GAT_TOKEN_ADDRESS, VITE_GAT_TREASURY_ADDRESS
 */
const hre = require("hardhat");

const BUCKET_REFERRAL = 2;

async function main() {
  const dryRun =
    process.argv.includes("--dry-run") ||
    process.env.FUND_REFERRAL_DRY_RUN === "1";

  const amountGat = process.env.REFERRAL_FUND_GAT?.trim() || "50000";
  const gatAddress = process.env.VITE_GAT_TOKEN_ADDRESS?.trim();
  const treasuryAddress = process.env.VITE_GAT_TREASURY_ADDRESS?.trim();

  if (!gatAddress?.startsWith("0x") || !treasuryAddress?.startsWith("0x")) {
    throw new Error("Set VITE_GAT_TOKEN_ADDRESS and VITE_GAT_TREASURY_ADDRESS in .env.local");
  }

  const [signer] = await hre.ethers.getSigners();
  if (!signer) {
    throw new Error("No signer, set PROTOCOL_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");
  }

  const amount = hre.ethers.parseUnits(amountGat, 18);
  if (amount <= 0n) throw new Error("Invalid REFERRAL_FUND_GAT");

  const gat = await hre.ethers.getContractAt(
    [
      "function balanceOf(address) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ],
    gatAddress,
  );
  const treasury = await hre.ethers.getContractAt(
    [
      "function depositToBucket(uint8 bucket, uint256 amount)",
      "function bucketBalances(uint8 bucket) view returns (uint256)",
      "function totalTreasuryBalance() view returns (uint256)",
      "function feeCollectors(address) view returns (bool)",
      "function owner() view returns (address)",
    ],
    treasuryAddress,
  );

  const owner = await treasury.owner();
  const isCollector = await treasury.feeCollectors(signer.address);
  const signerBal = await gat.balanceOf(signer.address);
  const bucketBefore = await treasury.bucketBalances(BUCKET_REFERRAL);
  const totalBefore = await treasury.totalTreasuryBalance();

  console.log("Signer:", signer.address);
  console.log("Treasury owner:", owner);
  console.log("Fee collector:", isCollector);
  console.log("GAT token:", gatAddress);
  console.log("Treasury SC:", treasuryAddress);
  console.log("Deposit amount:", amountGat, "GAT → bucket", BUCKET_REFERRAL, "(referral)");
  console.log("Signer GAT balance:", hre.ethers.formatUnits(signerBal, 18));
  console.log("Referral bucket before:", hre.ethers.formatUnits(bucketBefore, 18), "GAT");
  console.log("Treasury total before:", hre.ethers.formatUnits(totalBefore, 18), "GAT");

  if (signer.address.toLowerCase() !== owner.toLowerCase() && !isCollector) {
    throw new Error("Signer is not treasury owner or feeCollector");
  }
  if (signerBal < amount) {
    throw new Error(
      `Insufficient GAT on signer (have ${hre.ethers.formatUnits(signerBal, 18)}, need ${amountGat})`,
    );
  }

  if (dryRun) {
    console.log("\n── DRY RUN, no transactions sent ──");
    return;
  }

  const allowance = await gat.allowance(signer.address, treasuryAddress);
  if (allowance < amount) {
    console.log("\nApproving GAT for treasury…");
    const approveTx = await gat.approve(treasuryAddress, amount);
    await approveTx.wait();
    console.log("✓ approve tx:", approveTx.hash);
  }

  console.log("\nDepositing to referral bucket…");
  const depositTx = await treasury.depositToBucket(BUCKET_REFERRAL, amount);
  await depositTx.wait();
  console.log("✓ depositToBucket tx:", depositTx.hash);

  const bucketAfter = await treasury.bucketBalances(BUCKET_REFERRAL);
  const totalAfter = await treasury.totalTreasuryBalance();
  console.log("\nReferral bucket after:", hre.ethers.formatUnits(bucketAfter, 18), "GAT");
  console.log("Treasury total after:", hre.ethers.formatUnits(totalAfter, 18), "GAT");
}

main().catch((e) => {
  console.error(e?.shortMessage || e?.message || e);
  process.exit(1);
});
