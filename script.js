const markets = [
    {
        id: 1,
        question: "Will Bitcoin hit $100k by EOY 2025?",
        volume: "$1.2M",
        yesPrice: 0.65,
        noPrice: 0.35
    },
    {
        id: 2,
        question: "Will Ethereum flip Bitcoin in 2026?",
        volume: "$850k",
        yesPrice: 0.12,
        noPrice: 0.88
    },
    {
        id: 3,
        question: "Will the US approve a Solana ETF in Q1?",
        volume: "$2.4M",
        yesPrice: 0.45,
        noPrice: 0.55
    },
    {
        id: 4,
        question: "Will AI agents replace 50% of coders by 2030?",
        volume: "$500k",
        yesPrice: 0.82,
        noPrice: 0.18
    }
];

document.addEventListener('DOMContentLoaded', () => {
    const marketGrid = document.getElementById('market-grid');
    const connectBtn = document.getElementById('connect-wallet');

    // Render Markets
    if (marketGrid) {
        markets.forEach(market => {
            const card = document.createElement('div');
            card.className = 'market-card';
            card.innerHTML = `
                <div class="market-question">${market.question}</div>
                <div class="market-stats">
                    <span>Vol: ${market.volume}</span>
                    <span>Chance: ${Math.round(market.yesPrice * 100)}%</span>
                </div>
                <div class="market-actions">
                    <button class="btn btn-yes">YES ${market.yesPrice}</button>
                    <button class="btn btn-no">NO ${market.noPrice}</button>
                </div>
            `;
            marketGrid.appendChild(card);
        });
    }

    // Wallet Connect (Phantom)
    const connectWallet = async () => {
        try {
            const { solana } = window;

            if (solana && solana.isPhantom) {
                const response = await solana.connect();
                const pubKey = response.publicKey.toString();

                // Update Button
                connectBtn.innerText = pubKey.slice(0, 4) + '...' + pubKey.slice(-4);
                connectBtn.style.borderColor = "var(--color-primary)";
                connectBtn.style.boxShadow = "0 0 15px rgba(0, 255, 65, 0.3)";

                // Store in session
                sessionStorage.setItem('walletAddress', pubKey);
            } else {
                alert("Phantom wallet not found! Please install it.");
                window.open("https://phantom.app/", "_blank");
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Check if already connected
    const checkConnection = async () => {
        if (sessionStorage.getItem('walletAddress')) {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                try {
                    const response = await solana.connect({ onlyIfTrusted: true });
                    const pubKey = response.publicKey.toString();
                    connectBtn.innerText = pubKey.slice(0, 4) + '...' + pubKey.slice(-4);
                    connectBtn.style.borderColor = "var(--color-primary)";
                    connectBtn.style.boxShadow = "0 0 15px rgba(0, 255, 65, 0.3)";
                } catch (err) {
                    // Not connected or not trusted
                    sessionStorage.removeItem('walletAddress');
                }
            }
        }
    };

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
        // Check connection on load
        window.addEventListener('load', checkConnection);
    }

    // Create Market Form Simulation
    const createForm = document.getElementById('create-market-form');
    if (createForm) {
        createForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Check for wallet connection first
            if (!sessionStorage.getItem('walletAddress')) {
                alert("Please connect your wallet first!");
                return;
            }

            const btn = createForm.querySelector('button[type="submit"]');

            btn.innerText = "DEPLOYING TO SOLANA...";
            btn.style.opacity = "0.7";
            btn.disabled = true;

            setTimeout(() => {
                alert("MARKET CREATED ON-CHAIN! \n(Simulation: Program interaction pending)");
                window.location.href = "index.html";
            }, 2000);
        });
    }
});
