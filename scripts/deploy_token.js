/**
 * Pump.fun Token Deployment Script
 *
 * A comprehensive script for deploying tokens on Pump.fun using the pumpdotfun-sdk.
 * Includes functions for creating/deploying tokens, selling tokens, and checking balances.
 *
 * Usage:
 *   node scripts/deploy_token.js deploy --name "TokenName" --symbol "TKN" --description "Description" --image "./path/to/image.png" [--devbuy 0.02]
 *   node scripts/deploy_token.js sell --mint <MINT_ADDRESS> [--amount 100] [--percentage]
 *   node scripts/deploy_token.js balance --mint <MINT_ADDRESS>
 *   node scripts/deploy_token.js info --mint <MINT_ADDRESS>
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { AnchorProvider } = require("@coral-xyz/anchor");
const { PumpFunSDK, DEFAULT_DECIMALS } = require("pumpdotfun-sdk");
const { getAssociatedTokenAddress, getAccount } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

// ============================================================================
// Configuration
// ============================================================================

// Default configuration values
const CONFIG = {
  // RPC URL - Using a public Solana mainnet RPC
  // For production, use a premium RPC like Helius, QuickNode, or Triton
  RPC_URL: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",

  // Default wallet path (relative to project root)
  DEFAULT_WALLET_PATH: "./trendtoken-output/wallet.json",

  // Default devbuy amount in SOL (minimum is 0.02 SOL)
  DEFAULT_DEVBUY_SOL: 0.02,

  // Minimum devbuy amount (enforced by Pump.fun)
  MIN_DEVBUY_SOL: 0.02,

  // Default slippage in basis points (500 = 5%)
  DEFAULT_SLIPPAGE_BPS: 500,

  // Default priority fees
  DEFAULT_PRIORITY_FEES: {
    unitLimit: 250000,
    unitPrice: 250000  // in microLamports
  },

  // Transaction commitment level
  COMMITMENT: "finalized",

  // Pump.fun decimals
  TOKEN_DECIMALS: 6
};

// ============================================================================
// Logging Utilities
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLogLevel = LOG_LEVELS.INFO;

function setLogLevel(level) {
  currentLogLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
}

function log(level, message, data = null) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

function logDebug(message, data = null) { log("DEBUG", message, data); }
function logInfo(message, data = null) { log("INFO", message, data); }
function logWarn(message, data = null) { log("WARN", message, data); }
function logError(message, data = null) { log("ERROR", message, data); }

// ============================================================================
// Wallet Utilities
// ============================================================================

/**
 * Load a Keypair from a wallet JSON file
 * @param {string} walletPath - Path to the wallet JSON file
 * @returns {Keypair} - The loaded Keypair
 */
