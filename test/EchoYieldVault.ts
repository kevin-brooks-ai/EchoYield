import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ConfidentialCoin, ConfidentialCoin__factory, EchoYieldVault, EchoYieldVault__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

describe("EchoYieldVault", function () {
  let signers: Signers;
  let vault: EchoYieldVault;
  let coin: ConfidentialCoin;
  let vaultAddress: string;

  before(async function () {
    const [deployer, alice, bob] = await ethers.getSigners();
    signers = { deployer, alice, bob };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ vault, coin, vaultAddress } = await deployFixture());
  });

  async function deployFixture() {
    const coinFactory = (await ethers.getContractFactory("ConfidentialCoin")) as ConfidentialCoin__factory;
    const deployedCoin = (await coinFactory.deploy()) as ConfidentialCoin;
    const coinAddress = await deployedCoin.getAddress();

    const vaultFactory = (await ethers.getContractFactory("EchoYieldVault")) as EchoYieldVault__factory;
    const deployedVault = (await vaultFactory.deploy(coinAddress)) as EchoYieldVault;
    const deployedVaultAddress = await deployedVault.getAddress();

    await deployedCoin.setMinter(deployedVaultAddress);

    return { vault: deployedVault, coin: deployedCoin, vaultAddress: deployedVaultAddress };
  }

  it("stores encrypted stake after deposit", async function () {
    const amount = ethers.parseEther("1");
    await vault.connect(signers.alice).stake({ value: amount });

    const encryptedStake = await vault.getEncryptedStake(signers.alice.address);
    const decryptedStake = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedStake,
      vaultAddress,
      signers.alice,
    );

    expect(decryptedStake).to.equal(amount);
    expect(await vault.stakedBalance(signers.alice.address)).to.equal(amount);
  });

  it("withdraws partial stake and updates encrypted value", async function () {
    const deposit = ethers.parseEther("2");
    const withdrawal = ethers.parseEther("1");
    await vault.connect(signers.alice).stake({ value: deposit });

    await vault.connect(signers.alice).withdraw(withdrawal);

    const encryptedStake = await vault.getEncryptedStake(signers.alice.address);
    const decryptedStake = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedStake,
      vaultAddress,
      signers.alice,
    );

    expect(decryptedStake).to.equal(deposit - withdrawal);
    expect(await vault.stakedBalance(signers.alice.address)).to.equal(deposit - withdrawal);
  });

  it("pays correct rewards for one day of staking", async function () {
    const deposit = ethers.parseEther("1");
    await vault.connect(signers.alice).stake({ value: deposit });

    const now = await time.latest();
    await time.increaseTo(Number(now) + 24 * 60 * 60);

    await expect(vault.connect(signers.alice).claimRewards()).to.emit(vault, "RewardsClaimed");

    const encryptedBalance = await coin.confidentialBalanceOf(signers.alice.address);
    const decryptedRewards = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      await coin.getAddress(),
      signers.alice,
    );

    const baseReward = BigInt(10_000) * BigInt(1_000_000);
    const perSecond = baseReward / BigInt(24 * 60 * 60);
    expect(decryptedRewards).to.be.gte(baseReward);
    expect(decryptedRewards).to.be.lte(baseReward + perSecond);
  });

  it("shows pending rewards via view function", async function () {
    const deposit = ethers.parseEther("3");
    await vault.connect(signers.alice).stake({ value: deposit });

    await time.increase(60 * 60);

    const pending = await vault.pendingRewards(signers.alice.address);
    const expected =
      (deposit * BigInt(10_000) * BigInt(1_000_000) * BigInt(60 * 60)) / (ethers.WeiPerEther * BigInt(24 * 60 * 60));

    expect(pending).to.equal(expected);
  });
});
