import {
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  BASE_FEE,
  StrKey,
} from '@stellar/stellar-sdk'
import { sign } from './freighter'

export const HORIZON_URL = 'https://horizon-testnet.stellar.org'
export const FRIENDBOT_URL = 'https://friendbot.stellar.org'
export const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx'

const server = new Horizon.Server(HORIZON_URL)

/** Validate a Stellar public key (G...) address. */
export function isValidAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address)
}

/**
 * Fetch the native XLM balance for a public key.
 * Returns null if the account does not exist yet (unfunded).
 */
export async function getBalance(publicKey: string): Promise<string | null> {
  try {
    const account = await server.loadAccount(publicKey)
    const native = account.balances.find((b) => b.asset_type === 'native')
    return native ? native.balance : '0'
  } catch (err: unknown) {
    // Horizon returns 404 for accounts that have never been funded.
    if (isNotFound(err)) return null
    throw err
  }
}

/** Fund an account on testnet via Friendbot. Resolves when funded. */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(publicKey)}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Friendbot funding failed: ${body || res.statusText}`)
  }
}

interface SendParams {
  source: string
  destination: string
  amount: string
  memo?: string
}

/**
 * Build, sign (via Freighter) and submit a native XLM payment on testnet.
 * Returns the transaction hash on success.
 */
export async function sendPayment({ source, destination, amount }: SendParams): Promise<string> {
  const account = await server.loadAccount(source)

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(60)
    .build()

  const signedXdr = await sign(tx.toXDR(), source)

  const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)

  try {
    const result = await server.submitTransaction(signedTx)
    return result.hash
  } catch (err: unknown) {
    throw new Error(parseHorizonError(err))
  }
}

/** True when a Horizon error is a 404 (account not found). */
function isNotFound(err: unknown): boolean {
  const e = err as { response?: { status?: number } }
  return e?.response?.status === 404
}

/** Extract a human-readable message from a Horizon submission error. */
function parseHorizonError(err: unknown): string {
  const e = err as {
    response?: {
      data?: {
        extras?: {
          result_codes?: { transaction?: string; operations?: string[] }
        }
        detail?: string
      }
    }
    message?: string
  }

  const codes = e?.response?.data?.extras?.result_codes
  if (codes) {
    const op = codes.operations?.join(', ')
    const parts = [codes.transaction, op].filter(Boolean)
    if (parts.length) {
      return `Transaction failed: ${parts.join(' / ')}`
    }
  }
  if (e?.response?.data?.detail) return e.response.data.detail
  return e?.message ?? 'Transaction submission failed'
}
