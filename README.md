# EchoYield

EchoYield is a privacy-first ETH staking vault built on Zama's FHEVM. Deposits are tracked as encrypted amounts, rewards accrue deterministically on-chain, and users can withdraw, claim, and decrypt balances whenever they choose. The front end pairs viem reads with ethers writes and integrates Zama's relayer so COIN balances stay confidential until a user explicitly decrypts them.

## Overview
- Stake any amount of ETH and keep the position encrypted on-chain using FHE (`euint128` handles).
- Earn encrypted COIN rewards at a fixed rate of 10,000 COIN per staked ETH per day (stored in micro units, `1e6`).
- Withdraw ETH and claim COIN at any time; everything remains non-custodial.
- Decrypt COIN balances client-side through the Zama relayer flow after signing an EIP-712 request.

## Key Advantages
- **Privacy by default**: Stake sizes and reward balances remain encrypted while still being verifiable on-chain.
- **Deterministic rewards**: Fixed accrual rate, encoded directly in the contract for transparent economics.
- **User-controlled access**: No lockups or custodial agents; users can exit or claim whenever they want.
- **FHE-native tokenization**: COIN leverages ERC7984 to keep the reward ledger confidential without sacrificing compatibility.

## What Problem It Solves
- Public staking products leak portfolio size and timing; EchoYield keeps deposits and rewards private with FHE while preserving on-chain correctness.
- Traditional reward tokens expose balances; COIN is minted as encrypted `euint64` values and only decrypted on demand.
- Many privacy systems offload trust to middleware; EchoYield keeps all accounting on-chain and uses the relayer solely for user-approved decryption.

## Architecture & Technology
- **Smart contracts**: `EchoYieldVault` tracks stakes, time-based rewards, and encrypted balances; `ConfidentialCoin` mints encrypted COIN via ERC7984.
- **FHE stack**: `@fhevm/solidity`, `confidential-contracts-v91`, and the Zama Ethereum config for encrypted arithmetic and protocol settings.
- **Frontend**: React + Vite + TypeScript, RainbowKit + wagmi (Sepolia only), viem for reads, ethers for writes, custom CSS (no Tailwind), and `@zama-fhe/relayer-sdk` for client decryption.
- **Tooling**: Hardhat + TypeScript, `hardhat-deploy`, coverage, gas reporter, ESLint/Prettier, TypeChain, and targeted tasks for vault operations.

## Reward Model
- Rate: `10,000 * 1e6` microCOIN per staked ETH per 24 hours.
- Accrual: Linear over time using `block.timestamp`; stored pending rewards are added before each user action.
- Distribution: Rewards are minted as encrypted amounts and transferred to the caller during `claimRewards`.

## Repository Layout
- `contracts/`: `EchoYieldVault.sol`, `ConfidentialCoin.sol`.
- `deploy/`: Hardhat deploy script that deploys both contracts and wires the vault as COIN minter.
- `deployments/`: Network artifacts and ABIs (use these for the frontend).
- `tasks/`: Hardhat tasks for addresses, staking, claiming, and inspecting pending rewards.
- `test/`: Contract tests exercising staking, withdrawing, rewards, and encrypted balances.
- `ui/`: React/Vite application (no env files, no Tailwind; uses generated ABIs copied into `config/contracts.ts`).
- `docs/`: Zama references for the FHE runtime and relayer (`docs/zama_llm.md`, `docs/zama_doc_relayer.md`).

## Prerequisites
- Node.js 20+ and npm 7+.
- Environment variables in a local `.env` (root):
  - `PRIVATE_KEY` — hex string of the deployer (used for deployment; no mnemonic support).
  - `INFURA_API_KEY` — required for Sepolia RPC access.
  - `ETHERSCAN_API_KEY` — optional, for contract verification.

## Contract Development
1. Install dependencies
   ```bash
   npm install
   ```
2. Compile contracts
   ```bash
   npm run compile
   ```
3. Run tests (uses the FHEVM mock; `fhevm.isMock` gating)
   ```bash
   npm run test
   ```
4. Optional local node for manual inspection
   ```bash
   npm run chain          # hardhat node
   npm run deploy:localhost
   ```
5. Linting and coverage (optional)
   ```bash
   npm run lint
   npm run coverage
   ```

## Deployment to Sepolia
1. Ensure `.env` contains `PRIVATE_KEY` and `INFURA_API_KEY` (and `ETHERSCAN_API_KEY` if you want verification).
2. Deploy both contracts (vault + COIN) and set the vault as minter:
   ```bash
   npm run deploy:sepolia
   ```
3. (Optional) Verify on Etherscan:
   ```bash
   npm run verify:sepolia -- <DEPLOYED_CONTRACT_ADDRESS>
   ```
4. Deployment artifacts and ABIs are written to `deployments/sepolia/*.json`. These generated ABIs must be used by the frontend; do not handcraft or mock ABIs.

## Frontend (ui/)
- Uses Sepolia only; connect a wallet funded on Sepolia.
- Reads via viem, writes via ethers, decryption through `@zama-fhe/relayer-sdk`.
- Configuration is code-based (no frontend env files or localStorage usage).

Setup and run:
```bash
cd ui
npm install
# Update ui/src/config/contracts.ts with the deployed vault and COIN addresses,
# then paste the ABIs from deployments/sepolia/EchoYieldVault.json and ConfidentialCoin.json.
npm run dev      # start Vite
npm run build    # production build
npm run preview  # preview the build
```

User flow in the app:
- Connect wallet (Sepolia).
- Stake ETH (deposit) or withdraw any portion.
- Claim rewards to mint encrypted COIN to your address.
- View the encrypted stake handle and COIN ciphertext.
- Trigger decryption: sign the EIP-712 request, relay to Zama, and display the clear balance client-side.

## Hardhat Tasks
- `npx hardhat task:vault-address` — print EchoYieldVault address.
- `npx hardhat task:coin-address` — print ConfidentialCoin address.
- `npx hardhat task:pending-rewards --user <ADDRESS>` — read pending COIN rewards in micro units.
- `npx hardhat task:stake --amount <ETH>` — stake on the active network with the first signer.
- `npx hardhat task:claim` — claim rewards with the first signer.

## Future Plans
- Dynamic reward curves and configurable emission rates.
- Multi-asset staking or pooled strategies with encrypted accounting.
- Layer 2 support for lower fees while preserving FHE flows.
- Richer analytics (e.g., encrypted APY snapshots, anonymized leaderboard proofs).
- UX upgrades for relayer interactions (queue visibility, retries, clearer signing prompts).
- Additional privacy surfaces such as encrypted transfer of COIN or shielded withdrawals.

## Resources
- FHEVM contract guide: `docs/zama_llm.md`
- Frontend relayer/decryption notes: `docs/zama_doc_relayer.md`