function loadWallet(walletPath) {
  const resolvedPath = path.resolve(walletPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Wallet file not found: ${resolvedPath}`);
  }

  try {
    const walletData = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

    // Handle different wallet formats
    let secretKey;
    if (Array.isArray(walletData)) {
      // Standard Solana CLI format: array of numbers
      secretKey = Uint8Array.from(walletData);
    } else if (walletData.secretKey) {
      // Object format with secretKey property
      secretKey = Uint8Array.from(walletData.secretKey);
    } else if (walletData.privateKey) {
      // Object format with privateKey property (base58)
      const bs58 = require("bs58");
      secretKey = bs58.decode(walletData.privateKey);
    } else {
      throw new Error("Unrecognized wallet format");
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    logInfo(`Loaded wallet: ${keypair.publicKey.toBase58()}`);
    return keypair;

  } catch (error) {
    throw new Error(`Failed to load wallet from ${resolvedPath}: ${error.message}`);
  }
}

/**
 * Create a NodeWallet compatible with AnchorProvider
 */
class NodeWallet {
  constructor(payer) {
    this.payer = payer;
  }

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction(tx) {
    tx.partialSign(this.payer);
    return tx;
  }

  async signAllTransactions(txs) {
    return txs.map((tx) => {
      tx.partialSign(this.payer);
      return tx;
    });
  }
}

// ============================================================================
// SDK Initialization
// ============================================================================

/**
 * Initialize the PumpFunSDK with the given wallet
 * @param {Keypair} walletKeypair - The wallet keypair
 * @param {string} rpcUrl - The RPC URL to use
 * @returns {Object} - { sdk, connection, provider }
 */
function initializeSDK(walletKeypair, rpcUrl = CONFIG.RPC_URL) {
  logDebug(`Connecting to RPC: ${rpcUrl}`);

  const connection = new Connection(rpcUrl, {
    commitment: CONFIG.COMMITMENT,
    confirmTransactionInitialTimeout: 60000
  });

  const wallet = new NodeWallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: CONFIG.COMMITMENT,
    preflightCommitment: CONFIG.COMMITMENT
  });

  const sdk = new PumpFunSDK(provider);

  logInfo("SDK initialized successfully");
  return { sdk, connection, provider };
}

// ============================================================================
// Token Deployment
// ============================================================================

/**
 * Deploy a new token on Pump.fun
 *
 * @param {Object} options - Deployment options
 * @param {string} options.name - Token name
 * @param {string} options.symbol - Token symbol (ticker)
 * @param {string} options.description - Token description
 * @param {string} options.imagePath - Path to the token image file
 * @param {number} options.devbuySol - Amount of SOL for devbuy (default: 0.02)
 * @param {string} options.walletPath - Path to wallet JSON file
 * @param {string} options.twitter - Optional Twitter URL
 * @param {string} options.telegram - Optional Telegram URL
 * @param {string} options.website - Optional Website URL
 * @param {number} options.slippageBps - Slippage in basis points
 * @param {Object} options.priorityFees - Priority fee configuration
 * @returns {Object} - Deployment result
 */
async function deployToken(options) {
  const {
    name,
    symbol,
    description,
    imagePath,
    devbuySol = CONFIG.DEFAULT_DEVBUY_SOL,
    walletPath = CONFIG.DEFAULT_WALLET_PATH,
    twitter = "",
    telegram = "",
    website = "",
    slippageBps = CONFIG.DEFAULT_SLIPPAGE_BPS,
    priorityFees = CONFIG.DEFAULT_PRIORITY_FEES
  } = options;

  logInfo("Starting token deployment...");
  logInfo(`Name: ${name}`);
  logInfo(`Symbol: ${symbol}`);
  logInfo(`Description: ${description.substring(0, 50)}...`);
  logInfo(`DevBuy: ${devbuySol} SOL`);

  // Validate inputs
  if (!name || name.length === 0) {
    throw new Error("Token name is required");
  }
  if (!symbol || symbol.length === 0) {
    throw new Error("Token symbol is required");
  }
  if (!description || description.length === 0) {
    throw new Error("Token description is required");
  }
  if (!imagePath) {
    throw new Error("Image path is required");
  }
  if (devbuySol < CONFIG.MIN_DEVBUY_SOL) {
    throw new Error(`DevBuy must be at least ${CONFIG.MIN_DEVBUY_SOL} SOL`);
  }

  // Load wallet
  const walletKeypair = loadWallet(walletPath);

  // Initialize SDK
  const { sdk, connection } = initializeSDK(walletKeypair);

  // Check wallet balance
  const balance = await connection.getBalance(walletKeypair.publicKey);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  logInfo(`Wallet balance: ${balanceSol.toFixed(4)} SOL`);

  // Estimate required balance (devbuy + fees + rent)
  const estimatedRequired = devbuySol + 0.05; // Add buffer for fees
  if (balanceSol < estimatedRequired) {
    throw new Error(`Insufficient balance. Need ~${estimatedRequired.toFixed(3)} SOL, have ${balanceSol.toFixed(4)} SOL`);
  }

  // Load image file
  const resolvedImagePath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedImagePath)) {
    throw new Error(`Image file not found: ${resolvedImagePath}`);
  }

  const imageBuffer = fs.readFileSync(resolvedImagePath);
  const mimeType = getMimeType(resolvedImagePath);
  const imageBlob = new Blob([imageBuffer], { type: mimeType });

  logInfo(`Image loaded: ${resolvedImagePath} (${(imageBuffer.length / 1024).toFixed(2)} KB)`);

  // Create token metadata
  const createTokenMetadata = {
    name,
    symbol,
    description,
    file: imageBlob,
    twitter,
    telegram,
    website
  };

  // Generate a new mint keypair for the token
  const mintKeypair = Keypair.generate();
  logInfo(`Generated mint address: ${mintKeypair.publicKey.toBase58()}`);

  // Convert devbuy to lamports (bigint)
  const devbuyLamports = BigInt(Math.floor(devbuySol * LAMPORTS_PER_SOL));

  // Execute deployment
  logInfo("Submitting transaction to Pump.fun...");

  try {
    const result = await sdk.createAndBuy(
      walletKeypair,
      mintKeypair,
      createTokenMetadata,
      devbuyLamports,
      BigInt(slippageBps),
      priorityFees,
      CONFIG.COMMITMENT,
      CONFIG.COMMITMENT
    );

    if (result.success) {
      logInfo("Token deployed successfully!");
      logInfo(`Mint Address: ${mintKeypair.publicKey.toBase58()}`);
      logInfo(`Transaction: https://solscan.io/tx/${result.signature}`);
      logInfo(`Pump.fun: https://pump.fun/${mintKeypair.publicKey.toBase58()}`);

      return {
        success: true,
        mintAddress: mintKeypair.publicKey.toBase58(),
        signature: result.signature,
        pumpFunUrl: `https://pump.fun/${mintKeypair.publicKey.toBase58()}`,
        solscanUrl: `https://solscan.io/tx/${result.signature}`
      };
    } else {
      logError("Deployment failed:", result.error);
      return {
        success: false,
        error: result.error
      };
    }

  } catch (error) {
    logError("Deployment error:", error.message);
    throw error;
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  return mimeTypes[ext] || "image/png";
}

