import React, { useState, useEffect } from 'react';
import { X, Wallet, CreditCard, Loader2, CheckCircle2, AlertCircle, Coins, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppKit, useAppKitProvider, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import { BrowserProvider, parseEther, Contract, parseUnits } from 'ethers';
import { grantCredits } from '../../hooks/useRequestCredits';

const SOLANA_RECEIVER = '9xhz4Cb4C2Z4z9xdD2geCafovNYVngC4E4XpWtQmeEuv';
const EVM_RECEIVER = '0x242dfb7849544ee242b2265ca7e585bdec60456b';

// Initial fallback prices per 1 IDR (1 / TokenPriceInIDR)
const DEFAULT_PRICES = {
    ETH: 1 / 38000000,
    BNB: 1 / 10500000,
    POL: 1 / 6000,
    AVAX: 1 / 155000,
    SOL: 1 / 1400000,
    USDC: 1 / 15500,
    USDT: 1 / 15500,
};

const CHAIN_NATIVE_MAP = {
    1: 'ETH',      
    10: 'ETH',     
    56: 'BNB',     
    137: 'POL',    
    42161: 'ETH',  
    324: 'ETH',    
    8453: 'ETH',   
    43114: 'AVAX', 
};

const STABLECOINS = {
    solana: {
        USDC: { symbol: 'USDC', decimals: 6, address: '4zMMC9srtvS2neS6WdG3QhKAn9P6D9zXPy6XpWyvYU6' },
        USDT: { symbol: 'USDT', decimals: 6, address: 'EJwZgeZveJvxic7gWDe9Sckat8S8wX9uxyR3Sqi7pAnN' },
    },
    evm: {
        USDC: { symbol: 'USDC', decimals: 6, address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
        USDT: { symbol: 'USDT', decimals: 6, address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0' },
    }
};

const ERC20_ABI = ["function transfer(address to, uint256 amount) public returns (bool)"];

export default function RequestPaymentModal({ isOpen, onClose, onPaymentSuccess, songTitle }) {
    const { open } = useAppKit();
    const { address, isConnected, chainId: accountChainId } = useAppKitAccount();
    const { caipNetwork } = useAppKitNetwork();
    const chainId = caipNetwork?.id || accountChainId;

    const [nativePrices, setNativePrices] = useState(DEFAULT_PRICES);

    useEffect(() => {
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,polygon-ecosystem-token,avalanche-2,solana,usd-coin,tether&vs_currencies=idr')
            .then(res => res.json())
            .then(data => {
                setNativePrices({
                    ETH: 1 / (data.ethereum?.idr || 38000000),
                    BNB: 1 / (data.binancecoin?.idr || 10500000),
                    POL: 1 / (data['polygon-ecosystem-token']?.idr || 6000),
                    AVAX: 1 / (data['avalanche-2']?.idr || 155000),
                    SOL: 1 / (data.solana?.idr || 1400000),
                    USDC: 1 / (data['usd-coin']?.idr || 15500),
                    USDT: 1 / (data.tether?.idr || 15500),
                });
            }).catch(e => console.log('Rates fetch error:', e));
    }, []);

    const [paymentMethod, setPaymentMethod] = useState('fiat'); // 'fiat' or 'crypto'
    const [selectedNetwork, setSelectedNetwork] = useState('solana');
    const [selectedCurrency, setSelectedCurrency] = useState('NATIVE');
    const { walletProvider } = useAppKitProvider(selectedNetwork === 'solana' ? 'solana' : 'eip155');

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, processing, success, error
    const [error, setError] = useState(null);

    // Sync selected network with connected network on mount or connection change
    useEffect(() => {
        if (isConnected && address) {
            const detected = address?.toString().startsWith('0x') ? 'evm' : 'solana';
            setSelectedNetwork(detected);
            setSelectedCurrency('NATIVE');
            setPaymentMethod('crypto');
        }
    }, [isConnected, address]);

    const isSolana = chainId?.toString().toLowerCase().includes('solana') || (address && !address?.toString().startsWith('0x'));
    const isEVM = chainId?.toString().toLowerCase().includes('eip155') || (address && address?.toString().startsWith('0x'));

    // Resolve current native token for EVM
    const numericChainId = isEVM ? (chainId?.toString().startsWith('eip155:') ? parseInt(chainId.toString().split(':')[1]) : parseInt(chainId)) : null;
    const currentNativeSymbol = isSolana ? 'SOL' : (CHAIN_NATIVE_MAP[numericChainId] || 'ETH');

    let tokenInfo;
    if (selectedCurrency === 'NATIVE') {
        tokenInfo = {
            symbol: currentNativeSymbol,
            decimals: isSolana ? 9 : 18,
            price: nativePrices[currentNativeSymbol]
        };
    } else {
        tokenInfo = {
            ...STABLECOINS[selectedNetwork]?.[selectedCurrency],
            price: nativePrices[selectedCurrency]
        };
    }
    const cryptoAmount = 1200 * (tokenInfo?.price || 0);

    const isCorrectNetwork = (selectedNetwork === 'solana' && isSolana) ||
        (selectedNetwork === 'evm' && isEVM);

    const handlePayment = async () => {
        if (!isConnected) {
            open({ view: 'Connect' });
            return;
        }

        if (!isCorrectNetwork) {
            open({ view: 'Networks' });
            return;
        }

        if (!walletProvider) {
            setError('Wallet provider not found. Please try reconnecting.');
            setStatus('error');
            return;
        }

        setLoading(true);
        setStatus('processing');
        setError(null);

        try {
            if (selectedNetwork === 'solana') {
                const chainIdStr = chainId?.toString() || '';
                const isDevnet = chainIdStr.toLowerCase().includes('devnet') ||
                    chainIdStr.includes('EtWTR') ||
                    selectedNetwork === 'solana'; // Force devnet for testing if on Solana tab

                const rpcUrl = isDevnet ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
                const connection = new Connection(rpcUrl, "confirmed");

                // Get the latest blockhash
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

                const amountRaw = Math.floor(cryptoAmount * Math.pow(10, tokenInfo.decimals));

                if (selectedCurrency === 'NATIVE') {
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: new PublicKey(address),
                            toPubkey: new PublicKey(SOLANA_RECEIVER),
                            lamports: amountRaw,
                        })
                    );
                } else {
                    // SLP Token Transfer
                    const mint = new PublicKey(tokenInfo.address);
                    const fromPubkey = new PublicKey(address);
                    const toPubkey = new PublicKey(SOLANA_RECEIVER);

                    const fromAta = await getAssociatedTokenAddress(mint, fromPubkey);
                    const toAta = await getAssociatedTokenAddress(mint, toPubkey);

                    try {
                        await getAccount(connection, toAta);
                    } catch (e) {
                        transaction.add(
                            createAssociatedTokenAccountInstruction(fromPubkey, toAta, toPubkey, mint)
                        );
                    }

                    transaction.add(
                        createTransferCheckedInstruction(fromAta, mint, toAta, fromPubkey, amountRaw, tokenInfo.decimals)
                    );
                }

                transaction.recentBlockhash = blockhash;
                transaction.feePayer = new PublicKey(address);

                const result = await walletProvider.signAndSendTransaction(transaction);
                const signature = typeof result === 'string' ? result : result?.signature;

                if (!signature) throw new Error('Failed to obtain transaction signature');

                // Wait for confirmation using the latest strategy
                const confirmation = await connection.confirmTransaction({
                    signature,
                    blockhash,
                    lastValidBlockHeight
                }, 'confirmed');

                if (confirmation.value.err) throw new Error('Transaction failed to confirm');
            } else {
                // EVM Transaction
                const provider = new BrowserProvider(walletProvider);
                const signer = await provider.getSigner();

                if (selectedCurrency === 'NATIVE') {
                    const tx = await signer.sendTransaction({
                        to: EVM_RECEIVER,
                        value: parseEther(cryptoAmount.toFixed(18)) // Ensure precision
                    });
                    await tx.wait();
                } else {
                    const tokenContract = new Contract(tokenInfo.address, ERC20_ABI, signer);
                    const amountRaw = parseUnits(cryptoAmount.toFixed(tokenInfo.decimals), tokenInfo.decimals);
                    const tx = await tokenContract.transfer(EVM_RECEIVER, amountRaw);
                    await tx.wait();
                }
            }

            setStatus('success');
            
            // Grant 3 credits to the user's wallet
            if (address) {
                const newCredits = grantCredits(address);
                console.log(`[Payment] Granted credits to ${address}. New balance: ${newCredits}`);
            }

            setTimeout(() => {
                onPaymentSuccess();
                onClose();
            }, 2000);
        } catch (err) {
            console.error('Payment failed', err);
            // Handle common wallet errors
            let msg = err.message || 'Transaction failed';
            if (msg.includes('user rejected')) msg = 'Transaction rejected by user';
            setError(msg);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
                    >
                        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
                            <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                                <CreditCard className="w-5 h-5 text-fuchsia-500" /> Confirm Request
                            </h3>
                            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-8 text-center overflow-y-auto flex-1 custom-scrollbar">
                            {status === 'success' ? (
                                <div className="space-y-4 py-4">
                                    <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <h4 className="text-xl font-bold text-white">Payment Successful</h4>
                                    <p className="text-zinc-400 text-sm">Your request for <strong>{songTitle}</strong> has been added to the queue.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex bg-zinc-950 rounded-xl p-1 mb-6 border border-zinc-800">
                                        <button
                                            onClick={() => setPaymentMethod('fiat')}
                                            className={`flex-1 py-3 px-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all text-center ${paymentMethod === 'fiat' ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            Top Up / Swap
                                        </button>
                                        <button
                                            onClick={() => setPaymentMethod('crypto')}
                                            className={`flex-1 py-3 px-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all text-center ${paymentMethod === 'crypto' ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        >
                                            Web3 Wallet
                                        </button>
                                    </div>

                                    {paymentMethod === 'fiat' ? (
                                        <div className="flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4 mb-4">
                                            <div className="w-16 h-16 bg-fuchsia-600/20 rounded-full flex items-center justify-center border border-fuchsia-500/30">
                                                <Wallet className="w-8 h-8 text-fuchsia-400" />
                                            </div>
                                            <div className="text-center space-y-2">
                                                <h4 className="text-lg font-bold text-white">Buy & Swap Crypto</h4>
                                                <p className="text-xs text-zinc-400 max-w-sm">
                                                    Use Reown's built-in tools to top up your wallet directly using Fiat (Card/Bank) or Swap between different tokens. After you have the desired crypto, switch to the <strong>Web3 Wallet</strong> tab to send the payment.
                                                </p>
                                            </div>
                                            <div className="flex gap-3 w-full mt-2">
                                                <button 
                                                    onClick={() => open({ view: 'OnRampProviders' })}
                                                    className="flex-1 py-3 rounded-xl bg-white text-black font-black hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center shadow-xl"
                                                >
                                                    Buy Crypto
                                                </button>
                                                <button 
                                                    onClick={() => open({ view: 'Swap' })}
                                                    className="flex-1 py-3 rounded-xl bg-zinc-800 text-white font-black border border-zinc-700 hover:bg-zinc-700 active:scale-[0.98] transition-all flex items-center justify-center shadow-xl"
                                                >
                                                    Swap Tokens
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Network Selection Tabs */}
                                            <div className="flex p-1 bg-zinc-950 rounded-lg mb-6 border border-zinc-800">
                                                <button
                                                    onClick={() => setSelectedNetwork('solana')}
                                                    className={`flex-1 py-2 px-4 rounded-md text-xs font-bold transition-all ${selectedNetwork === 'solana' ? 'bg-zinc-800 text-fuchsia-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                                >
                                                    Solana
                                                </button>
                                                <button
                                                    onClick={() => setSelectedNetwork('evm')}
                                                    className={`flex-1 py-2 px-4 rounded-md text-xs font-bold transition-all ${selectedNetwork === 'evm' ? 'bg-zinc-800 text-fuchsia-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                                >
                                                    EVM (ETH, Base, BSC...)
                                                </button>
                                            </div>

                                            <div className="mb-6">
                                                <div className="w-16 h-16 bg-fuchsia-600/10 text-fuchsia-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <Coins className="w-8 h-8" />
                                                </div>
                                                <h4 className="text-white font-bold text-xl">1,200 IDR</h4>
                                                <p className="text-zinc-500 text-sm mt-1 mb-6 uppercase tracking-widest font-semibold">Request Fee</p>
                                                
                                                <div className="grid grid-cols-3 gap-2">
                                                    <button
                                                        key="NATIVE"
                                                        onClick={() => setSelectedCurrency('NATIVE')}
                                                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${selectedCurrency === 'NATIVE' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                                                    >
                                                        {currentNativeSymbol}
                                                    </button>
                                                    {Object.keys(STABLECOINS[selectedNetwork]).map(curr => (
                                                        <button
                                                            key={curr}
                                                            onClick={() => setSelectedCurrency(curr)}
                                                            className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${selectedCurrency === curr ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                                                        >
                                                            {curr}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 mb-8 text-left">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-zinc-500 text-xs">Track</span>
                                                    <span className="text-white text-sm font-semibold truncate ml-4">{songTitle}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-zinc-500 text-xs">Payment Token</span>
                                                    <span className="text-white text-sm font-bold flex items-center gap-1">
                                                        {selectedCurrency === 'NATIVE' ? `${currentNativeSymbol} (Native)` : selectedCurrency}
                                                    </span>
                                                </div>
                                                <div className="mt-3 pt-3 border-t border-zinc-800/50 flex justify-between items-center">
                                                    <span className="text-zinc-400 text-sm font-bold">Price</span>
                                                    <span className="text-fuchsia-400 font-mono font-bold">
                                                        {cryptoAmount.toPrecision(4)} {selectedCurrency === 'NATIVE' ? currentNativeSymbol : selectedCurrency}
                                                    </span>
                                                </div>
                                            </div>

                                            {status === 'error' && (
                                                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-sm text-left">
                                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                                    <span>{error}</span>
                                                </div>
                                            )}

                                            <button
                                                onClick={handlePayment}
                                                disabled={loading}
                                                className="w-full py-4 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-violet-600 text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 shadow-lg shadow-fuchsia-900/20"
                                            >
                                                {loading ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        <span>Confirming...</span>
                                                    </>
                                                ) : !isConnected ? (
                                                    <>
                                                        <Wallet className="w-5 h-5" />
                                                        <span>Connect Wallet</span>
                                                    </>
                                                ) : !isCorrectNetwork ? (
                                                    <>
                                                        <RefreshCw className="w-5 h-5" />
                                                        <span>Switch to {selectedNetwork.toUpperCase()}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CreditCard className="w-5 h-5" />
                                                        <span>Pay & Request</span>
                                                    </>
                                                )}
                                            </button>

                                            {isConnected && !isCorrectNetwork && (
                                                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 text-[11px] font-bold text-center leading-relaxed">
                                                    <div className="flex items-center justify-center gap-2 mb-1 uppercase tracking-wider">
                                                        <AlertCircle className="w-3.5 h-3.5" /> Wrong Network
                                                    </div>
                                                    Please open your wallet and manually switch to <span className="underline">{selectedNetwork === 'solana' ? 'Solana' : 'an EVM Chain'}</span> to continue.
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="p-4 bg-zinc-950/50 text-center border-t border-zinc-800">
                            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Secured by Web3Radio v2</p>
                            {isConnected && (
                                <p className="text-[8px] text-zinc-700 opacity-50 mt-1 break-all">
                                    DEBUG: {chainId || 'no-chain'} | net: {selectedNetwork} | match: {isCorrectNetwork ? 'OK' : 'WRONG'} | numChain: {numericChainId} | symb: {currentNativeSymbol}
                                </p>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

// Helper for UI icons not imported
function RefreshCw(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
        </svg>
    )
}
