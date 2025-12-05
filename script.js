// Program Configuration
const PROGRAM_ID = "6d5P8J92SyZFc1Cz3EHJzjySTkjzxaJDwizfQQUzXNev";
const IDL = {
    "version": "0.1.0",
    "name": "legacy_solana_program",
    "instructions": [
        {
            "name": "createMarket",
            "accounts": [
                { "name": "market", "isMut": true, "isSigner": true },
                { "name": "creator", "isMut": true, "isSigner": true },
                { "name": "baseMint", "isMut": false, "isSigner": false },
                { "name": "creatorTokenAccount", "isMut": true, "isSigner": false },
                { "name": "escrowTokenAccount", "isMut": true, "isSigner": false },
                { "name": "tokenProgram", "isMut": false, "isSigner": false },
                { "name": "systemProgram", "isMut": false, "isSigner": false },
                { "name": "rent", "isMut": false, "isSigner": false }
            ],
            "args": [
                { "name": "question", "type": "string" },
                { "name": "resolveAt", "type": "i64" },
                { "name": "initialLiquidity", "type": "u64" }
            ]
        }
    ]
};

// State
let walletAddress = null;
let connection = null;

document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-wallet');
    const marketGrid = document.getElementById('market-grid');

    // Initialize Solana Connection
    if (window.solanaWeb3) {
        connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    }

    // --- Wallet Logic ---
    const connectWallet = async () => {
        try {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                const response = await solana.connect();
                walletAddress = response.publicKey.toString();
                updateWalletUI(walletAddress);
                sessionStorage.setItem('walletAddress', walletAddress);
            } else {
                alert("Phantom wallet not found! Please install it.");
                window.open("https://phantom.app/", "_blank");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const updateWalletUI = (pubKey) => {
        if (connectBtn) {
            connectBtn.innerText = pubKey.slice(0, 4) + '...' + pubKey.slice(-4);
            connectBtn.style.borderColor = "var(--color-primary)";
            connectBtn.style.boxShadow = "0 0 15px rgba(0, 255, 65, 0.3)";
        }
    };

    const checkConnection = async () => {
        if (sessionStorage.getItem('walletAddress')) {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                try {
                    const response = await solana.connect({ onlyIfTrusted: true });
                    walletAddress = response.publicKey.toString();
                    updateWalletUI(walletAddress);
                } catch (err) {
                    sessionStorage.removeItem('walletAddress');
                }
            }
        }
    };

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
        window.addEventListener('load', checkConnection);
    }

    // --- Market Creation Logic (Real) ---
    const createForm = document.getElementById('create-market-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!walletAddress) {
                alert("Please connect your wallet first!");
                return;
            }

            const question = document.getElementById('question').value;
            const liquidityInput = document.getElementById('liquidity').value;
            const btn = createForm.querySelector('button[type="submit"]');
            const originalText = btn.innerText;

            try {
                btn.innerText = "BUILDING TX...";
                btn.disabled = true;

                // --- Constants ---
                const BASE_MINT = new solanaWeb3.PublicKey("CSXXfV4qSUJRCbYnk21Wm6mPDZUvYN2aWUjAaxoeViTS");
                const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
                const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
                const SYSVAR_RENT_PUBKEY = new solanaWeb3.PublicKey("SysvarRent111111111111111111111111111111111");

                // --- 1. Setup Keys ---
                const creatorKey = new solanaWeb3.PublicKey(walletAddress);
                const marketKeypair = solanaWeb3.Keypair.generate(); // New address for the market
                const programId = new solanaWeb3.PublicKey(PROGRAM_ID);

                // Derive Escrow PDA: ['escrow', market_pubkey]
                const [escrowTokenAccount] = await solanaWeb3.PublicKey.findProgramAddress(
                    [new TextEncoder().encode("escrow"), marketKeypair.publicKey.toBuffer()],
                    programId
                );

                // Derive Creator's Associated Token Account (ATA) for the Base Mint
                const [creatorTokenAccount] = await solanaWeb3.PublicKey.findProgramAddress(
                    [creatorKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), BASE_MINT.toBuffer()],
                    ASSOCIATED_TOKEN_PROGRAM_ID
                );

                // --- 2. Serialize Instruction Data ---
                // Layout: Discriminator (8) + Question (4+len) + ResolveAt (8) + InitialLiquidity (8)

                const discriminatorHex = "67e261ebc8bcfbfe";
                const discriminator = new Uint8Array(discriminatorHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

                const questionBytes = new TextEncoder().encode(question);
                const resolveAt = Math.floor(Date.now() / 1000) + 604800; // 7 days from now
                const liquidity = new BN(liquidityInput).mul(new BN(1000000000)); // 9 decimals for SPL Token

                // Build Buffer
                const bufferSize = 8 + 4 + questionBytes.length + 8 + 8;
                const data = new Uint8Array(bufferSize);
                let offset = 0;

                // Discriminator
                data.set(discriminator, offset);
                offset += 8;

                // Question String (Borsh: u32 len + bytes)
                // We need to write u32 LE
                new DataView(data.buffer).setUint32(offset, questionBytes.length, true);
                offset += 4;
                data.set(questionBytes, offset);
                offset += questionBytes.length;

                // ResolveAt (i64 LE)
                const resolveAtBN = new BN(resolveAt);
                const resolveAtBuffer = new Uint8Array(resolveAtBN.toArray('le', 8));
                data.set(resolveAtBuffer, offset);
                offset += 8;

                // Initial Liquidity (u64 LE)
                const liquidityBuffer = new Uint8Array(liquidity.toArray('le', 8));
                data.set(liquidityBuffer, offset);
                offset += 8;

                // --- 3. Build Instruction ---
                const instruction = new solanaWeb3.TransactionInstruction({
                    keys: [
                        { pubkey: marketKeypair.publicKey, isSigner: true, isWritable: true }, // market
                        { pubkey: creatorKey, isSigner: true, isWritable: true }, // creator
                        { pubkey: BASE_MINT, isSigner: false, isWritable: false }, // base_mint
                        { pubkey: creatorTokenAccount, isSigner: false, isWritable: true }, // creator_token_account
                        { pubkey: escrowTokenAccount, isSigner: false, isWritable: true }, // escrow_token_account
                        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
                        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
                        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false } // rent
                    ],
                    programId: programId,
                    data: data
                });

                // --- 4. Send Transaction ---
                const transaction = new solanaWeb3.Transaction().add(instruction);
                transaction.feePayer = creatorKey;

                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;

                // Sign with Wallet AND Market Keypair
                transaction.partialSign(marketKeypair);

                const { solana } = window;
                const signed = await solana.signTransaction(transaction);

                btn.innerText = "SENDING...";
                const signature = await connection.sendRawTransaction(signed.serialize());

                btn.innerText = "CONFIRMING...";
                await connection.confirmTransaction(signature);

                alert(`MARKET CREATED! \nSignature: ${signature.slice(0, 8)}...`);
                window.location.href = "index.html";

            } catch (err) {
                console.error(err);
                alert("Transaction Failed: " + err.message);
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- Borsh Schema Definition ---
    class MarketAccount {
        constructor(properties) {
            Object.assign(this, properties);
        }
    }

    const marketSchema = new Map([
        [MarketAccount, {
            kind: 'struct',
            fields: [
                ['creator', [32]], // PublicKey is 32 bytes
                ['question', 'string'],
                ['baseMint', [32]],
                ['yesPoolAmount', 'u64'],
                ['noPoolAmount', 'u64'],
                ['totalYesShares', 'u64'],
                ['totalNoShares', 'u64'],
                ['status', 'u8'], // Enum is usually 1 byte
                ['createdAt', 'i64'],
                ['resolveAt', 'i64'],
                ['resolver', [32]],
                ['feePaid', 'u8'] // bool is u8
            ]
        }]
    ]);

    // --- Fetch and Render Markets ---
    const fetchMarkets = async () => {
        if (!connection || !marketGrid) return;

        try {
            // Clear hardcoded/loading state
            marketGrid.innerHTML = '<div class="loading-spinner">Loading Markets from Solana...</div>';

            console.log("Fetching accounts for program:", PROGRAM_ID);
            const accounts = await connection.getProgramAccounts(new solanaWeb3.PublicKey(PROGRAM_ID));
            console.log("Found accounts:", accounts.length);

            // Filter for Market accounts (check discriminator if strictly needed, but for now assume all are markets)
            // Anchor discriminator for "Market" is sha256("account:Market")[..8]
            // For simplicity in this MVP, we'll try to decode everything.

            const decodedMarkets = [];

            for (const { pubkey, account } of accounts) {
                try {
                    console.log("Processing account:", pubkey.toString(), "Data len:", account.data.length);
                    // Skip 8 byte discriminator
                    const data = account.data.slice(8);

                    // Deserialize
                    const market = borsh.deserialize(marketSchema, MarketAccount, data);
                    console.log("Decoded market:", market);

                    // Calculate Prices
                    const yesPool = new BN(market.yesPoolAmount, 'le'); // Borsh uses BN.js or similar usually, but here we might get raw bytes/arrays depending on library version
                    // Simple approximation for MVP if numbers are small, else need BN library
                    // Let's assume simple numbers for the demo or use a helper

                    // Note: 'u64' in borsh-js usually returns a BN (BigNum) instance or similar.
                    // We'll convert to string/number for display.

                    const yes = parseInt(market.yesPoolAmount.toString());
                    const no = parseInt(market.noPoolAmount.toString());
                    const total = yes + no;

                    let yesPrice = 0.5;
                    if (total > 0) {
                        yesPrice = yes / total;
                    }

                    decodedMarkets.push({
                        id: pubkey.toString(),
                        question: market.question,
                        volume: "Wait...", // Need to fetch token balances for real volume
                        yesPrice: yesPrice.toFixed(2),
                        noPrice: (1 - yesPrice).toFixed(2)
                    });

                } catch (e) {
                    console.log("Failed to decode account:", pubkey.toString(), e);
                }
            }

            console.log("Final decoded markets:", decodedMarkets);
            renderMarkets(decodedMarkets);

        } catch (err) {
            console.error("Error fetching markets:", err);
            marketGrid.innerHTML = `<div class="error">Failed to load markets: ${err.message}</div>`;
        }
    };

    const renderMarkets = (data) => {
        marketGrid.innerHTML = '';

        if (data.length === 0) {
            marketGrid.innerHTML = '<div class="no-markets">No markets found. Create one!</div>';
            return;
        }

        data.forEach(m => {
            const card = document.createElement('div');
            card.className = 'market-card';
            card.innerHTML = `
                <div class="market-question">${m.question}</div>
                <div class="market-stats"><span>Vol: ${m.volume}</span><span>Chance: ${Math.round(m.yesPrice * 100)}%</span></div>
                <div class="market-actions"><button class="btn btn-yes">YES ${m.yesPrice}</button><button class="btn btn-no">NO ${m.noPrice}</button></div>
            `;
            marketGrid.appendChild(card);
        });
    };

    // Initial Load
    fetchMarkets();
});