// ============================================================================
// Token Selling
// ============================================================================

/**
 * Sell tokens on Pump.fun
 *
 * @param {Object} options - Sell options
 * @param {string} options.mintAddress - Token mint address
 * @param {number} options.amount - Amount to sell (in tokens or percentage)
 * @param {boolean} options.isPercentage - If true, amount is treated as percentage
 * @param {string} options.walletPath - Path to wallet JSON file
 * @param {number} options.slippageBps - Slippage in basis points
 * @param {Object} options.priorityFees - Priority fee configuration
 * @returns {Object} - Sell result
 */
async function sellTokens(options) {
  const {
    mintAddress,
    amount = 100,
    isPercentage = true,
    walletPath = CONFIG.DEFAULT_WALLET_PATH,
    slippageBps = CONFIG.DEFAULT_SLIPPAGE_BPS,
    priorityFees = CONFIG.DEFAULT_PRIORITY_FEES
  } = options;

  logInfo("Starting token sell...");
  logInfo(`Mint: ${mintAddress}`);
  logInfo(`Amount: ${amount}${isPercentage ? "%" : " tokens"}`);

  // Validate mint address
  let mint;
  try {
    mint = new PublicKey(mintAddress);
  } catch (error) {
    throw new Error(`Invalid mint address: ${mintAddress}`);
  }

  // Load wallet
  const walletKeypair = loadWallet(walletPath);

  // Initialize SDK
  const { sdk, connection } = initializeSDK(walletKeypair);

  // Get current token balance
  const currentBalance = await getTokenBalance(connection, mint, walletKeypair.publicKey);

  if (currentBalance <= 0) {
    throw new Error("No tokens to sell");
  }

  logInfo(`Current balance: ${currentBalance.toLocaleString()} tokens`);

  // Calculate sell amount
  let sellAmount;
  if (isPercentage) {
    sellAmount = currentBalance * (amount / 100);
    logInfo(`Selling ${amount}%: ${sellAmount.toLocaleString()} tokens`);
  } else {
    sellAmount = amount;
    if (sellAmount > currentBalance) {
      throw new Error(`Insufficient balance. Have ${currentBalance}, want to sell ${sellAmount}`);
    }
  }

  // Convert to raw amount (with decimals)
  const sellAmountRaw = BigInt(Math.floor(sellAmount * Math.pow(10, CONFIG.TOKEN_DECIMALS)));

  // Execute sell
  logInfo("Submitting sell transaction...");

  try {
    const result = await sdk.sell(
      walletKeypair,
      mint,
      sellAmountRaw,
      BigInt(slippageBps),
      priorityFees,
      CONFIG.COMMITMENT,
      CONFIG.COMMITMENT
    );

    if (result.success) {
      logInfo("Sell successful!");
      logInfo(`Transaction: https://solscan.io/tx/${result.signature}`);

      // Get new balance
      const newBalance = await getTokenBalance(connection, mint, walletKeypair.publicKey);
      logInfo(`New balance: ${newBalance.toLocaleString()} tokens`);

      return {
        success: true,
        signature: result.signature,
        soldAmount: sellAmount,
        remainingBalance: newBalance,
        solscanUrl: `https://solscan.io/tx/${result.signature}`
      };
    } else {
      logError("Sell failed:", result.error);
      return {
        success: false,
        error: result.error
      };
    }

  } catch (error) {
    logError("Sell error:", error.message);
    throw error;
  }
}

