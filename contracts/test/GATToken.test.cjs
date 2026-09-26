const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GATToken", () => {
  it("mints initial supply to treasury and respects cap", async () => {
    const [owner, treasury] = await ethers.getSigners();
    const initial = ethers.parseUnits("1000", 18);
    const cap = ethers.parseUnits("5000", 18);

    const GAT = await ethers.getContractFactory("GATToken");
    const gat = await GAT.deploy(treasury.address, initial, cap);
    await gat.waitForDeployment();

    expect(await gat.balanceOf(treasury.address)).to.equal(initial);
    expect(await gat.symbol()).to.equal("GAT");
    expect(await gat.maxSupply()).to.equal(cap);

    await gat.connect(owner).mint(treasury.address, ethers.parseUnits("1000", 18));
    await expect(
      gat.connect(owner).mint(treasury.address, ethers.parseUnits("4000", 18)),
    ).to.be.revertedWith("GAT: cap exceeded");
  });
});
