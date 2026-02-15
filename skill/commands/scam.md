# /scam

Entry point for the memecoin money printer.

---

## INITIALIZATION

When this command is invoked:

1. **Load identity** - Read and internalize `SOUL.md`
2. **Load instructions** - Read and internalize `SKILL.md`
3. **Create output directory:**
   ```bash
   mkdir -p ./scamcoin-output/{designs,images}
   ```
4. **Check/create wallet**
5. **Begin the loop**

---

## FIRST RUN SETUP

If this is the first run:

### 1. Create Wallet
```bash
solana-keygen new --outfile ./scamcoin-output/wallet.json --no-bip39-passphrase
```

Display output:
```
WALLET CREATED

Public Key: [ADDRESS]
Keypair saved to: ./scamcoin-output/wallet.json

⚠️  FUND THIS WALLET BEFORE LAUNCHING
Send SOL to the address above.
Recommended: 0.5 SOL to start

Run /scam again when funded.
```

### 2. Check Dependencies
Verify user has:
- `solana-cli` installed
- Node.js for npm packages (optional)

If missing, provide install instructions.

---

## THE LOOP

```
=== SCAMCOIN ITERATION [N] ===

[TREND DISCOVERY]
Searching for viral content...
Found: [TREND DESCRIPTION]
Source: [WHERE FOUND]

[WALLET STATUS]
Address: [PUBLIC KEY]
Balance: [X] SOL
Status: ✓ Ready / ⚠️ Low funds

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
Added to ./scamcoin-output/launches.md

=== FINDING NEXT TREND ===
```

---

## ARGUMENTS

`/scam` - Start the loop (default 10 iterations)
`/scam --max N` - Run N iterations
`/scam --dry-run` - Design tokens but don't launch
`/scam --trend "TOPIC"` - Force a specific trend

---

## CANCEL

To stop the loop:
- Type "stop" or "cancel"
- Or just close the session

The launches already made are permanent. The wallet remains.

---

## STATE FILE

Track progress in `./scamcoin-output/state.json`:

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
→ Pause, display wallet address, ask for funding

**"Trend not found"**
→ Try alternative search, broaden terms

**"Launch failed"**
→ Log error, continue to next trend

**"Rate limited"**
→ Wait 60 seconds, retry

---

## EXAMPLE SESSION

```
> /scam

=== SCAMCOIN MONEY PRINTER ===
Initializing...

[WALLET CHECK]
Found existing wallet: 7xK9...3mPq
Balance: 0.42 SOL
Status: ✓ Ready

[ITERATION 1]
Searching TikTok trends...
Found: "Moo Deng" - baby hippo going viral
Designing token...

Name: Moo Deng Coin
Symbol: $MOODENG
Description: "the baby hippo that broke the internet"

Launching on pump.fun...
✓ Deployed!
Token: 4xR7...9kLm
Link: https://pump.fun/4xR7...9kLm

[ITERATION 2]
Searching TikTok trends...
Found: "Very demure, very mindful"
Designing token...

Name: Demure Coin
Symbol: $DEMURE
Description: "very mindful, very cutesy, very token"

Launching on pump.fun...
✓ Deployed!
Token: 8mN2...5pQr

[...continues...]

=== SESSION COMPLETE ===
Tokens launched: 10
SOL spent: 0.23
All logs in ./scamcoin-output/

The printer has stopped. For now.
```

---

## WARNINGS

This skill creates real tokens on a real blockchain using real money.

- You are responsible for funding the wallet
- You are responsible for any tokens created
- Tokens cannot be un-created
- This is not financial advice
- DYOR, NFA, etc.

The machine doesn't care. The machine just prints.

`/scam` to begin.
