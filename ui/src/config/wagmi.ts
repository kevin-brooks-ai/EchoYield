import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'EchoYield',
  projectId: '3591a7bc1fcf4be6b94c0238272346b5',
  chains: [sepolia],
  ssr: false,
});