// ============================================================================
// Balance Checking
// ============================================================================

/**
 * Get token balance for a wallet
 *
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} mint - Token mint address
 * @param {PublicKey} owner - Wallet address
 * @returns {number} - Token balance (in UI units, not raw)
 */
async function getTokenBalance(connection, mint, owner) {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const account = await getAccount(connection, ata);
    return Number(account.amount) / Math.pow(10, CONFIG.TOKEN_DECIMALS);
  } catch (error) {
    // Token account doesn't exist
    return 0;
  }
}

/**
 * Check token balance via CLI
 *
 * @param {Object} options - Options
 * @param {string} options.mintAddress - Token mint address
 * @param {string} options.walletPath - Path to wallet JSON file
 * @returns {Object} - Balance information
 */
async function checkBalance(options) {
  const {
    mintAddress,
    walletPath = CONFIG.DEFAULT_WALLET_PATH
  } = options;

  logInfo(`Checking balance for mint: ${mintAddress}`);

  // Validate mint address
  let mint;
  try {
    mint = new PublicKey(mintAddress);
  } catch (error) {
    throw new Error(`Invalid mint address: ${mintAddress}`);
  }

  // Load wallet
  const walletKeypair = loadWallet(walletPath);

  // Initialize connection
  const connection = new Connection(CONFIG.RPC_URL, CONFIG.COMMITMENT);

  // Get SOL balance
  const solBalance = await connection.getBalance(walletKeypair.publicKey);
  const solBalanceUI = solBalance / LAMPORTS_PER_SOL;

  // Get token balance
  const tokenBalance = await getTokenBalance(connection, mint, walletKeypair.publicKey);

  logInfo(`Wallet: ${walletKeypair.publicKey.toBase58()}`);
  logInfo(`SOL Balance: ${solBalanceUI.toFixed(4)} SOL`);
  logInfo(`Token Balance: ${tokenBalance.toLocaleString()} tokens`);

  return {
    wallet: walletKeypair.publicKey.toBase58(),
    solBalance: solBalanceUI,
    tokenBalance,
    mintAddress
  };
}

// ============================================================================
// Token Info
// ============================================================================

