const hre = require("hardhat");

async function main() {
  const address = process.env.VITE_GAT_TOKEN_ADDRESS;
  if (!address) throw new Error("Set VITE_GAT_TOKEN_ADDRESS in .env.local");

  const treasury = process.env.GAT_TREASURY_ADDRESS || (await hre.ethers.getSigners())[0]?.address;
  if (!treasury) throw new Error("No treasury address");

  const mintAmount = hre.ethers.parseUnits(
    process.env.GAT_MINT_AMOUNT || "90000000",
    18,
  );

  const gat = await hre.ethers.getContractAt("GATToken", address);
  const [owner] = await hre.ethers.getSigners();

  const totalBefore = await gat.totalSupply();
  const max = await gat.maxSupply();
  console.log("Contract:", address);
  console.log("Owner:", owner.address);
  console.log("Treasury:", treasury);
  console.log("Total supply before:", hre.ethers.formatUnits(totalBefore, 18), "GAT");
  console.log("Max supply:", hre.ethers.formatUnits(max, 18), "GAT");
  console.log("Minting:", hre.ethers.formatUnits(mintAmount, 18), "GAT");

  const tx = await gat.mint(treasury, mintAmount);
  await tx.wait();

  const totalAfter = await gat.totalSupply();
  console.log("\n✓ Mint complete");
  console.log("Total supply after:", hre.ethers.formatUnits(totalAfter, 18), "GAT");
  console.log("Treasury balance:", hre.ethers.formatUnits(await gat.balanceOf(treasury), 18), "GAT");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
