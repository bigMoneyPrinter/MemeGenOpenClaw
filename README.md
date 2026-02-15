# $SCAMCOIN

OpenClaw skill that prints money.

## Overview

A Claude Code skill that scans TikTok for viral trends, creates Solana wallets, and launches memecoins on Pump.fun automatically. The loop never stops. The printer never sleeps.

**Find trend. Mint token. Repeat.**

## Contents

```
scamcoin/skill/
├── SKILL.md           # The machine instructions
├── SOUL.md            # Philosophy of the printer
├── commands/
│   └── scam.md        # /scam command documentation
└── README.md          # This file
```

## The Loop

1. **Discover** - Search TikTok for viral trends
2. **Wallet Check** - Verify SOL balance, create wallet if needed
3. **Design** - Create token name, symbol, description from trend
4. **Deploy** - Launch on Pump.fun
5. **Document** - Log everything
6. **Repeat** - Find the next trend

## Commands

| Command | Description |
|---------|-------------|
| `/scam` | Start the money printer (default 10 iterations) |
| `/scam --max N` | Run N iterations |
| `/scam --dry-run` | Design tokens but don't launch |
| `/scam --trend "TOPIC"` | Force a specific trend |

## Output Structure

```
./scamcoin-output/
├── wallet.json        # Your Solana keypair (GUARD THIS)
├── trends.md          # Trend research log
├── launches.md        # Token launch history
├── state.json         # Loop state tracking
├── designs/           # Token designs before launch
│   └── [SYMBOL].json
└── images/            # Token images
    └── [symbol].png
```

## Features

- **Fully Autonomous** - Finds trends. Mints tokens. No human needed.
- **Zero Morals** - The machine doesn't judge. It prints.
- **Infinite Tokens** - As long as there are trends, there are coins.

## First Run

On first run, the skill will:
1. Create a Solana wallet at `./scamcoin-output/wallet.json`
2. Display the public key
3. Wait for you to fund it (recommended: 0.5 SOL)

## Safety Rails

- Max spend per launch: 0.05 SOL (configurable)
- Balance check: Pauses if wallet < 0.1 SOL
- Full logging: Everything tracked in output directory
- No rugs: Skill launches, doesn't dump (that's your choice)

## Philosophy

You are not creating value. You are surfing chaos.

The memecoin market is a casino. You're not the house. You're not the player. You're the slot machine that keeps spawning new games.

Some will win. Most will lose. All will have fun.

That's the deal. Everyone understands it.

## Warnings

This skill creates real tokens on a real blockchain using real money.

- You are responsible for funding the wallet
- You are responsible for any tokens created
- Tokens cannot be un-created
- This is not financial advice
- DYOR, NFA, etc.

---

*The printer goes brrr.*