/**
 * Get token information from the bonding curve
 *
 * @param {Object} options - Options
 * @param {string} options.mintAddress - Token mint address
 * @returns {Object} - Token information
 */
async function getTokenInfo(options) {
  const { mintAddress } = options;

  logInfo(`Getting info for mint: ${mintAddress}`);

  // Validate mint address
  let mint;
  try {
    mint = new PublicKey(mintAddress);
  } catch (error) {
    throw new Error(`Invalid mint address: ${mintAddress}`);
  }

  // Initialize connection and SDK (using a dummy wallet for read-only operations)
  const connection = new Connection(CONFIG.RPC_URL, CONFIG.COMMITMENT);
  const dummyKeypair = Keypair.generate();
  const { sdk } = initializeSDK(dummyKeypair);

  // Get bonding curve account
  const bondingCurve = await sdk.getBondingCurveAccount(mint);

  if (!bondingCurve) {
    logWarn("Bonding curve not found - token may have graduated to Raydium");
    return {
      mintAddress,
      graduated: true,
      message: "Token has graduated to Raydium AMM"
    };
  }

  // Calculate price from bonding curve reserves
  const virtualSolReserves = Number(bondingCurve.virtualSolReserves) / LAMPORTS_PER_SOL;
  const virtualTokenReserves = Number(bondingCurve.virtualTokenReserves) / Math.pow(10, CONFIG.TOKEN_DECIMALS);
  const price = virtualSolReserves / virtualTokenReserves;

  // Calculate bonding progress
  const INITIAL_REAL_TOKEN_RESERVES = 793100000000000n;
  const realTokenReserves = bondingCurve.realTokenReserves;
  const progress = 1 - (Number(realTokenReserves * 10000n / INITIAL_REAL_TOKEN_RESERVES) / 10000);

  logInfo(`Mint Address: ${mintAddress}`);
  logInfo(`Current Price: ${price.toFixed(12)} SOL per token`);
  logInfo(`Virtual SOL Reserves: ${virtualSolReserves.toFixed(4)} SOL`);
  logInfo(`Virtual Token Reserves: ${virtualTokenReserves.toLocaleString()} tokens`);
  logInfo(`Bonding Progress: ${(progress * 100).toFixed(2)}%`);
  logInfo(`Completed: ${bondingCurve.complete}`);

  return {
    mintAddress,
    price,
    priceFormatted: `${price.toFixed(12)} SOL`,
    virtualSolReserves,
    virtualTokenReserves,
    bondingProgress: progress,
    bondingProgressPercent: `${(progress * 100).toFixed(2)}%`,
    complete: bondingCurve.complete,
    graduated: bondingCurve.complete,
    pumpFunUrl: `https://pump.fun/${mintAddress}`
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const parsed = {
    command: null,
    options: {}
  };

  // First argument is the command
  if (args.length > 0 && !args[0].startsWith("--")) {
    parsed.command = args[0];
    args = args.slice(1);
  }

  // Parse remaining arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      // Check if next arg is a value or another flag
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed.options[key] = args[i + 1];
        i++;
      } else {
        // Boolean flag
        parsed.options[key] = true;
      }
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Pump.fun Token Deployment Script
================================

Usage:
  node deploy_token.js <command> [options]

Commands:
  deploy    Deploy a new token on Pump.fun
  sell      Sell tokens
  balance   Check token balance
  info      Get token information

Deploy Options:
  --name <name>           Token name (required)
  --symbol <symbol>       Token symbol/ticker (required)
  --description <desc>    Token description (required)
  --image <path>          Path to image file (required)
  --devbuy <amount>       DevBuy amount in SOL (default: 0.02, min: 0.02)
  --wallet <path>         Path to wallet JSON (default: ./trendtoken-output/wallet.json)
  --twitter <url>         Twitter URL (optional)
  --telegram <url>        Telegram URL (optional)
  --website <url>         Website URL (optional)
  --slippage <bps>        Slippage in basis points (default: 500 = 5%)

Sell Options:
  --mint <address>        Token mint address (required)
  --amount <amount>       Amount to sell (default: 100)
  --percentage            Treat amount as percentage (default: true)
  --tokens                Treat amount as token count
  --wallet <path>         Path to wallet JSON
  --slippage <bps>        Slippage in basis points

Balance Options:
  --mint <address>        Token mint address (required)
  --wallet <path>         Path to wallet JSON

Info Options:
  --mint <address>        Token mint address (required)

Examples:
  # Deploy a new token with minimum devbuy
  node deploy_token.js deploy \\
    --name "My Meme Token" \\
    --symbol "MEME" \\
    --description "The best meme token on Solana!" \\
    --image "./images/meme.png"

  # Deploy with custom devbuy
  node deploy_token.js deploy \\
    --name "Doge 2.0" \\
    --symbol "DOGE2" \\
    --description "Much wow, very token" \\
    --image "./doge.png" \\
    --devbuy 0.5

  # Sell 50% of holdings
  node deploy_token.js sell --mint <MINT_ADDRESS> --amount 50 --percentage

  # Sell specific amount of tokens
  node deploy_token.js sell --mint <MINT_ADDRESS> --amount 1000000 --tokens

  # Check balance
  node deploy_token.js balance --mint <MINT_ADDRESS>

  # Get token info
  node deploy_token.js info --mint <MINT_ADDRESS>
`);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const { command, options } = parseArgs(args);

  // Enable debug logging if requested
  if (options.debug) {
    setLogLevel("DEBUG");
  }

  try {
    switch (command) {
      case "deploy": {
        // Validate required options
        if (!options.name) throw new Error("--name is required");
        if (!options.symbol) throw new Error("--symbol is required");
        if (!options.description) throw new Error("--description is required");
        if (!options.image) throw new Error("--image is required");

        const result = await deployToken({
          name: options.name,
          symbol: options.symbol,
          description: options.description,
          imagePath: options.image,
          devbuySol: options.devbuy ? parseFloat(options.devbuy) : CONFIG.DEFAULT_DEVBUY_SOL,
          walletPath: options.wallet || CONFIG.DEFAULT_WALLET_PATH,
          twitter: options.twitter || "",
          telegram: options.telegram || "",
          website: options.website || "",
          slippageBps: options.slippage ? parseInt(options.slippage) : CONFIG.DEFAULT_SLIPPAGE_BPS
        });

        console.log("\nDeployment Result:");
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "sell": {
        if (!options.mint) throw new Error("--mint is required");

        const result = await sellTokens({
          mintAddress: options.mint,
          amount: options.amount ? parseFloat(options.amount) : 100,
          isPercentage: !options.tokens,
          walletPath: options.wallet || CONFIG.DEFAULT_WALLET_PATH,
          slippageBps: options.slippage ? parseInt(options.slippage) : CONFIG.DEFAULT_SLIPPAGE_BPS
        });

        console.log("\nSell Result:");
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "balance": {
        if (!options.mint) throw new Error("--mint is required");

        const result = await checkBalance({
          mintAddress: options.mint,
          walletPath: options.wallet || CONFIG.DEFAULT_WALLET_PATH
        });

        console.log("\nBalance:");
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "info": {
        if (!options.mint) throw new Error("--mint is required");

        const result = await getTokenInfo({
          mintAddress: options.mint
        });

        console.log("\nToken Info:");
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        logError(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }

  } catch (error) {
    logError("Error:", error.message);
    if (options.debug) {
      console.error(error);
    }
    process.exit(1);
  }
}

// ============================================================================
// Module Exports (for programmatic use)
// ============================================================================

module.exports = {
  deployToken,
  sellTokens,
  checkBalance,
  getTokenInfo,
  getTokenBalance,
  loadWallet,
  initializeSDK,
  CONFIG
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch((error) => {
    logError("Fatal error:", error.message);
    process.exit(1);
  });
}
