import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient } from 'wagmi';
import { ethers } from 'ethers';
import { formatEther } from 'viem';

import { COIN_ABI, COIN_ADDRESS, VAULT_ABI, VAULT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';

import '../styles/AppShell.css';
import '../styles/Controls.css';

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MICRO = 1_000_000n;

const formatCoinAmount = (value: bigint) => {
  const whole = value / MICRO;
  const fraction = value % MICRO;
  return `${whole.toString()}.${fraction.toString().padStart(6, '0')}`;
};

export function EchoYieldApp() {
  const { address, status } = useAccount();
  const publicClient = usePublicClient();
  const signer = useEthersSigner();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();

  const [stakeInput, setStakeInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [totalStaked, setTotalStaked] = useState<bigint>(0n);
  const [myStake, setMyStake] = useState<bigint>(0n);
  const [pendingRewards, setPendingRewards] = useState<bigint>(0n);
  const [encryptedStakeHandle, setEncryptedStakeHandle] = useState<string>('');
  const [coinCiphertext, setCoinCiphertext] = useState<string>('');
  const [decryptedCoinBalance, setDecryptedCoinBalance] = useState<string | null>(null);

  const vaultReadEnabled = Boolean(publicClient);

  useEffect(() => {
    if (!vaultReadEnabled) {
      return;
    }

    const loadVaultState = async () => {
      try {
        const [total] = await Promise.all([
          publicClient!.readContract({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: 'totalStaked',
          }),
        ]);
        setTotalStaked(total as bigint);
      } catch (error) {
        console.error('Failed to load global state', error);
      }
    };

    loadVaultState();
  }, [vaultReadEnabled, refreshNonce, publicClient]);

  useEffect(() => {
    if (!vaultReadEnabled || !address) {
      setMyStake(0n);
      setPendingRewards(0n);
      setEncryptedStakeHandle('');
      setCoinCiphertext('');
      return;
    }

    const loadUserState = async () => {
      try {
        const [stake, rewards, encryptedStake, encryptedCoin] = await Promise.all([
          publicClient!.readContract({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: 'stakedBalance',
            args: [address],
          }),
          publicClient!.readContract({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: 'pendingRewards',
            args: [address],
          }),
          publicClient!.readContract({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: 'getEncryptedStake',
            args: [address],
          }),
          publicClient!.readContract({
            address: COIN_ADDRESS,
            abi: COIN_ABI,
            functionName: 'confidentialBalanceOf',
            args: [address],
          }),
        ]);

        setMyStake(stake as bigint);
        setPendingRewards(rewards as bigint);
        setEncryptedStakeHandle((encryptedStake as string) || '');
        setCoinCiphertext(encryptedCoin as string);
      } catch (error) {
        console.error('Failed to load account state', error);
      }
    };

    loadUserState();
  }, [vaultReadEnabled, address, refreshNonce, publicClient]);

  const handleTransaction = async (action: () => Promise<void>) => {
    setIsProcessing(true);
    setActionMessage('');
    try {
      await action();
      setRefreshNonce((value) => value + 1);
      setDecryptedCoinBalance(null);
    } catch (error) {
      console.error('Transaction failed', error);
      if (error instanceof Error) {
        setActionMessage(error.message);
      } else {
        setActionMessage('Transaction failed');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStake = async () => {
    await handleTransaction(async () => {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Connect a wallet to stake');
      }
      if (!stakeInput || Number(stakeInput) <= 0) {
        throw new Error('Enter an amount greater than 0');
      }

      const tx = await new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, resolvedSigner).stake({
        value: ethers.parseEther(stakeInput),
      });
      await tx.wait();
      setStakeInput('');
      setActionMessage('Stake completed');
    });
  };

  const handleWithdraw = async () => {
    await handleTransaction(async () => {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Connect a wallet to withdraw');
      }
      if (!withdrawInput || Number(withdrawInput) <= 0) {
        throw new Error('Enter an amount greater than 0');
      }
      const requested = ethers.parseEther(withdrawInput);
      if (requested > myStake) {
        throw new Error('Withdrawal exceeds your stake');
      }

      const tx = await new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, resolvedSigner).withdraw(requested);
      await tx.wait();
      setWithdrawInput('');
      setActionMessage('Withdrawal completed');
    });
  };

  const handleClaimRewards = async () => {
    await handleTransaction(async () => {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Connect a wallet to claim');
      }

      const tx = await new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, resolvedSigner).claimRewards();
      await tx.wait();
      setActionMessage('Rewards claimed');
    });
  };

  const handleDecryptBalance = async () => {
    if (!instance || !address || !coinCiphertext || coinCiphertext === ZERO_HANDLE) {
      setDecryptError('No encrypted balance available');
      return;
    }
    const resolvedSigner = await signer;
    if (!resolvedSigner) {
      setDecryptError('Connect a wallet to decrypt');
      return;
    }

    setDecryptError(null);
    setIsDecrypting(true);
    try {
      const keypair = instance.generateKeypair();
      const contractAddresses = [COIN_ADDRESS];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '3';

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        [
          {
            handle: coinCiphertext,
            contractAddress: COIN_ADDRESS,
          },
        ],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decryptedValue = result[coinCiphertext];
      if (decryptedValue) {
        setDecryptedCoinBalance(formatCoinAmount(BigInt(decryptedValue)));
      } else {
        setDecryptError('Unable to decrypt balance');
      }
    } catch (error) {
      console.error('Decryption failed', error);
      if (error instanceof Error) {
        setDecryptError(error.message);
      } else {
        setDecryptError('Unable to decrypt balance');
      }
    } finally {
      setIsDecrypting(false);
    }
  };

  const walletReady = status === 'connected' && Boolean(address);

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <div className="brand">
            <h1>EchoYield Vault</h1>
            <p>Stake ETH privately and unlock encrypted COIN rewards.</p>
          </div>
          <ConnectButton />
        </header>

        <section className="metrics-grid">
          <div className="metric-card">
            <p className="metric-label">Network Total Staked</p>
            <p className="metric-value">{formatEther(totalStaked)} ETH</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">My Stake</p>
            <p className="metric-value">{walletReady ? `${formatEther(myStake)} ETH` : '0 ETH'}</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Pending COIN Rewards</p>
            <p className="metric-value">
              {walletReady ? `${formatCoinAmount(pendingRewards)} COIN` : '0.000000 COIN'}
            </p>
          </div>
        </section>

        <div className="content-grid">
          <section className="action-card">
            <h2 className="action-title">Stake Controls</h2>
            <div className="actions-grid">
              <div className="form-group">
                <label className="form-label">Stake ETH</label>
                <input
                  className="text-input"
                  type="number"
                  placeholder="0.0"
                  value={stakeInput}
                  onChange={(event) => setStakeInput(event.target.value)}
                  min="0"
                  step="0.01"
                />
                <button
                  className="primary-btn"
                  onClick={handleStake}
                  disabled={!walletReady || isProcessing}
                >
                  Deposit
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Withdraw ETH</label>
                <input
                  className="text-input"
                  type="number"
                  placeholder="0.0"
                  value={withdrawInput}
                  onChange={(event) => setWithdrawInput(event.target.value)}
                  min="0"
                  step="0.01"
                />
                <button
                  className="secondary-btn"
                  onClick={handleWithdraw}
                  disabled={!walletReady || isProcessing}
                >
                  Withdraw
                </button>
              </div>
            </div>
            <div className="helper-text">
              Rewards accrue at 10,000 COIN per day for every staked ETH. Claim updates your encrypted balance.
            </div>
            <button
              className="primary-btn"
              style={{ marginTop: '1.25rem' }}
              onClick={handleClaimRewards}
              disabled={!walletReady || isProcessing}
            >
              Claim Rewards
            </button>
            {actionMessage && <div className="tx-status">{actionMessage}</div>}
          </section>

          <section className="balance-card">
            <h3>Encrypted Balances</h3>
            <p className="metric-label">Stake handle</p>
            <div className="encrypted-handle">
              {walletReady && encryptedStakeHandle ? encryptedStakeHandle : 'No encrypted stake yet.'}
            </div>

            <p className="metric-label">COIN ciphertext</p>
            <div className="encrypted-handle">
              {walletReady && coinCiphertext && coinCiphertext !== ZERO_HANDLE
                ? coinCiphertext
                : 'No COIN balance recorded yet.'}
            </div>

            <button
              className="primary-btn decrypt-btn"
              onClick={handleDecryptBalance}
              disabled={!walletReady || isDecrypting || !coinCiphertext || coinCiphertext === ZERO_HANDLE}
            >
              {isDecrypting ? 'Decrypting…' : 'Decrypt COIN Balance'}
            </button>

            {decryptedCoinBalance && (
              <div className="status-note">Decrypted balance: {decryptedCoinBalance} COIN</div>
            )}
            {decryptError && <div className="status-note">{decryptError}</div>}
            {zamaError && <div className="status-note">{zamaError}</div>}
            {isZamaLoading && <div className="status-note">Preparing encryption relayer…</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
