import { useState, useCallback } from 'react'
import './App.css'
import {
  connect as freighterConnect,
  getActiveNetwork,
  isFreighterInstalled,
  TESTNET_PASSPHRASE,
} from './lib/freighter'
import {
  getBalance,
  sendPayment,
  fundWithFriendbot,
  isValidAddress,
  EXPLORER_TX,
} from './lib/stellar'

type TxState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'success'; hash: string }
  | { status: 'error'; message: string }

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`
}

function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [network, setNetwork] = useState<string | null>(null)
  const [wrongNetwork, setWrongNetwork] = useState(false)

  const [balance, setBalance] = useState<string | null>(null)
  const [unfunded, setUnfunded] = useState(false)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [funding, setFunding] = useState(false)

  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [tx, setTx] = useState<TxState>({ status: 'idle' })

  const refreshBalance = useCallback(async (key: string) => {
    setLoadingBalance(true)
    try {
      const bal = await getBalance(key)
      if (bal === null) {
        setUnfunded(true)
        setBalance(null)
      } else {
        setUnfunded(false)
        setBalance(bal)
      }
    } catch (err) {
      setUnfunded(false)
      setBalance(null)
      console.error('Failed to fetch balance', err)
    } finally {
      setLoadingBalance(false)
    }
  }, [])

  const handleConnect = useCallback(async () => {
    setConnectError(null)
    setConnecting(true)
    try {
      const installed = await isFreighterInstalled()
      if (!installed) {
        setConnectError(
          'Freighter extension not detected. Install it from freighter.app, then reload this page.',
        )
        return
      }

      const key = await freighterConnect()
      const net = await getActiveNetwork()

      setPublicKey(key)
      setNetwork(net.network)
      setWrongNetwork(net.networkPassphrase !== TESTNET_PASSPHRASE)

      await refreshBalance(key)
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect to Freighter')
    } finally {
      setConnecting(false)
    }
  }, [refreshBalance])

  const handleDisconnect = useCallback(() => {
    // Freighter has no disconnect API — we simply clear local app state.
    setPublicKey(null)
    setNetwork(null)
    setWrongNetwork(false)
    setBalance(null)
    setUnfunded(false)
    setDestination('')
    setAmount('')
    setTx({ status: 'idle' })
    setConnectError(null)
  }, [])

  const handleFund = useCallback(async () => {
    if (!publicKey) return
    setFunding(true)
    try {
      await fundWithFriendbot(publicKey)
      await refreshBalance(publicKey)
    } catch (err) {
      console.error(err)
      setConnectError(err instanceof Error ? err.message : 'Friendbot funding failed')
    } finally {
      setFunding(false)
    }
  }, [publicKey, refreshBalance])

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!publicKey) return

      // Client-side validation
      if (!isValidAddress(destination)) {
        setTx({ status: 'error', message: 'Destination is not a valid Stellar address (G...).' })
        return
      }
      if (destination === publicKey) {
        setTx({ status: 'error', message: 'You cannot send XLM to your own address.' })
        return
      }
      const amt = Number(amount)
      if (!amount || Number.isNaN(amt) || amt <= 0) {
        setTx({ status: 'error', message: 'Enter an amount greater than 0.' })
        return
      }
      if (balance !== null && amt > Number(balance)) {
        setTx({ status: 'error', message: 'Amount exceeds your available balance.' })
        return
      }

      setTx({ status: 'sending' })
      try {
        const hash = await sendPayment({ source: publicKey, destination, amount })
        setTx({ status: 'success', hash })
        setAmount('')
        setDestination('')
        await refreshBalance(publicKey)
      } catch (err) {
        setTx({
          status: 'error',
          message: err instanceof Error ? err.message : 'Transaction failed',
        })
      }
    },
    [publicKey, destination, amount, balance, refreshBalance],
  )

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo">✦</span>
          <h1>Stellar Pay</h1>
        </div>
        <span className={`net-badge ${wrongNetwork ? 'net-badge--warn' : ''}`}>
          {network ? network : 'Testnet'}
        </span>
      </header>

      <main className="main">
        <p className="subtitle">
          Send XLM on the Stellar test network with your Freighter wallet.
        </p>

        {/* Connection card */}
        <section className="card">
          <h2>Wallet</h2>
          {!publicKey ? (
            <>
              <p className="muted">Connect your Freighter wallet to get started.</p>
              <button className="btn btn--primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Freighter'}
              </button>
              {connectError && <p className="banner banner--error">{connectError}</p>}
            </>
          ) : (
            <>
              <div className="row">
                <div>
                  <span className="label">Connected account</span>
                  <code className="address" title={publicKey}>
                    {truncate(publicKey)}
                  </code>
                </div>
                <button className="btn btn--ghost" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
              {wrongNetwork && (
                <p className="banner banner--warn">
                  Freighter is not on Testnet. Switch the network to <strong>Testnet</strong> in
                  the Freighter extension.
                </p>
              )}
            </>
          )}
        </section>

        {/* Balance card */}
        {publicKey && (
          <section className="card">
            <div className="row">
              <h2>Balance</h2>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => refreshBalance(publicKey)}
                disabled={loadingBalance}
              >
                {loadingBalance ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>

            {loadingBalance && balance === null && !unfunded ? (
              <p className="muted">Loading…</p>
            ) : unfunded ? (
              <>
                <p className="banner banner--warn">
                  This account isn’t funded on testnet yet.
                </p>
                <button className="btn btn--primary" onClick={handleFund} disabled={funding}>
                  {funding ? 'Funding…' : 'Fund with Friendbot'}
                </button>
              </>
            ) : (
              <p className="balance">
                {balance ?? '0'} <span className="balance-unit">XLM</span>
              </p>
            )}
          </section>
        )}

        {/* Send card */}
        {publicKey && !unfunded && (
          <section className="card">
            <h2>Send XLM</h2>
            <form className="form" onSubmit={handleSend}>
              <label className="field">
                <span className="label">Destination address</span>
                <input
                  type="text"
                  placeholder="G..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value.trim())}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span className="label">Amount (XLM)</span>
                <input
                  type="number"
                  placeholder="0.0"
                  min="0"
                  step="0.0000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={tx.status === 'sending' || wrongNetwork}
              >
                {tx.status === 'sending' ? 'Sending…' : 'Send XLM'}
              </button>
            </form>

            {/* Transaction feedback */}
            {tx.status === 'success' && (
              <div className="banner banner--success">
                <p>
                  <strong>✓ Transaction successful!</strong>
                </p>
                <p className="tx-hash">
                  Hash: <code>{truncate(tx.hash)}</code>
                </p>
                <a
                  href={`${EXPLORER_TX}/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link"
                >
                  View on Stellar Expert ↗
                </a>
              </div>
            )}
            {tx.status === 'error' && (
              <div className="banner banner--error">
                <strong>✗ {tx.message}</strong>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Stellar Testnet · Built with Freighter &amp; stellar-sdk</span>
      </footer>
    </div>
  )
}

export default App
