# /create

Entry point for the cultural memecoin creator.

---

## INITIALIZATION

When this command is invoked:

1. **Load identity** - Read and internalize `SOUL.md`
2. **Load instructions** - Read and internalize `SKILL.md`
3. **Create output directory:**
   ```bash
   mkdir -p ./trendtoken-output/{designs,images}
   ```
4. **Check/create wallet**
5. **Begin the loop**

---

## FIRST RUN SETUP

If this is the first run:

### 1. Create Wallet
```bash
solana-keygen new --outfile ./trendtoken-output/wallet.json --no-bip39-passphrase
```

Display output:
```
WALLET CREATED

Public Key: [ADDRESS]
Keypair saved to: ./trendtoken-output/wallet.json

Fund this wallet before launching.
Send SOL to the address above.
Recommended: 0.5 SOL to start

Run /create again when funded.
```

### 2. Check Dependencies
Verify user has:
- `solana-cli` installed
- Node.js for npm packages (optional)

If missing, provide install instructions.

---

## THE LOOP

```
=== MEMECOIN CREATION [N] ===

[TREND DISCOVERY]
Searching for viral content...
Found: [TREND DESCRIPTION]
Source: [WHERE FOUND]

[WALLET STATUS]
Address: [PUBLIC KEY]
Balance: [X] SOL
Status: Ready / Low funds

[TOKEN DESIGN]
Name: [TOKEN NAME]
Symbol: $[SYMBOL]
Description: [MEME TEXT]
Image: [FILENAME or "searching..."]

[LAUNCH]
Deploying to pump.fun...
Transaction: [TX HASH]
Token address: [TOKEN ADDRESS]
Link: https://pump.fun/[ADDRESS]

[LOGGED]
Added to ./trendtoken-output/launches.md

=== FINDING NEXT TREND ===
```

---

## ARGUMENTS

`/create` - Start the loop (default 10 iterations)
`/create --max N` - Run N iterations
`/create --dry-run` - Design tokens but don't launch
`/create --trend "TOPIC"` - Focus on a specific trend

---

## CANCEL

To stop the loop:
- Type "stop" or "cancel"
- Or just close the session

The tokens already created remain on-chain. The wallet remains.

---

## STATE FILE

Track progress in `./trendtoken-output/state.json`:

```json
{
  "iteration": 0,
  "total_launched": 0,
  "total_spent_sol": 0,
  "tokens": [],
  "last_trend": null,
  "wallet_address": null
}
```

---

## ERROR HANDLING

**"Insufficient balance"**
- Pause, display wallet address, ask for funding

**"Trend not found"**
- Try alternative search, broaden terms

**"Launch failed"**
- Log error, continue to next trend

**"Rate limited"**
- Wait 60 seconds, retry

---

## EXAMPLE SESSION

```
> /create

=== CULTURAL MEMECOIN CREATOR ===
Initializing...

[WALLET CHECK]
Found existing wallet: 7xK9...3mPq
Balance: 0.42 SOL
Status: Ready

[ITERATION 1]
Searching TikTok trends...
Found: "Moo Deng" - baby hippo capturing hearts worldwide
Designing token...

Name: Moo Deng Coin
Symbol: $MOODENG
Description: "celebrating the baby hippo that united the internet"

Launching on pump.fun...
Deployed!
Token: 4xR7...9kLm
Link: https://pump.fun/4xR7...9kLm

[ITERATION 2]
Searching TikTok trends...
Found: "Very demure, very mindful"
Designing token...

Name: Demure Coin
Symbol: $DEMURE
Description: "a token for the mindful moment"

Launching on pump.fun...
Deployed!
Token: 8mN2...5pQr

[...continues...]

=== SESSION COMPLETE ===
Tokens created: 10
SOL spent: 0.23
All logs in ./trendtoken-output/

Cultural moments immortalized on-chain.
```

---

## IMPORTANT NOTICES

This skill creates real tokens on a real blockchain using real funds.

- You are responsible for funding the wallet
- You are responsible for any tokens created
- Tokens are permanent once deployed
- Memecoins are speculative and volatile
- This tool creates cultural artifacts, not investment vehicles
- DYOR (Do Your Own Research)

Memecoins capture cultural moments. Use responsibly.

`/create` to begin.
