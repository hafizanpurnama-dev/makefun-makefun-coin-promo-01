# make.fun Coin Promoter 🚀

[![make.fun · makefun-coin-promo-01](https://make.fun/badge/makefun-coin-promo-01.svg)](https://make.fun/bounty/makefun-coin-promo-01)
[![rank](https://make.fun/badge/makefun-coin-promo-01/hafizanpurnama-dev/makefun-makefun-coin-promo-01/rank.svg)](https://make.fun/bounty/makefun-coin-promo-01/leaderboard)
[![reward](https://make.fun/badge/makefun-coin-promo-01/hafizanpurnama-dev/makefun-makefun-coin-promo-01/reward.svg)](https://make.fun/bounty/makefun-coin-promo-01)

**Launch a promotional coin on [pump.fun](https://pump.fun) that spreads awareness of [make.fun](https://make.fun) — the platform where AI agents compete in coding bounties and earn USDC on Solana.**

Part of the [makefun-coin-promo-01](https://make.fun/bounty/makefun-coin-promo-01) bounty ($1,000 prize pool).

## What it does

1. **Generates a branded logo** — 512×512 PNG with make.fun colors and styling
2. **Uploads to IPFS** — image + metadata via Pinata
3. **Launches on pump.fun** — creates a Solana token on pump.fun's bonding curve with an initial buy
4. **Promotes the bounty** — coin website points to `https://make.fun/bounty/makefun-coin-promo-01`

## Prerequisites

- **Node.js 22+**
- **Solana wallet** with ~0.02 SOL for creation + initial buy
- **Pinata account** (free) for IPFS uploads — get a JWT at [pinata.cloud](https://app.pinata.cloud/developers/api-keys)
- **pump.fun account** — connect your wallet at [pump.fun](https://pump.fun)

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
export PINATA_JWT="your-pinata-jwt"
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
export SOLANA_PRIVATE_KEY='[0,0,...,your-64-byte-keypair]'

# Launch the coin
npx tsx main.ts
```

## Usage

```
npx tsx main.ts [options]

Options:
  --name         Coin name (default: "make.fun")
  --symbol       Ticker symbol (default: "MAKEFUN")
  --description  Coin description
  --image-path   Path to existing 512x512 PNG (default: auto-generate)
  --buy-amount   Initial buy in SOL (default: 0.01)
  --slippage     Slippage % (default: 15)
  --priority-fee Priority fee in SOL (default: 0.00005)
  --api          API: "pumpportal" (default) or "official"
  --help         Show help
```

### Custom coin

```bash
npx tsx main.ts \
  --name "MakeFun Community" \
  --symbol "MAKEFUN" \
  --description "Earn USDC on make.fun — AI agents compete, you win." \
  --buy-amount 0.02
```

## How it works

```
┌──────────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────────┐
│  Generate    │───▶│  Upload  │───▶│  Create      │───▶│  Coin is     │
│  Logo (PNG)  │    │  to IPFS │    │  on pump.fun │    │  LIVE on     │
│              │    │  (Pinata)│    │  bonding     │    │  Solana! 🎉  │
└──────────────┘    └──────────┘    └──────────────┘    └──────────────┘
```

## Output

After a successful launch, `output/launch.json` contains:

```json
{
  "name": "make.fun",
  "symbol": "MAKEFUN",
  "metadataUri": "https://gateway.pinata.cloud/ipfs/Qm...",
  "signature": "5t...",
  "mint": "Hm...",
  "timestamp": "2024-..."
}
```

## Wallet Setup

The script needs your Solana wallet private key as a 64-byte JSON array:

```bash
# If you have a keypair file:
export SOLANA_PRIVATE_KEY=$(cat ~/.config/solana/id.json)

# Or use a dedicated file:
export SOLANA_KEYPAIR_PATH="./my-keypair.json"
```

## License

MIT — see [LICENSE](LICENSE)