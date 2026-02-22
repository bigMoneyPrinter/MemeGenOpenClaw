# TrendToken

A Claude Code skill for turning viral cultural moments into on-chain tokens.

## Overview

TrendToken is a tool that helps creators capture viral TikTok trends and cultural moments as Solana-based tokens on Pump.fun. It automates trend research, wallet management, and token deployment - letting you focus on the creative side of memecoin culture.

**Discover trends. Create tokens. Share culture.**

## Contents

```
trendtoken/skill/
├── SKILL.md           # Core skill instructions
├── SOUL.md            # Project philosophy
├── commands/
│   └── create.md      # /create command documentation
└── README.md          # This file
```

## How It Works

1. **Discover** - Research TikTok for trending cultural moments
2. **Wallet Check** - Verify SOL balance, create wallet if needed
3. **Design** - Create token name, symbol, and description inspired by the trend
4. **Deploy** - Launch on Pump.fun
5. **Document** - Log all activity
6. **Iterate** - Explore more trends as desired

## Commands

| Command | Description |
|---------|-------------|
| `/create` | Start creating trend-based tokens (default 10 iterations) |
| `/create --max N` | Run N iterations |
| `/create --dry-run` | Design tokens without deploying |
| `/create --trend "TOPIC"` | Explore a specific trend or cultural moment |

## Output Structure

```
./trendtoken-output/
├── wallet.json        # Your Solana keypair (KEEP THIS SECURE)
├── trends.md          # Trend research log
├── launches.md        # Token launch history
├── state.json         # Session state tracking
├── designs/           # Token designs before launch
│   └── [SYMBOL].json
└── images/            # Token images
    └── [symbol].png
```

## Features

- **Automated Research** - Scans TikTok for trending cultural content
- **Wallet Management** - Creates and manages Solana wallets
- **Token Design** - Generates creative token concepts from trends
- **Pump.fun Integration** - Deploys tokens directly to the platform

## First Run

On first run, the skill will:
1. Create a Solana wallet at `./trendtoken-output/wallet.json`
2. Display the public key
3. Wait for you to fund it (recommended: 0.5 SOL minimum)

## Safety Features

- Max spend per launch: 0.05 SOL (configurable)
- Balance check: Pauses if wallet < 0.1 SOL
- Full logging: All activity tracked in output directory
- Transparency: Complete record of all token deployments

## Philosophy

TrendToken is about cultural expression on the blockchain. Memecoins at their best are a form of collective storytelling - capturing moments, jokes, and shared experiences in a tradeable format.

This tool helps you participate in that culture by making it easy to create tokens inspired by genuine trends and moments that resonate with communities.

## Important Risk Disclosures

**Please read carefully before using this tool:**

- **Financial Risk**: Memecoins are highly speculative. The vast majority lose value rapidly. Never invest more than you can afford to lose completely.

- **No Guarantees**: Creating a token does not guarantee any return. Most memecoins have zero liquidity and no lasting value.

- **Regulatory Uncertainty**: Cryptocurrency regulations vary by jurisdiction and are evolving. You are responsible for understanding and complying with applicable laws.

- **Permanent Actions**: Tokens deployed to the blockchain cannot be deleted or undone.

- **Not Financial Advice**: This tool is for educational and creative purposes. Nothing here constitutes financial, investment, or legal advice.

- **Your Responsibility**: You are solely responsible for any tokens you create, how they are marketed, and any funds involved.

## Ethical Guidelines

TrendToken is designed for **cultural expression**, not exploitation:

- Create tokens that celebrate genuine trends and shared moments
- Be transparent about what your tokens are (collectibles, not investments)
- Never mislead others about potential returns or value
- Don't create tokens designed to manipulate or deceive
- Respect intellectual property and the communities you engage with

---

*Capture culture. Create responsibly.*
