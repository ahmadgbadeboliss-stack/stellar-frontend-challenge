import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api'

/**
 * Thin wrapper around @stellar/freighter-api (v6).
 *
 * Note: Freighter has no true "disconnect" API. The app implements
 * disconnect by clearing its own state (see App.tsx). This module only
 * covers detection, connection and signing.
 */

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'

/** Returns true if the Freighter extension is installed and reachable. */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const res = await isConnected()
    if (res.error) return false
    return res.isConnected
  } catch {
    return false
  }
}

/**
 * Connect flow: ensure the app is allowed, then obtain the user's address.
 * Triggers the Freighter popup if access has not yet been granted.
 * Returns the public key on success.
 */
export async function connect(): Promise<string> {
  const allowed = await isAllowed()
  if (allowed.error) throw new Error(allowed.error.message ?? 'Freighter error')

  if (!allowed.isAllowed) {
    const res = await setAllowed()
    if (res.error) throw new Error(res.error.message ?? 'Access to Freighter was denied')
  }

  // requestAccess triggers the approval popup and returns the address.
  const access = await requestAccess()
  if (access.error) throw new Error(access.error.message ?? 'Access to Freighter was denied')
  if (!access.address) throw new Error('No account is selected in Freighter')

  return access.address
}

/** Returns the currently selected public key (assumes already connected). */
export async function getPublicKey(): Promise<string> {
  const res = await getAddress()
  if (res.error) throw new Error(res.error.message ?? 'Could not read address from Freighter')
  return res.address
}

/** Returns the network name (e.g. "TESTNET") and its passphrase. */
export async function getActiveNetwork(): Promise<{ network: string; networkPassphrase: string }> {
  const res = await getNetwork()
  if (res.error) throw new Error(res.error.message ?? 'Could not read network from Freighter')
  return { network: res.network, networkPassphrase: res.networkPassphrase }
}

/** True when Freighter is currently pointed at the Stellar test network. */
export async function isOnTestnet(): Promise<boolean> {
  const { networkPassphrase } = await getActiveNetwork()
  return networkPassphrase === TESTNET_PASSPHRASE
}

/**
 * Ask Freighter to sign a transaction XDR. Returns the signed XDR string.
 */
export async function sign(xdr: string, address: string): Promise<string> {
  const res = await signTransaction(xdr, {
    networkPassphrase: TESTNET_PASSPHRASE,
    address,
  })
  if (res.error) throw new Error(res.error.message ?? 'Transaction signing was rejected')
  return res.signedTxXdr
}
