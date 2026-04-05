/**
 * VoiceBar.jsx
 *
 * Discord-style voice chat for BeamStream collaboration sessions.
 *
 * How it works:
 *   1. User clicks "Join Voice" → browser asks mic permission
 *   2. Sends voice_join via Socket.io to notify existing peers
 *   3. Existing peers send WebRTC offers back via voice_signal
 *   4. New user answers each offer — P2P audio established per pair
 *   5. Speaking detection via Web Audio API AnalyserNode
 *   6. Mute/unmute just disables the local audio track
 *
 * Mesh topology (every peer connects to every other peer directly):
 *   A ←→ B
 *   A ←→ C
 *   B ←→ C
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSocket } from '../api/socket'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/helpers'
import { Mic, MicOff, PhoneCall, PhoneOff, Volume2, VolumeX } from 'lucide-react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

export default function VoiceBar({ sessionId, accentColor = '#4285f4' }) {
  const { user }  = useAuth()
  const socket    = getSocket()

  // ── State ──────────────────────────────────────────────────────────────
  const [inVoice,   setInVoice]   = useState(false)
  const [muted,     setMuted]     = useState(false)
  const [peers,     setPeers]     = useState({})
  // peers: { user_id: { name, muted, speaking, stream, pc } }
  const [error,     setError]     = useState('')
  const [status,    setStatus]    = useState('')

  // ── Refs ───────────────────────────────────────────────────────────────
  const localStreamRef   = useRef(null)   // local MediaStream
  const pcsRef           = useRef({})     // { user_id: RTCPeerConnection }
  const audioCtxRef      = useRef(null)   // AudioContext for speaking detection
  const analyserTimerRef = useRef(null)   // speaking detection interval
  const remoteAudiosRef  = useRef({})     // { user_id: <audio> element }
  const speakingRef      = useRef(false)  // current speaking state

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => { cleanupVoice() }
  }, [])

  // ── Socket.io voice event listeners ───────────────────────────────────
  useEffect(() => {
    if (!socket) return

    // A new user joined voice — we are an existing user, send them an offer
    socket.on('voice_user_joined', async ({ user_id, name }) => {
      if (!inVoice || !localStreamRef.current) return
      // Add peer entry
      setPeers(p => ({
        ...p,
        [user_id]: { name, muted: false, speaking: false }
      }))
      // Create offer and send to new user
      await createOffer(user_id, name)
    })

    // We received a signal (offer/answer/ICE) from another peer
    socket.on('voice_signal', async ({ from_user, from_name, signal, signal_type }) => {
      if (!inVoice && signal_type !== 'offer') return
      await handleSignal(from_user, from_name, signal, signal_type)
    })

    // A peer left voice
    socket.on('voice_user_left', ({ user_id }) => {
      closePeerConnection(user_id)
      setPeers(p => {
        const next = { ...p }
        delete next[user_id]
        return next
      })
    })

    // Mute update from a peer
    socket.on('voice_mute_update', ({ user_id, muted: m }) => {
      setPeers(p => p[user_id]
        ? { ...p, [user_id]: { ...p[user_id], muted: m } }
        : p
      )
    })

    // Speaking update from a peer
    socket.on('voice_speaking_update', ({ user_id, speaking }) => {
      setPeers(p => p[user_id]
        ? { ...p, [user_id]: { ...p[user_id], speaking } }
        : p
      )
    })

    return () => {
      socket.off('voice_user_joined')
      socket.off('voice_signal')
      socket.off('voice_user_left')
      socket.off('voice_mute_update')
      socket.off('voice_speaking_update')
    }
  }, [socket, inVoice, sessionId])

  // ── Join voice ─────────────────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    setError('')
    setStatus('Requesting microphone…')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:   true,
          noiseSuppression:   true,
          autoGainControl:    true,
          sampleRate:         48000,
        },
        video: false,
      })
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please allow mic access and try again.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device.')
      } else {
        setError('Could not access microphone: ' + err.message)
      }
      setStatus('')
      return
    }

    localStreamRef.current = stream
    setInVoice(true)
    setStatus('Connected')

    // Start speaking detection
    startSpeakingDetection(stream)

    // Notify all peers in the session room
    socket?.emit('voice_join', {
      session_id: sessionId,
      name:       user?.name,
    })

    setStatus('')
  }, [sessionId, socket, user])

  // ── Leave voice ────────────────────────────────────────────────────────
  const leaveVoice = useCallback(() => {
    socket?.emit('voice_leave', { session_id: sessionId })
    cleanupVoice()
    setInVoice(false)
    setPeers({})
    setMuted(false)
    setStatus('')
  }, [sessionId, socket])

  // ── Full cleanup ───────────────────────────────────────────────────────
  function cleanupVoice() {
    // Stop local stream tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null

    // Close all peer connections
    Object.keys(pcsRef.current).forEach(closePeerConnection)
    pcsRef.current = {}

    // Remove remote audio elements
    Object.values(remoteAudiosRef.current).forEach(el => el.remove())
    remoteAudiosRef.current = {}

    // Stop speaking detection
    if (analyserTimerRef.current) clearInterval(analyserTimerRef.current)
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }

    speakingRef.current = false
  }

  // ── Close one peer connection ──────────────────────────────────────────
  function closePeerConnection(userId) {
    if (pcsRef.current[userId]) {
      pcsRef.current[userId].close()
      delete pcsRef.current[userId]
    }
    if (remoteAudiosRef.current[userId]) {
      remoteAudiosRef.current[userId].remove()
      delete remoteAudiosRef.current[userId]
    }
  }

  // ── Create RTCPeerConnection for a peer ────────────────────────────────
  function createPeerConnection(userId, userName) {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcsRef.current[userId] = pc

    // Add local audio tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current)
    })

    // Handle incoming remote audio stream
    pc.ontrack = ({ streams }) => {
      const remoteStream = streams[0]
      if (!remoteStream) return

      // Create or reuse audio element
      let audio = remoteAudiosRef.current[userId]
      if (!audio) {
        audio = document.createElement('audio')
        audio.autoplay     = true
        audio.playsInline  = true
        audio.id           = `voice-audio-${userId}`
        document.body.appendChild(audio)
        remoteAudiosRef.current[userId] = audio
      }
      audio.srcObject = remoteStream

      setPeers(p => ({
        ...p,
        [userId]: { ...(p[userId] || { name: userName }), stream: remoteStream }
      }))
    }

    // Send ICE candidates to peer via Socket.io
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket?.emit('voice_signal', {
          session_id: sessionId,
          to_user_id: userId,
          signal:      candidate.toJSON(),
          signal_type: 'ice',
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[Voice] ICE failed for ${userName}`)
      }
    }

    return pc
  }

  // ── Initiator: create and send offer to a specific peer ───────────────
  async function createOffer(userId, userName) {
    const pc    = createPeerConnection(userId, userName)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    socket?.emit('voice_signal', {
      session_id:  sessionId,
      to_user_id:  userId,
      signal:      pc.localDescription.toJSON(),
      signal_type: 'offer',
    })
  }

  // ── Handle incoming signal from a peer ─────────────────────────────────
  async function handleSignal(fromUser, fromName, signal, signalType) {
    try {
      if (signalType === 'offer') {
        // We received an offer — create answer
        if (!localStreamRef.current) {
          // Auto-join voice if we get an offer but aren't in voice
          // (edge case: user was in voice on another tab)
          return
        }

        // Add peer if not already tracked
        setPeers(p => ({
          ...p,
          [fromUser]: p[fromUser] || { name: fromName, muted: false, speaking: false }
        }))

        const pc     = createPeerConnection(fromUser, fromName)
        const offerDesc = new RTCSessionDescription(signal)
        await pc.setRemoteDescription(offerDesc)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socket?.emit('voice_signal', {
          session_id:  sessionId,
          to_user_id:  fromUser,
          signal:      pc.localDescription.toJSON(),
          signal_type: 'answer',
        })

      } else if (signalType === 'answer') {
        // We received an answer to our offer
        const pc = pcsRef.current[fromUser]
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal))
        }

      } else if (signalType === 'ice') {
        // ICE candidate from peer
        const pc = pcsRef.current[fromUser]
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal))
          } catch {}
        }
      }
    } catch (err) {
      console.error('[Voice] handleSignal error:', err)
    }
  }

  // ── Toggle mute ────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const track   = localStreamRef.current.getAudioTracks()[0]
    if (!track) return
    const newMuted = !muted
    track.enabled  = !newMuted       // false = muted
    setMuted(newMuted)
    socket?.emit('voice_mute', {
      session_id: sessionId,
      muted:      newMuted,
    })
  }, [muted, sessionId, socket])

  // ── Speaking detection via Web Audio API ──────────────────────────────
  function startSpeakingDetection(stream) {
    try {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx

      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize         = 512
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)

      analyserTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data)
        const avg     = data.reduce((a, b) => a + b, 0) / data.length
        const talking = avg > 15   // threshold — adjust if needed

        if (talking !== speakingRef.current) {
          speakingRef.current = talking
          socket?.emit('voice_speaking', {
            session_id: sessionId,
            speaking:   talking,
          })
        }
      }, 200)
    } catch (err) {
      console.warn('[Voice] Speaking detection unavailable:', err)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════

  const peerList = Object.entries(peers)

  // ── Not in voice ───────────────────────────────────────────────────────
  if (!inVoice) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {error && (
          <p className="text-xs text-red-400 flex-1 truncate">{error}</p>
        )}
        {!error && peerList.length > 0 && (
          <div className="flex items-center gap-1.5 flex-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-slate-400">
              {peerList.length} in voice
            </span>
            {peerList.slice(0, 3).map(([uid, p]) => (
              <div key={uid}
                className="w-5 h-5 rounded-full flex items-center justify-center
                           text-white text-[8px] font-bold"
                style={{ background: accentColor }}>
                {getInitials(p.name)}
              </div>
            ))}
          </div>
        )}
        {!error && peerList.length === 0 && (
          <span className="text-xs text-slate-600 flex-1">Voice chat</span>
        )}
        <button
          onClick={joinVoice}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs
                     font-semibold text-white transition-all"
          style={{ background: accentColor }}
        >
          <PhoneCall size={13} />
          Join Voice
        </button>
      </div>
    )
  }

  // ── In voice ───────────────────────────────────────────────────────────
  return (
    <div
      className="border-t"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
    >
      {/* Voice header bar */}
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: accentColor + '18' }}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold truncate"
            style={{ color: accentColor }}>
            Voice Connected
          </span>
        </div>

        {/* Mute button */}
        <button
          onClick={toggleMute}
          title={muted ? 'Unmute' : 'Mute'}
          className={`p-1.5 rounded-lg transition-all flex-shrink-0
            ${muted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          {muted ? <MicOff size={13} /> : <Mic size={13} />}
        </button>

        {/* Leave button */}
        <button
          onClick={leaveVoice}
          title="Leave voice"
          className="p-1.5 rounded-lg bg-red-500/20 text-red-400
                     hover:bg-red-500/30 transition-all flex-shrink-0"
        >
          <PhoneOff size={13} />
        </button>
      </div>

      {/* Users in voice */}
      <div className="px-3 py-2 space-y-1.5">

        {/* Local user (you) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center
                         text-white text-[9px] font-bold"
              style={{ background: accentColor }}
            >
              {getInitials(user?.name)}
            </div>
            {/* Speaking ring */}
            {!muted && speakingRef.current && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ border: `2px solid #22c55e` }}
              />
            )}
            {/* Mute indicator */}
            {muted && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500
                              rounded-full flex items-center justify-center">
                <MicOff size={7} className="text-white" />
              </div>
            )}
          </div>
          <span className="text-xs font-medium text-slate-300 truncate flex-1">
            {user?.name}
            <span className="text-slate-600 ml-1 font-normal">(you)</span>
          </span>
          {muted
            ? <MicOff size={11} className="text-red-400 flex-shrink-0" />
            : <Mic    size={11} className="text-green-400 flex-shrink-0" />
          }
        </div>

        {/* Remote peers */}
        {peerList.map(([uid, peer]) => (
          <div key={uid} className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center
                           text-white text-[9px] font-bold"
                style={{ background: peer.speaking ? '#22c55e' : '#475569' }}
              >
                {getInitials(peer.name)}
              </div>
              {/* Speaking ring */}
              {peer.speaking && !peer.muted && (
                <div
                  className="absolute inset-0 rounded-full animate-ping opacity-60"
                  style={{ border: '2px solid #22c55e' }}
                />
              )}
              {/* Mute indicator */}
              {peer.muted && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500
                                rounded-full flex items-center justify-center">
                  <MicOff size={7} className="text-white" />
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-slate-300 truncate flex-1">
              {peer.name}
            </span>
            {peer.muted
              ? <MicOff  size={11} className="text-red-400 flex-shrink-0" />
              : peer.speaking
                ? <Volume2 size={11} className="text-green-400 flex-shrink-0" />
                : <Mic     size={11} className="text-slate-600 flex-shrink-0" />
            }
          </div>
        ))}

        {/* Empty state */}
        {peerList.length === 0 && (
          <p className="text-[10px] text-slate-600 pl-9">
            Waiting for others to join…
          </p>
        )}
      </div>
    </div>
  )
}
