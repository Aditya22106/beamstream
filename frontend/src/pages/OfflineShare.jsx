/**
 * OfflineShare.jsx
 *
 * WebRTC peer-to-peer file transfer.
 * Works between any two browsers on the same network:
 *   Android Chrome ↔ iOS Safari
 *   Windows Chrome ↔ Mac Safari
 *   Any browser ↔ Any browser
 *
 * Flow:
 *   SENDER  — picks file → creates WebRTC offer → stores on server → shows PIN
 *   RECEIVER — enters PIN → fetches offer → creates answer → P2P connection
 *   FILE    — transfers directly browser↔browser, no cloud, no server
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import api from '../api/axios'
import { formatSize } from '../utils/helpers'
import {
  Wifi, WifiOff, Upload, Download, Copy,
  CheckCircle, AlertCircle, ArrowRight, X,
  Smartphone, Monitor, RefreshCw,
} from 'lucide-react'

// ── STUN servers (Google's free public STUN servers) ──────────────────────
// STUN helps devices discover their public IP and punch through NAT
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
}

// Chunk size for file transfer — 64KB per chunk
const CHUNK_SIZE = 64 * 1024

export default function OfflineShare() {
  const [mode,       setMode]       = useState(null)     // 'send' | 'receive'
  const [step,       setStep]       = useState('idle')   // idle|creating|waiting|connected|transferring|done|error
  const [pin,        setPin]        = useState('')
  const [inputPin,   setInputPin]   = useState('')
  const [file,       setFile]       = useState(null)
  const [progress,   setProgress]   = useState(0)
  const [speed,      setSpeed]      = useState(0)
  const [received,   setReceived]   = useState(null)     // { name, size, blob }
  const [statusMsg,  setStatusMsg]  = useState('')
  const [error,      setError]      = useState('')
  const [senderName, setSenderName] = useState('')
  const [copied,     setCopied]     = useState(false)

  // WebRTC refs
  const pcRef        = useRef(null)   // RTCPeerConnection
  const dcRef        = useRef(null)   // RTCDataChannel
  const pollRef      = useRef(null)   // polling interval
  const chunksRef    = useRef([])     // received file chunks
  const metaRef      = useRef(null)   // { name, size, type }
  const bytesRef     = useRef(0)      // bytes received so far
  const speedTimerRef = useRef(null)
  const speedBytesRef = useRef(0)
  const startTimeRef  = useRef(0)

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  function cleanup() {
    if (pollRef.current)    clearInterval(pollRef.current)
    if (speedTimerRef.current) clearInterval(speedTimerRef.current)
    if (dcRef.current)      dcRef.current.close()
    if (pcRef.current)      pcRef.current.close()
    pcRef.current = null
    dcRef.current = null
  }

  function reset() {
    cleanup()
    setMode(null)
    setStep('idle')
    setPin('')
    setInputPin('')
    setFile(null)
    setProgress(0)
    setSpeed(0)
    setReceived(null)
    setStatusMsg('')
    setError('')
    setSenderName('')
    chunksRef.current    = []
    metaRef.current      = null
    bytesRef.current     = 0
    speedBytesRef.current = 0
  }

  // ── Speed tracker ───────────────────────────────────────────────────────
  function startSpeedTracker() {
    startTimeRef.current   = Date.now()
    speedBytesRef.current  = 0
    speedTimerRef.current  = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      if (elapsed > 0) {
        setSpeed(Math.round(speedBytesRef.current / elapsed / 1024))
      }
    }, 500)
  }

  function stopSpeedTracker() {
    if (speedTimerRef.current) clearInterval(speedTimerRef.current)
  }

  // ── Copy PIN to clipboard ───────────────────────────────────────────────
  async function copyPin() {
    try {
      await navigator.clipboard.writeText(pin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback — select the text manually
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SENDER FLOW
  // ════════════════════════════════════════════════════════════════════════

  async function startSend() {
    if (!file) return
    setError('')
    setStep('creating')
    setStatusMsg('Creating secure connection…')

    try {
      // 1. Create RTCPeerConnection
      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcRef.current = pc

      // 2. Create data channel for file transfer
      const dc = pc.createDataChannel("fileTransfer", {
      ordered: true,
      maxRetransmits: 30
      })
      dcRef.current = dc

      dc.binaryType = 'arraybuffer'

      dc.onopen = () => {
        setStep('connected')
        setStatusMsg('Connected! Starting file transfer…')
        sendFile()
      }

      dc.onerror = (e) => {
        setError('Data channel error. Try again.')
        setStep('error')
      }

      dc.onclose = () => {
        stopSpeedTracker()
      }

      // 3. Collect ICE candidates
      const iceCandidates = []
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) iceCandidates.push(candidate.toJSON())
      }

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        if (state === 'failed' || state === 'disconnected') {
          setError('Connection lost. Please try again.')
          setStep('error')
          stopSpeedTracker()
        }
      }

      // 4. Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering to complete (max 3 seconds)
      await waitForIceGathering(pc)

      // 5. Store offer on server, get PIN
      const { data } = await api.post('/webrtc/create', {
        offer: pc.localDescription.toJSON(),
      })

      setPin(data.pin)
      setStep('waiting')
      setStatusMsg('Share the PIN with the other device')

      // 6. Poll for answer from receiver
      pollRef.current = setInterval(async () => {
        try {
          const { data: poll } = await api.get(`/webrtc/poll/${data.pin}`)

          if (poll.status === 'connected' && poll.answer) {
            clearInterval(pollRef.current)
            setStatusMsg('Other device connected! Establishing P2P link…')

            // Apply the answer
            const answerDesc = new RTCSessionDescription(poll.answer)
            await pc.setRemoteDescription(answerDesc)

            // Apply receiver ICE candidates
            for (const cand of (poll.receiver_ice || [])) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand))
              } catch {}
            }
          }
        } catch (err) {
          // polling — ignore individual failures
        }
      }, 1500)

    } catch (err) {
      console.error('WebRTC sender error:', err)
      setError('Failed to create connection: ' + (err.message || err))
      setStep('error')
    }
  }

  // ── Send file over data channel ─────────────────────────────────────────
  async function sendFile() {
    if (!file || !dcRef.current) return

    const dc       = dcRef.current
    const fileSize = file.size
    let offset     = 0

    startSpeedTracker()

    // First send metadata as JSON
    const meta = JSON.stringify({
      name: file.name,
      size: fileSize,
      type: file.type || 'application/octet-stream',
    })
    dc.send(meta)

    // Then send file in chunks
    const reader = new FileReader()

    function sendNextChunk() {
      if (offset >= fileSize) {
        // Done
        dc.send(JSON.stringify({ done: true }))
        setStep('done')
        setStatusMsg('File sent successfully!')
        stopSpeedTracker()
        setProgress(100)
        return
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE)
      reader.readAsArrayBuffer(slice)
    }

    reader.onload = (e) => {
      const buffer = e.target.result
      try {
        dc.send(buffer)
        offset += buffer.byteLength
        speedBytesRef.current += buffer.byteLength

        const pct = Math.round((offset / fileSize) * 100)
        setProgress(pct)

        // Flow control — wait if buffer is getting full
        const MAX_BUFFER = 4 * 1024 * 1024 // 4MB

dc.bufferedAmountLowThreshold = MAX_BUFFER

function sendNextChunk() {
  if (offset >= fileSize) {
    dc.send(JSON.stringify({ done: true }))
    setStep('done')
    stopSpeedTracker()
    return
  }

  if (dc.bufferedAmount > MAX_BUFFER) {
    dc.onbufferedamountlow = () => {
      dc.onbufferedamountlow = null
      sendNextChunk()
    }
    return
  }

  const slice = file.slice(offset, offset + CHUNK_SIZE)
  reader.readAsArrayBuffer(slice)
}
      } catch (err) {
        setError('Transfer failed: ' + err.message)
        setStep('error')
        stopSpeedTracker()
      }
    }

    reader.onerror = () => {
      setError('Failed to read file')
      setStep('error')
      stopSpeedTracker()
    }

    sendNextChunk()
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RECEIVER FLOW
  // ════════════════════════════════════════════════════════════════════════

  async function startReceive() {
    if (!inputPin || inputPin.length !== 6) {
      setError('Enter a valid 6-digit PIN')
      return
    }
    setError('')
    setStep('creating')
    setStatusMsg('Connecting to sender…')

    try {
      // 1. Fetch offer from server using PIN
      const { data: offerData } = await api.get(`/webrtc/offer/${inputPin}`)
      setSenderName(offerData.sender_name || 'Sender')

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcRef.current = pc

      // 3. Handle incoming data channel
      pc.ondatachannel = ({ channel }) => {
        dcRef.current       = channel
        channel.binaryType  = 'arraybuffer'

        channel.onopen = () => {
          setStep('transferring')
          setStatusMsg('Receiving file…')
          startSpeedTracker()
        }

        channel.onmessage = handleReceivedData
        channel.onerror   = (e) => {
          setError('Data channel error.')
          setStep('error')
          stopSpeedTracker()
        }
      }

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        if (state === 'failed' || state === 'disconnected') {
          setError('Connection lost. Please try again.')
          setStep('error')
          stopSpeedTracker()
        }
      }

      // 4. Collect ICE candidates
      const iceCandidates = []
      pc.onicecandidate = async ({ candidate }) => {
        if (candidate) {
          iceCandidates.push(candidate.toJSON())
          // Push to server as they come
          try {
            await api.post(`/webrtc/ice/${inputPin}`, {
              candidate: candidate.toJSON(),
              role: 'receiver',
            })
          } catch {}
        }
      }

      // 5. Set remote description (sender's offer)
      const offerDesc = new RTCSessionDescription(offerData.offer)
      await pc.setRemoteDescription(offerDesc)

      // 6. Apply sender's ICE candidates
      for (const cand of (offerData.sender_ice || [])) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand))
        } catch {}
      }

      // 7. Create answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // Wait for ICE
      await waitForIceGathering(pc)

      // 8. Send answer to server
      await api.post(`/webrtc/join/${inputPin}`, {
        answer: pc.localDescription.toJSON(),
      })

      setStep('connected')
      setStatusMsg('Connected to sender! Waiting for file…')
      setPin(inputPin)

    } catch (err) {
      console.error('WebRTC receiver error:', err)
      setError('Failed to connect: ' + (err.message || 'Invalid or expired PIN'))
      setStep('error')
    }
  }

  // ── Handle received data chunks ─────────────────────────────────────────
  function handleReceivedData(event) {
    const data = event.data

    // String messages are metadata or done signal
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)

        if (parsed.done) {
          // All chunks received — assemble the file
          stopSpeedTracker()
          const blob = new Blob(chunksRef.current, {
            type: metaRef.current?.type || 'application/octet-stream',
          })
          setReceived({
            name: metaRef.current?.name || 'received_file',
            size: metaRef.current?.size || blob.size,
            blob,
          })
          setStep('done')
          setStatusMsg('File received successfully!')
          setProgress(100)

          // Clean up session
          api.delete(`/webrtc/close/${pin || inputPin}`).catch(() => {})
        } else if (parsed.name) {
          // File metadata
          metaRef.current       = parsed
          chunksRef.current     = []
          bytesRef.current      = 0
          speedBytesRef.current = 0
          setStep('transferring')
          setStatusMsg(`Receiving ${parsed.name}…`)
          setProgress(0)
        }
      } catch {}
      return
    }

    // Binary data — file chunk
    if (data instanceof ArrayBuffer) {
      chunksRef.current.push(data)
      bytesRef.current      += data.byteLength
      speedBytesRef.current += data.byteLength

      if (metaRef.current?.size) {
        const pct = Math.round((bytesRef.current / metaRef.current.size) * 100)
        setProgress(Math.min(pct, 99))
      }
    }
  }

  // ── Download received file ──────────────────────────────────────────────
  function downloadReceived() {
    if (!received) return
    const url = URL.createObjectURL(received.blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = received.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Wait for ICE gathering ──────────────────────────────────────────────
  function waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve()
        return
      }
      const timeout = setTimeout(resolve, 3000)
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout)
          resolve()
        }
      })
    })
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════

  // ── Mode selection ──────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div className="space-y-6 fade-in">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
          <WifiOff size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-300 mb-1">
              Offline P2P Transfer — No cloud, no internet needed after pairing
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Files transfer directly between browsers using WebRTC.
              Works Android ↔ iOS ↔ Windows ↔ Mac on the same WiFi.
              No file size limit. Completely private — nothing touches any server.
            </p>
          </div>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Send */}
          <button
            onClick={() => setMode('send')}
            className="group text-left p-8 bg-slate-900 border border-slate-800
                       rounded-2xl hover:border-blue-500/50 transition-all
                       hover:shadow-[0_0_30px_rgba(59,158,255,0.08)]"
          >
            <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center
                            justify-center mb-5 group-hover:bg-blue-500/20 transition">
              <Upload size={28} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Send File</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Pick a file on this device. A 6-digit PIN is generated.
              Share it with the other device. File transfers directly.
            </p>
            <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold
                            group-hover:gap-3 transition-all">
              Start sending <ArrowRight size={14} />
            </div>
          </button>

          {/* Receive */}
          <button
            onClick={() => setMode('receive')}
            className="group text-left p-8 bg-slate-900 border border-slate-800
                       rounded-2xl hover:border-green-500/50 transition-all
                       hover:shadow-[0_0_30px_rgba(15,158,88,0.08)]"
          >
            <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center
                            justify-center mb-5 group-hover:bg-green-500/20 transition">
              <Download size={28} className="text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Receive File</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Enter the 6-digit PIN shown on the sender's device.
              File comes straight to your browser.
            </p>
            <div className="flex items-center gap-2 text-green-400 text-sm font-semibold
                            group-hover:gap-3 transition-all">
              Start receiving <ArrowRight size={14} />
            </div>
          </button>
        </div>

        {/* How it works */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-4">How it works</h4>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            {[
              { icon: Monitor,    label: 'Sender picks file', sub: 'Gets a 6-digit PIN' },
              { icon: ArrowRight, label: '',                  sub: '' },
              { icon: Smartphone, label: 'Receiver enters PIN', sub: 'On any device/browser' },
              { icon: ArrowRight, label: '',                  sub: '' },
              { icon: Wifi,       label: 'P2P connection',    sub: 'Direct browser-to-browser' },
              { icon: ArrowRight, label: '',                  sub: '' },
              { icon: CheckCircle,label: 'File received',     sub: 'No cloud involved' },
            ].map(({ icon: Icon, label, sub }, i) => (
              label
                ? <div key={i} className="flex-1 flex flex-col items-center text-center">
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center
                                    justify-center mb-2">
                      <Icon size={18} className="text-brand-400" />
                    </div>
                    <p className="text-xs font-medium text-slate-300">{label}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
                  </div>
                : <Icon key={i} size={14} className="text-slate-700 flex-shrink-0
                                                     hidden md:block" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 fade-in">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center">
          <AlertCircle size={32} className="text-red-400" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-white mb-2">Connection Failed</h3>
          <p className="text-slate-400 text-sm max-w-sm">{error}</p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700
                     text-slate-300 font-medium rounded-xl transition"
        >
          <RefreshCw size={16} /> Try Again
        </button>
      </div>
    )
  }

  // ── Success — sender ────────────────────────────────────────────────────
  if (step === 'done' && mode === 'send') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 fade-in">
        <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center">
          <CheckCircle size={32} className="text-green-400" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-white mb-2">File Sent!</h3>
          <p className="text-slate-400 text-sm">
            {file?.name} was transferred successfully.
          </p>
        </div>
        <button onClick={reset}
          className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white
                     font-semibold rounded-xl transition">
          Send Another File
        </button>
      </div>
    )
  }

  // ── Success — receiver ──────────────────────────────────────────────────
  if (step === 'done' && mode === 'receive' && received) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 fade-in">
        <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center">
          <CheckCircle size={32} className="text-green-400" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-white mb-2">File Received!</h3>
          <p className="text-slate-400 text-sm mb-1">{received.name}</p>
          <p className="text-slate-600 text-xs">{formatSize(received.size)}</p>
        </div>
        <button
          onClick={downloadReceived}
          className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700
                     text-white font-semibold rounded-xl transition"
        >
          <Download size={18} /> Download File
        </button>
        <button onClick={reset}
          className="text-sm text-slate-500 hover:text-slate-300 transition">
          Receive another file
        </button>
      </div>
    )
  }

  // ── Sender UI ───────────────────────────────────────────────────────────
  if (mode === 'send') {
    return (
      <div className="max-w-lg mx-auto space-y-6 fade-in">
        {/* Back */}
        <button onClick={reset}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition">
          <X size={14} /> Cancel
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Upload size={20} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">Send File</h3>
              <p className="text-xs text-slate-500">Direct P2P transfer — no cloud</p>
            </div>
          </div>

          {/* Step 1 — Pick file */}
          {step === 'idle' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-3">
                  Step 1 — Select file to send
                </label>
                <label className="flex flex-col items-center justify-center w-full h-36
                                   border-2 border-dashed border-slate-700 rounded-xl
                                   cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5
                                   transition-all">
                  <Upload size={28} className="text-slate-600 mb-3" />
                  {file ? (
                    <div className="text-center">
                      <p className="text-sm font-medium text-blue-400">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{formatSize(file.size)}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-slate-400">Click to pick any file</p>
                      <p className="text-xs text-slate-600 mt-1">No size limit</p>
                    </div>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => setFile(e.target.files[0] || null)}
                  />
                </label>
              </div>
              <button
                onClick={startSend}
                disabled={!file}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40
                           text-white font-semibold rounded-xl transition"
              >
                Generate PIN & Start →
              </button>
            </div>
          )}

          {/* Step 2 — Show PIN, wait for receiver */}
          {step === 'waiting' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Step 2 — Share this PIN with the other device
                </p>
                <div className="flex gap-2 mb-4">
                  {pin.split('').map((d, i) => (
                    <div key={i}
                      className="flex-1 h-14 bg-blue-500/10 border-2 border-blue-500/40
                                 rounded-xl flex items-center justify-center text-2xl
                                 font-black text-blue-400">
                      {d}
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyPin}
                  className="flex items-center gap-2 w-full justify-center py-2
                             bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm
                             font-medium rounded-lg transition"
                >
                  {copied
                    ? <><CheckCircle size={14} className="text-green-400" /> Copied!</>
                    : <><Copy size={14} /> Copy PIN</>
                  }
                </button>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                <p className="text-sm text-slate-400">
                  Waiting for the other device to enter this PIN…
                </p>
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-600">
                  File: <span className="text-slate-400">{file?.name}</span>
                  {' '}({formatSize(file?.size || 0)})
                </p>
              </div>
            </div>
          )}

          {/* Step 3 — Transferring */}
          {(step === 'connected' || step === 'transferring') && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-green-500/10
                              border border-green-500/20 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <p className="text-sm text-green-300 font-medium">{statusMsg}</p>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>{file?.name}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full
                               transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-2">
                  <span>{formatSize(Math.round((progress / 100) * (file?.size || 0)))} sent</span>
                  <span>{speed > 0 ? `${speed} KB/s` : ''}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Receiver UI ─────────────────────────────────────────────────────────
  if (mode === 'receive') {
    return (
      <div className="max-w-lg mx-auto space-y-6 fade-in">
        {/* Back */}
        <button onClick={reset}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition">
          <X size={14} /> Cancel
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
              <Download size={20} className="text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">Receive File</h3>
              <p className="text-xs text-slate-500">Enter PIN from sender's device</p>
            </div>
          </div>

          {/* Step 1 — Enter PIN */}
          {step === 'idle' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-3">
                  Enter the 6-digit PIN shown on the sender's device
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="e.g. 482931"
                  value={inputPin}
                  onChange={e => {
                    setInputPin(e.target.value.replace(/\D/g, ''))
                    setError('')
                  }}
                  onKeyDown={e => e.key === 'Enter' && startReceive()}
                  className="w-full px-4 py-4 bg-slate-800 border border-slate-700
                             rounded-xl text-center text-3xl font-black tracking-[0.3em]
                             text-green-400 focus:outline-none focus:border-green-500 transition"
                />
                {error && (
                  <p className="text-xs text-red-400 mt-2">{error}</p>
                )}
              </div>
              <button
                onClick={startReceive}
                disabled={inputPin.length !== 6}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40
                           text-white font-semibold rounded-xl transition"
              >
                Connect & Receive →
              </button>
            </div>
          )}

          {/* Connecting */}
          {(step === 'creating' || step === 'connected') && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-500/10
                              border border-green-500/20 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <p className="text-sm text-green-300 font-medium">{statusMsg}</p>
              </div>
              {senderName && (
                <p className="text-xs text-center text-slate-500">
                  Connecting to: <span className="text-slate-300">{senderName}</span>
                </p>
              )}
            </div>
          )}

          {/* Receiving */}
          {step === 'transferring' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-green-500/10
                              border border-green-500/20 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <p className="text-sm text-green-300 font-medium">{statusMsg}</p>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>{metaRef.current?.name || 'Receiving…'}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full
                               transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-2">
                  <span>
                    {formatSize(bytesRef.current)}
                    {metaRef.current?.size ? ` / ${formatSize(metaRef.current.size)}` : ''}
                  </span>
                  <span>{speed > 0 ? `${speed} KB/s` : ''}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
