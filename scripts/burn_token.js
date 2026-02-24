/**
 * SPL Token Burn Script
 * Burns tokens from wallet before allowing new token deployments
 */

const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { createBurnInstruction, getAssociatedTokenAddress, getAccount, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

// Configuration
const BURN_TOKEN_MINT = '4pU5FZLintf7W2xQXSCCYbtdi4EgrFXxJ7B5fGW9UFLu';
const BURN_AMOUNT = 1; // 1 token
const DECIMALS = 6; // Pump.fun tokens use 6 decimals
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WALLET_PATH = './trendtoken-output/wallet.json';

async function burnToken(mintAddress = BURN_TOKEN_MINT, amount = BURN_AMOUNT, walletPath = WALLET_PATH) {
  console.log('[BURN] Starting burn process...');
  console.log('[BURN] Mint:', mintAddress);
  console.log('[BURN] Amount:', amount);

  // Load wallet
  const walletData = JSON.parse(fs.readFileSync(walletPath));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
  console.log('[BURN] Wallet:', wallet.publicKey.toBase58());

  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');

  // Get token account (using Token-2022)
  const mintPubkey = new PublicKey(mintAddress);
  const tokenAccount = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
  console.log('[BURN] Token account:', tokenAccount.toBase58());

  // Check balance (using Token-2022)
  try {
    const accountInfo = await getAccount(connection, tokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const balance = Number(accountInfo.amount) / Math.pow(10, DECIMALS);
    console.log('[BURN] Current balance:', balance, 'tokens');

    if (balance < amount) {
      throw new Error(`Insufficient balance: ${balance} < ${amount}`);
    }
  } catch (error) {
    if (error.message.includes('could not find account')) {
      throw new Error('No token account found. You need SCAMCOIN tokens to deploy.');
    }
    throw error;
  }

  // Create burn instruction (using Token-2022)
  const burnAmountRaw = BigInt(amount * Math.pow(10, DECIMALS));
  const burnIx = createBurnInstruction(
    tokenAccount,           // Token account to burn from
    mintPubkey,             // Mint address
    wallet.publicKey,       // Owner of the token account
    burnAmountRaw,          // Amount to burn (with decimals)
    [],                     // Multi-signers (none)
    TOKEN_2022_PROGRAM_ID   // Token-2022 program
  );

  // Create and send transaction
  const transaction = new Transaction().add(burnIx);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  transaction.sign(wallet);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  console.log('[BURN] Transaction:', signature);

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');
  console.log('[BURN] Confirmed!');

  return {
    success: true,
    signature,
    burned: amount,
    mint: mintAddress
  };
}

async function checkBurnBalance(mintAddress = BURN_TOKEN_MINT, walletPath = WALLET_PATH) {
  const walletData = JSON.parse(fs.readFileSync(walletPath));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
  const connection = new Connection(RPC_URL, 'confirmed');

  const mintPubkey = new PublicKey(mintAddress);
  const tokenAccount = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

  try {
    const accountInfo = await getAccount(connection, tokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const balance = Number(accountInfo.amount) / Math.pow(10, DECIMALS);
    return { balance, hasEnough: balance >= BURN_AMOUNT };
  } catch {
    return { balance: 0, hasEnough: false };
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === 'check') {
    checkBurnBalance().then(result => {
      console.log('Balance:', result.balance, 'SCAMCOIN');
      console.log('Can deploy:', result.hasEnough ? 'Yes' : 'No (need 1 SCAMCOIN)');
    }).catch(console.error);
  } else if (args[0] === 'burn') {
    burnToken().then(result => {
      console.log('Burn result:', JSON.stringify(result, null, 2));
    }).catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  node scripts/burn_token.js check  - Check SCAMCOIN balance');
    console.log('  node scripts/burn_token.js burn   - Burn 1 SCAMCOIN');
  }
}

module.exports = { burnToken, checkBurnBalance, BURN_TOKEN_MINT, BURN_AMOUNT };
