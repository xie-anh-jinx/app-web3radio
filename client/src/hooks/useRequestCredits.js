/**
 * useRequestCredits
 *
 * Manages "request credits" for listeners.
 * Credits are stored in localStorage keyed by wallet address.
 * - 3 credits are granted per successful payment.
 * - Each request consumes 1 credit.
 * - Credits persist until exhausted (no expiry).
 */

const CREDITS_KEY = 'wrRadio_requestCredits';
const CREDITS_PER_PAYMENT = 3;

function getStoredCredits() {
    try {
        const raw = localStorage.getItem(CREDITS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveCredits(credits) {
    try {
        localStorage.setItem(CREDITS_KEY, JSON.stringify(credits));
    } catch { }
}

/** Returns the current credit count for a wallet address (defaults to 0). */
export function getCredits(walletAddress) {
    if (!walletAddress) return 0;
    const all = getStoredCredits();
    return all[walletAddress.toLowerCase()] ?? 0;
}

/** Grant CREDITS_PER_PAYMENT credits to a wallet address after payment. */
export function grantCredits(walletAddress) {
    if (!walletAddress) return 0;
    const all = getStoredCredits();
    const key = walletAddress.toLowerCase();
    all[key] = (all[key] ?? 0) + CREDITS_PER_PAYMENT;
    saveCredits(all);
    return all[key];
}

/** Consume 1 credit. Returns true if successful, false if no credits left. */
export function consumeCredit(walletAddress) {
    if (!walletAddress) return false;
    const all = getStoredCredits();
    const key = walletAddress.toLowerCase();
    const current = all[key] ?? 0;
    if (current <= 0) return false;
    all[key] = current - 1;
    saveCredits(all);
    return true;
}

export const CREDITS_PER_PAYMENT_VALUE = CREDITS_PER_PAYMENT;
