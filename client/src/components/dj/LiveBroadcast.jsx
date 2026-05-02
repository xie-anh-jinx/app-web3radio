import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Mic, MicOff, Radio, Wifi, WifiOff, Volume2, MonitorUp, AlertCircle,
    CheckCircle, Loader, Play, Pause, SkipForward, Plus, Repeat, List,
    Trash2, Music, Shuffle, Image, Upload, Circle, Square, Download
} from 'lucide-react';
import { updateLiveMetadata } from '../../api/azuracast';

const STATES = {
    IDLE: 'idle',
    REQUESTING_MEDIA: 'requesting_media',
    READY: 'ready',
    CONNECTING: 'connecting',
    LIVE: 'live',
    ERROR: 'error',
};

function VUMeter({ analyser, isActive }) {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!analyser || !isActive) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const bufLen = analyser.frequencyBinCount;
        const dataArr = new Uint8Array(bufLen);

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArr);

            const W = canvas.width;
            const H = canvas.height;
            ctx.clearRect(0, 0, W, H);

            const barW = (W / bufLen) * 2.5;
            let x = 0;
            for (let i = 0; i < bufLen; i++) {
                const barH = (dataArr[i] / 255) * H;
                const ratio = barH / H;
                const r = Math.floor(255 * Math.min(1, ratio * 2));
                const g = Math.floor(255 * Math.min(1, (1 - ratio) * 2));
                ctx.fillStyle = `rgb(${r},${g},60)`;
                ctx.fillRect(x, H - barH, barW, barH);
                x += barW + 1;
            }
        };
        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [analyser, isActive]);

    return (
        <canvas
            ref={canvasRef}
            width={300}
            height={60}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700/50"
        />
    );
}

export default function LiveBroadcast({ isDJ = false, onBroadcastState }) {
    const [state, setState] = useState(STATES.IDLE);
    const [error, setError] = useState(null);
    const [statusMsg, setStatusMsg] = useState('Ready to go live');
    const [liveSeconds, setLiveSeconds] = useState(0);
    const [captureMode, setCaptureMode] = useState('mic');
    const [micLabel, setMicLabel] = useState('');
    
    // Stream Metadata
    const [streamTitle, setStreamTitle] = useState('Live DJ Set');
    const [streamArtist, setStreamArtist] = useState('Web3Radio DJ');
    const [artwork, setArtwork] = useState(null); // File object
    const [artworkUrl, setArtworkUrl] = useState(null); // Preview URL

    // Mic device selection
    const [micDevices, setMicDevices] = useState([]);
    const [selectedMicId, setSelectedMicId] = useState('');

    // Volume states
    const [micVolume, setMicVolume] = useState(1);
    const [systemVolume, setSystemVolume] = useState(1);
    const [deck1Volume, setDeck1Volume] = useState(0.8);
    const [deck2Volume, setDeck2Volume] = useState(0.8);

    // Playlist states
    const [playlist1, setPlaylist1] = useState([]);
    const [playlist2, setPlaylist2] = useState([]);
    const [p1Index, setP1Index] = useState(-1);
    const [p2Index, setP2Index] = useState(-1);
    const [p1Repeat, setP1Repeat] = useState(false);
    const [p2Repeat, setP2Repeat] = useState(false);
    const [p1Auto, setP1Auto] = useState(true);
    const [p2Auto, setP2Auto] = useState(true);

    const streamRef = useRef(null);
    const wsRef = useRef(null);
    const recorderRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const timerRef = useRef(null);
    // Active media tracks (mic/system) — stopped on reinit or unmount
    const activeTracksRef = useRef([]);

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const [recSize, setRecSize] = useState(0); // bytes accumulated
    const localRecorderRef = useRef(null);
    const recChunksRef = useRef([]);
    const recTimerRef = useRef(null);

    // Gain nodes
    const micGainRef = useRef(null);
    const systemGainRef = useRef(null);
    const deck1GainRef = useRef(null);
    const deck2GainRef = useRef(null);

    // Audio elements for playback — created ONCE per mount, NEVER recreated
    const audio1Ref = useRef(null);
    const audio2Ref = useRef(null);
    const jingleRef = useRef(null);
    // MediaElementSource nodes — bound to AudioContext, created once per context lifetime
    const d1SourceRef = useRef(null);
    const d2SourceRef = useRef(null);
    const jingleSourceRef = useRef(null);

    // Initialize audio engine on mount — done ONCE for component lifetime
    useEffect(() => {
        // 1. Audio elements — created once, never recreated
        const el1 = new Audio(); el1.crossOrigin = 'anonymous';
        const el2 = new Audio(); el2.crossOrigin = 'anonymous';
        const jEl = new Audio('/jingle.mp3'); jEl.crossOrigin = 'anonymous';
        audio1Ref.current = el1;
        audio2Ref.current = el2;
        jingleRef.current = jEl;

        // 2. AudioContext — created once. Deck sources are bound to this context.
        let ctx;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        } catch {
            // Fallback without sampleRate constraint
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        audioCtxRef.current = ctx;

        // 3. Deck MediaElementSources — created ONCE here, never again.
        //    createMediaElementSource permanently "consumes" an HTMLMediaElement.
        //    requestMedia only disconnects/reconnects these to fresh gain nodes.
        d1SourceRef.current = ctx.createMediaElementSource(el1);
        d2SourceRef.current = ctx.createMediaElementSource(el2);
        jingleSourceRef.current = ctx.createMediaElementSource(jEl);

        // 4. Mic device enumeration — no permission probe, just enumerate
        const loadMicDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const mics = devices.filter(d => d.kind === 'audioinput');
                setMicDevices(mics);
                if (mics.length > 0) setSelectedMicId(prev => prev || mics[0].deviceId);
            } catch { /* enumerateDevices not supported */ }
        };
        loadMicDevices();
        navigator.mediaDevices.addEventListener('devicechange', loadMicDevices);

        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', loadMicDevices);
            activeTracksRef.current.forEach(t => t.stop());
            if (ctx.state !== 'closed') ctx.close();
        };
    }, []);

    const requestMedia = useCallback(async (mode) => {
        setState(STATES.REQUESTING_MEDIA);
        setError(null);
        setCaptureMode(mode);
        setStatusMsg('Initializing Studio Engine...');

        try {
            // Stop previous mic/system tracks before reinit
            activeTracksRef.current.forEach(t => t.stop());
            activeTracksRef.current = [];

            // AudioContext was created in useEffect.
            // Modern browsers start it as 'suspended' until user interaction — resume it.
            const audioCtx = audioCtxRef.current;
            if (!audioCtx || audioCtx.state === 'closed') {
                throw new Error('Audio engine not ready — please reload the page.');
            }
            // Resume if suspended (normal on first interaction)
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
                console.log('[LiveBroadcast] AudioContext resumed from suspended state');
            }

            // Fresh destination + analyser for this session
            const dest = audioCtx.createMediaStreamDestination();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;

            // 1. MIC SOURCE — use selected device
            if (mode === 'mic' || mode === 'system_mic') {
                const micConstraints = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 1,
                };
                if (selectedMicId) micConstraints.deviceId = { exact: selectedMicId };

                const micStream = await navigator.mediaDevices.getUserMedia({
                    audio: micConstraints,
                    video: false,
                });
                micStream.getAudioTracks().forEach(t => activeTracksRef.current.push(t));
                const micSource = audioCtx.createMediaStreamSource(micStream);
                const micGain = audioCtx.createGain();
                micGain.gain.value = micVolume;
                micSource.connect(micGain);
                micGain.connect(dest);
                micGain.connect(analyser);
                micGainRef.current = micGain;
                setMicLabel(micStream.getAudioTracks()[0]?.label ?? 'Microphone');

                // Refresh device labels now that permission is granted
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const mics = devices.filter(d => d.kind === 'audioinput');
                    setMicDevices(mics);
                } catch {}
            }

            // 2. SYSTEM AUDIO CAPTURE — raw, unprocessed
            if (mode === 'system' || mode === 'system_mic') {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: 'browser',
                        frameRate: 1,
                        width: 1,
                        height: 1,
                    },
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        sampleRate: 48000,
                        channelCount: 2,
                    },
                    preferCurrentTab: false,
                    selfBrowserSurface: 'exclude',
                    systemAudio: 'include',
                    suppressLocalAudioPlayback: false,
                });

                const audioTracks = screenStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    audioTracks.forEach(t => activeTracksRef.current.push(t));
                    screenStream.getVideoTracks().forEach(t => activeTracksRef.current.push(t));
                    const sysSource = audioCtx.createMediaStreamSource(screenStream);
                    const sysGain = audioCtx.createGain();
                    sysGain.gain.value = systemVolume;
                    sysSource.connect(sysGain);
                    sysGain.connect(dest);
                    sysGain.connect(analyser);
                    systemGainRef.current = sysGain;
                } else {
                    throw new Error('No audio track from screen share — tick "Also share audio" in the dialog.');
                }
            }

            // 3. DECK 1 — disconnect from any previous gain, then rewire
            //    d1SourceRef is created ONCE in useEffect. Never recreated here.
            d1SourceRef.current.disconnect();
            const d1Gain = audioCtx.createGain();
            d1Gain.gain.value = deck1Volume;
            d1SourceRef.current.connect(d1Gain);
            d1Gain.connect(dest);
            d1Gain.connect(analyser);
            deck1GainRef.current = d1Gain;

            // 4. DECK 2 — same pattern
            d2SourceRef.current.disconnect();
            const d2Gain = audioCtx.createGain();
            d2Gain.gain.value = deck2Volume;
            d2SourceRef.current.connect(d2Gain);
            d2Gain.connect(dest);
            d2Gain.connect(analyser);
            deck2GainRef.current = d2Gain;

            // 5. JINGLE
            jingleSourceRef.current.disconnect();
            const jGain = audioCtx.createGain();
            jGain.gain.value = 0.8;
            jingleSourceRef.current.connect(jGain);
            jGain.connect(dest);
            jGain.connect(analyser);

            streamRef.current = dest.stream;
            analyserRef.current = analyser;
            setState(STATES.READY);
            setStatusMsg('Mixer Initialized — Ready to go live');

        } catch (err) {
            console.error('[LiveBroadcast] requestMedia error:', err.name, err.message);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError(
                    'Microphone access denied. Click the 🔒 lock icon in your browser address bar → ' +
                    'Site settings → Microphone → Allow. Then refresh and try again.'
                );
            } else if (err.name === 'NotFoundError') {
                setError('No microphone found. Please connect a microphone and try again.');
            } else if (err.name === 'AbortError' || err.name === 'NotSupportedError') {
                setError('Screen/audio capture was cancelled or is not supported in this browser.');
            } else {
                setError(`Init failed: ${err.message}`);
            }
            setState(STATES.ERROR);
        }
    }, [micVolume, systemVolume, deck1Volume, deck2Volume, selectedMicId]);

    useEffect(() => {
        if (state === STATES.LIVE) {
            timerRef.current = setInterval(() => setLiveSeconds(s => s + 1), 1000);
        } else {
            clearInterval(timerRef.current);
            setLiveSeconds(0);
        }
        if (onBroadcastState) onBroadcastState(state === STATES.LIVE || state === STATES.CONNECTING);
        return () => clearInterval(timerRef.current);
    }, [state, onBroadcastState]);

    // Live volume updates
    useEffect(() => { if (micGainRef.current) micGainRef.current.gain.value = micVolume; }, [micVolume]);
    useEffect(() => { if (systemGainRef.current) systemGainRef.current.gain.value = systemVolume; }, [systemVolume]);
    useEffect(() => { if (deck1GainRef.current) deck1GainRef.current.gain.value = deck1Volume; }, [deck1Volume]);
    useEffect(() => { if (deck2GainRef.current) deck2GainRef.current.gain.value = deck2Volume; }, [deck2Volume]);

    const formatTime = (secs) => {
        const h = Math.floor(secs / 3600).toString().padStart(2, '0');
        const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const handleArtworkChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setArtwork(file);
            if (artworkUrl) URL.revokeObjectURL(artworkUrl);
            setArtworkUrl(URL.createObjectURL(file));
        }
    };

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const updateLiveInfo = useCallback(async () => {
        try {
            const artBase64 = await fileToBase64(artwork);
            const metadata = {
                title: streamTitle,
                artist: streamArtist,
                artwork: artBase64
            };

            // 1. Push to AzuraCast API (affects player metadata - text only)
            await updateLiveMetadata('kotaromiyabi', { title: streamTitle, artist: streamArtist });
            
            // 2. Push to WebSocket Relay (affects app UI via relay's /metadata endpoint)
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'update_metadata',
                    ...metadata
                }));
            }
            
            console.log('[LiveBroadcast] Metadata updated via API and Relay');
        } catch (err) {
            console.error('[LiveBroadcast] Failed to update metadata:', err);
        }
    }, [streamTitle, streamArtist, artwork]);


    const goLive = useCallback(async () => {
        if (!streamRef.current) return;
        setState(STATES.CONNECTING);
        setStatusMsg('Connecting to AzuraCast...');

        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProto}//${window.location.host}/stream-relay`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        const artBase64 = await fileToBase64(artwork);

        ws.onopen = () => {
            setStatusMsg('Connection open — starting stream...');
            
            // Heartbeat to keep connection alive
            ws.pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                ? 'audio/webm;codecs=opus' 
                : MediaRecorder.isTypeSupported('audio/mpeg')
                    ? 'audio/mpeg'
                    : 'audio/webm';

            // Send initialization data with custom metadata and codec info
            ws.send(JSON.stringify({
                type: 'init',
                title: streamTitle,
                artist: streamArtist,
                artwork: artBase64,
                mimeType: mimeType
            }));

            const recorder = new MediaRecorder(streamRef.current, {
                mimeType,
                audioBitsPerSecond: 128000,
            });
            recorderRef.current = recorder;
            recorder.ondataavailable = (e) => { if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
            recorder.start(200);
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'buffering') {
                    setStatusMsg('⏳ Buffering audio... (please wait ~2 sec)');
                } else if (msg.type === 'connected') {
                    setState(STATES.LIVE);
                    setStatusMsg('🔴 LIVE — broadcasting to ' + msg.mount);
                    // updateLiveInfo(); removed: calling Azuracast backend/metadata right after connecting causes Liquidsoap to restart
                    if (jingleRef.current) {
                        jingleRef.current.currentTime = 0;
                        jingleRef.current.play().catch(e => console.error("Jingle failed:", e));
                    }
                } else if (msg.type === 'error') {
                    setError('Relay error: ' + msg.message);
                    stopBroadcast();
                } else if (msg.type === 'disconnected') {
                    stopBroadcast();
                }
            } catch { }
        };

        ws.onerror = (err) => { 
            console.error('[LiveBroadcast] WebSocket error:', err);
            setError('WebSocket connection failed.'); 
            setState(STATES.ERROR); 
        };
        ws.onclose = (e) => { 
            console.warn(`[LiveBroadcast] WebSocket closed. Code: ${e.code}, Reason: ${e.reason}`);
            clearInterval(ws.pingInterval);
            if (state === STATES.LIVE || state === STATES.CONNECTING) {
                if (e.code !== 1000) {
                    setError(`Connection lost (${e.code}). Please check your internet.`);
                }
                stopBroadcast(); 
            }
        };
    }, [state, streamTitle, streamArtist, artwork]);

    // Warning when leaving the page while live
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (state === STATES.LIVE) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [state]);

    const stopBroadcast = useCallback(() => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        if (wsRef.current) {
            try { wsRef.current.send(JSON.stringify({ type: 'stop' })); } catch { }
            wsRef.current.close();
            wsRef.current = null;
        }
        setState(STATES.READY);
        setStatusMsg('Station standby');
    }, [state]);

    // ── Local Recording ─────────────────────────────────────────────────────────
    const startRecording = useCallback(() => {
        if (!streamRef.current) return;
        recChunksRef.current = [];
        setRecSize(0);
        setRecSeconds(0);

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/mpeg')
                ? 'audio/mpeg'
                : 'audio/webm';

        const rec = new MediaRecorder(streamRef.current, {
            mimeType,
            audioBitsPerSecond: 192000,
        });
        localRecorderRef.current = rec;

        rec.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recChunksRef.current.push(e.data);
                setRecSize(prev => prev + e.data.size);
            }
        };

        rec.onstop = () => {
            clearInterval(recTimerRef.current);
            setIsRecording(false);
            const blob = new Blob(recChunksRef.current, { type: mimeType });
            const ext = mimeType.includes('mpeg') ? 'mp3' : 'webm';
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `web3radio-session-${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        };

        rec.start(1000); // chunk every 1s for accurate size tracking
        setIsRecording(true);
        recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    }, []);

    const stopRecording = useCallback(() => {
        if (localRecorderRef.current && localRecorderRef.current.state !== 'inactive') {
            localRecorderRef.current.stop();
        }
        clearInterval(recTimerRef.current);
    }, []);

    // Cleanup recording on unmount
    useEffect(() => () => {
        clearInterval(recTimerRef.current);
        if (localRecorderRef.current && localRecorderRef.current.state !== 'inactive') {
            localRecorderRef.current.stop();
        }
    }, []);

    const releaseMedia = useCallback(() => {
        stopBroadcast();
        // Stop mic / system audio tracks
        activeTracksRef.current.forEach(t => t.stop());
        activeTracksRef.current = [];
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        // Disconnect gain nodes but KEEP AudioContext and MediaElementSources alive!
        // They cannot be recreated without a page reload.
        [micGainRef, systemGainRef, deck1GainRef, deck2GainRef].forEach(ref => {
            if (ref.current) { try { ref.current.disconnect(); } catch {} ref.current = null; }
        });
        if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} analyserRef.current = null; }
        setState(STATES.IDLE);
        setStatusMsg('Ready to go live');
        setMicLabel('');
    }, [stopBroadcast]);

    // --- Playlist Logic ---
    const handleAddFiles = (deckNum, e) => {
        const files = Array.from(e.target.files).map(f => ({
            id: Math.random().toString(36).substr(2, 9),
            name: f.name,
            url: URL.createObjectURL(f)
        }));
        if (deckNum === 1) setPlaylist1(p => [...p, ...files]);
        else setPlaylist2(p => [...p, ...files]);
    };

    const removeTrack = (deckNum, index) => {
        if (deckNum === 1) {
            setPlaylist1(p => p.filter((_, i) => i !== index));
            if (p1Index === index) { audio1Ref.current.pause(); audio1Ref.current.src = ''; setP1Index(-1); }
            else if (p1Index > index) setP1Index(p1Index - 1);
        } else {
            setPlaylist2(p => p.filter((_, i) => i !== index));
            if (p2Index === index) { audio2Ref.current.pause(); audio2Ref.current.src = ''; setP2Index(-1); }
            else if (p2Index > index) setP2Index(p2Index - 1);
        }
    };

    const playTrack = (deckNum, index) => {
        const audio = deckNum === 1 ? audio1Ref.current : audio2Ref.current;
        const list = deckNum === 1 ? playlist1 : playlist2;
        if (index < 0 || index >= list.length) return;

        if (deckNum === 1) setP1Index(index); else setP2Index(index);
        audio.src = list[index].url;
        audio.play().catch(console.error);
    };

    const togglePlay = (deckNum) => {
        const audio = deckNum === 1 ? audio1Ref.current : audio2Ref.current;
        if (audio.paused) audio.play(); else audio.pause();
    };

    // Auto-advance
    useEffect(() => {
        const a1 = audio1Ref.current;
        const a2 = audio2Ref.current;

        const next1 = () => {
            if (p1Repeat) { a1.currentTime = 0; a1.play(); }
            else if (p1Auto && p1Index < playlist1.length - 1) playTrack(1, p1Index + 1);
            else setP1Index(-1);
        };
        const next2 = () => {
            if (p2Repeat) { a2.currentTime = 0; a2.play(); }
            else if (p2Auto && p2Index < playlist2.length - 1) playTrack(2, p2Index + 1);
            else setP2Index(-1);
        };

        a1.onended = next1;
        a2.onended = next2;
        return () => { a1.onended = null; a2.onended = null; };
    }, [playlist1, playlist2, p1Index, p2Index, p1Repeat, p2Repeat, p1Auto, p2Auto]);

    if (!isDJ) {
        return (
            <div className="bg-zinc-900 rounded-2xl flex flex-col items-center justify-center p-12 h-full min-h-[600px] border border-zinc-800 text-center shadow-2xl">
                <AlertCircle className="w-16 h-16 text-red-500 mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                <h2 className="text-3xl font-black text-white mb-3">Access Denied</h2>
                <p className="text-zinc-400 max-w-sm font-medium leading-relaxed">
                    This feature is restricted to authorized DJ wallets only. Please connect a registered DJ wallet to access the Live Broadcast Studio.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-2xl flex flex-col h-full min-h-[700px] border border-zinc-800 shadow-2xl relative">
            {/* Header */}
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-950/20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-fuchsia-600/20 flex items-center justify-center border border-fuchsia-500/30">
                        <Radio className="w-5 h-5 text-fuchsia-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white leading-none">Live Broadcast Studio</h3>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter mt-1">{statusMsg}</p>
                    </div>
                </div>
                <div>
                    {state === STATES.LIVE && (
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-600 border border-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.5)] animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-white inline-block"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">ON AIR</span>
                        </div>
                    )}
                    {state === STATES.CONNECTING && (
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400">
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                            <span className="text-[11px] font-black uppercase tracking-widest">CONNECTING</span>
                        </div>
                    )}
                    {state === STATES.ERROR && (
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
                            <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">ERROR</span>
                        </div>
                    )}
                    {(state === STATES.IDLE || state === STATES.READY || state === STATES.REQUESTING_MEDIA) && (
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500">
                            <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">OFF AIR</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

                {/* VU & Timer Row */}
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <VUMeter analyser={analyserRef.current} isActive={state !== STATES.IDLE} />
                    </div>
                    {state === STATES.LIVE && (
                        <div className="bg-zinc-950 rounded-lg px-4 py-2 border border-zinc-800 min-w-[120px] text-center">
                            <span className="font-mono text-xl font-bold text-red-500">{formatTime(liveSeconds)}</span>
                        </div>
                    )}
                </div>

                {/* Main Layout: Mixer on top, Playlists below in vertical columns */}
                <div className="flex flex-col gap-6">

                    {/* Central Mixer — full width */}
                    <div className="bg-zinc-950/60 rounded-xl border border-zinc-800 p-5 flex flex-col items-center shadow-inner">
                        <div className="flex gap-4 justify-center items-end h-[240px]">
                            <MixerChannel label="Mic" value={micVolume} icon={<Mic />} color="fuchsia" onChange={setMicVolume} />
                            <MixerChannel label="Sys" value={systemVolume} icon={<MonitorUp />} color="violet" onChange={setSystemVolume} />
                            <MixerChannel label="D1" value={deck1Volume} icon={<Play />} color="sky" onChange={setDeck1Volume} />
                            <MixerChannel label="D2" value={deck2Volume} icon={<Play />} color="emerald" onChange={setDeck2Volume} />
                        </div>

                        <div className="mt-6 w-full max-w-lg space-y-3">
                            
                            {/* Metadata Inputs */}
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                                        Stream Title
                                    </label>
                                    <input 
                                        type="text" 
                                        value={streamTitle}
                                        onChange={e => setStreamTitle(e.target.value)}
                                        disabled={state === STATES.LIVE || state === STATES.CONNECTING}
                                        className="w-full bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500 disabled:opacity-50"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                                        Broadcaster
                                    </label>
                                    <input 
                                        type="text" 
                                        value={streamArtist}
                                        onChange={e => setStreamArtist(e.target.value)}
                                        disabled={state === STATES.LIVE || state === STATES.CONNECTING}
                                        className="w-full bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500 disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Artwork Upload */}
                            <div className="flex gap-3 items-center bg-zinc-800/40 p-3 rounded-xl border border-zinc-700/30">
                                <div className="w-16 h-16 rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                                    {artworkUrl ? (
                                        <img src={artworkUrl} alt="Program Art" className="w-full h-full object-cover" />
                                    ) : (
                                        <Image className="w-6 h-6 text-zinc-700" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                                        Program Artwork
                                    </label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            id="art-upload" 
                                            className="hidden" 
                                            onChange={handleArtworkChange} 
                                        />
                                        <label 
                                            htmlFor="art-upload"
                                            className="flex-1 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                                        >
                                            <Upload className="w-3 h-3" /> {artwork ? 'Change' : 'Upload Art'}
                                        </label>
                                        {artwork && (
                                            <button 
                                                onClick={() => { setArtwork(null); setArtworkUrl(null); }}
                                                className="px-2 py-1.5 bg-zinc-800 hover:bg-red-900/20 text-red-500 rounded-lg text-[10px] font-bold border border-red-500/20"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Update Info Button (visible only when live) */}
                            {state === STATES.LIVE && (
                                <button
                                    onClick={updateLiveInfo}
                                    className="w-full py-2 bg-fuchsia-600/20 hover:bg-fuchsia-600/30 border border-fuchsia-500/30 rounded-xl text-[11px] font-black uppercase tracking-widest text-fuchsia-400 transition-all active:scale-95"
                                >
                                    Update Stream Info
                                </button>
                            )}

                            {/* Mic selector */}
                            {micDevices.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                        <Mic className="w-3 h-3" /> Microphone Input
                                    </label>
                                    <select
                                        value={selectedMicId}
                                        onChange={e => setSelectedMicId(e.target.value)}
                                        disabled={state !== STATES.IDLE && state !== STATES.ERROR}
                                        className="w-full bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-600/40 disabled:opacity-50 transition-all"
                                    >
                                        {micDevices.map(d => (
                                            <option key={d.deviceId} value={d.deviceId}>
                                                {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Init buttons — two modes */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => requestMedia('mic')}
                                    disabled={state === STATES.LIVE || state === STATES.CONNECTING}
                                    className="py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold text-white border border-zinc-700/50 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                >
                                    <Mic className="w-3.5 h-3.5 text-fuchsia-400" />
                                    Mic Only
                                </button>
                                <button
                                    onClick={() => requestMedia('system_mic')}
                                    disabled={state === STATES.LIVE || state === STATES.CONNECTING}
                                    className="py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold text-white border border-zinc-700/50 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                >
                                    <MonitorUp className="w-3.5 h-3.5 text-violet-400" />
                                    Mic + System Audio
                                </button>
                            </div>

                            {/* Go Live / Release Media */}
                            <div className="flex gap-2">
                                <button
                                    onClick={goLive}
                                    disabled={state === STATES.LIVE || state === STATES.CONNECTING || state === STATES.IDLE || state === STATES.REQUESTING_MEDIA}
                                    className="flex-[2] py-3 bg-gradient-to-tr from-fuchsia-600 to-violet-600 rounded-xl text-sm font-black uppercase tracking-widest text-white transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:grayscale"
                                >
                                    {state === STATES.CONNECTING ? 'Connecting...' : state === STATES.LIVE ? '🔴 Live' : 'Go Live'}
                                </button>
                                {state !== STATES.IDLE && (
                                    <button
                                        onClick={releaseMedia}
                                        className="flex-1 py-3 bg-zinc-800 hover:bg-red-900/30 text-red-500 rounded-xl text-sm font-bold border border-red-500/30 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                        Release Media
                                    </button>
                                )}
                            </div>

                            {/* ── Recording Panel ── */}
                            {state !== STATES.IDLE && (
                                <div className={`rounded-xl border transition-all ${
                                    isRecording
                                        ? 'bg-red-950/30 border-red-500/40'
                                        : 'bg-zinc-800/30 border-zinc-700/40'
                                } p-3`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            {isRecording && (
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                                            )}
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                                                isRecording ? 'text-red-400' : 'text-zinc-500'
                                            }`}>
                                                {isRecording ? 'Recording' : 'Session Recording'}
                                            </span>
                                            {isRecording && (
                                                <>
                                                    <span className="font-mono text-xs text-red-400">
                                                        {new Date(recSeconds * 1000).toISOString().slice(11, 19)}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-600">
                                                        {recSize < 1024 * 1024
                                                            ? `${(recSize / 1024).toFixed(1)} KB`
                                                            : `${(recSize / (1024 * 1024)).toFixed(1)} MB`}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex gap-1.5">
                                            {!isRecording ? (
                                                <button
                                                    onClick={startRecording}
                                                    disabled={state === STATES.IDLE || state === STATES.REQUESTING_MEDIA}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-lg text-[10px] font-black text-white uppercase tracking-wider transition-all active:scale-95"
                                                >
                                                    <Circle className="w-3 h-3 fill-current" />
                                                    REC
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={stopRecording}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-[10px] font-black text-white uppercase tracking-wider transition-all active:scale-95"
                                                >
                                                    <Square className="w-3 h-3 fill-current" />
                                                    Stop & Save
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {!isRecording && (
                                        <p className="text-[9px] text-zinc-600 mt-1.5 leading-relaxed">
                                            Records the full mixer output locally to your device (WebM/MP3). Independent of live stream.
                                        </p>
                                    )}
                                    {isRecording && (
                                        <p className="text-[9px] text-red-900/80 mt-1.5">
                                            Recording in progress — click <strong>Stop & Save</strong> to download the file.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Active mic label */}
                            {micLabel && (
                                <p className="text-center text-[10px] text-zinc-600 flex items-center justify-center gap-1">
                                    <Mic className="w-3 h-3" />
                                    {micLabel}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Playlists — vertical columns side by side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* Playlist 1 (Deck 1) */}
                        <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/50 flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-800/20">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Playlist 1 — Deck 1</span>
                                <div className="flex gap-1.5">
                                    <button onClick={() => setP1Repeat(!p1Repeat)} className={`p-1 rounded ${p1Repeat ? 'text-fuchsia-400' : 'text-zinc-600'}`}><Repeat className="w-3 h-3" /></button>
                                    <button onClick={() => setP1Auto(!p1Auto)} className={`p-1 rounded ${p1Auto ? 'text-fuchsia-400' : 'text-zinc-600'}`}><Shuffle className="w-3 h-3" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto max-h-[260px] p-2 space-y-1">
                                {playlist1.length === 0 ? (
                                    <div className="h-32 flex flex-col items-center justify-center text-zinc-700 border-2 border-dashed border-zinc-900 rounded-lg m-2">
                                        <Music className="w-8 h-8 mb-2 opacity-20" />
                                        <span className="text-[10px] font-medium">Empty Deck 1</span>
                                    </div>
                                ) : (
                                    playlist1.map((f, i) => (
                                        <div key={f.id} className={`flex items-center gap-1 rounded transition-colors ${i === p1Index ? 'bg-fuchsia-600/20 border border-fuchsia-500/30' : 'hover:bg-zinc-800'}`}>
                                            <button onClick={() => playTrack(1, i)} className={`flex-1 text-left p-2 text-[11px] truncate ${i === p1Index ? 'text-fuchsia-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                                {i + 1}. {f.name}
                                            </button>
                                            <button onClick={() => removeTrack(1, i)} className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors shrink-0" title="Remove">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-3 border-t border-zinc-800">
                                <input type="file" multiple accept="audio/*" id="p-add-1" className="hidden" onChange={(e) => handleAddFiles(1, e)} />
                                <label htmlFor="p-add-1" className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold text-zinc-300 cursor-pointer transition-all border border-zinc-700/50">
                                    <Plus className="w-3.5 h-3.5" /> Playlist 1
                                </label>
                            </div>
                        </div>

                        {/* Playlist 2 (Deck 2) */}
                        <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/50 flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-800/20">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Playlist 2 — Deck 2</span>
                                <div className="flex gap-1.5">
                                    <button onClick={() => setP2Repeat(!p2Repeat)} className={`p-1 rounded ${p2Repeat ? 'text-emerald-400' : 'text-zinc-600'}`}><Repeat className="w-3 h-3" /></button>
                                    <button onClick={() => setP2Auto(!p2Auto)} className={`p-1 rounded ${p2Auto ? 'text-emerald-400' : 'text-zinc-600'}`}><Shuffle className="w-3 h-3" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto max-h-[260px] p-2 space-y-1">
                                {playlist2.length === 0 ? (
                                    <div className="h-32 flex flex-col items-center justify-center text-zinc-700 border-2 border-dashed border-zinc-900 rounded-lg m-2">
                                        <Music className="w-8 h-8 mb-2 opacity-20" />
                                        <span className="text-[10px] font-medium">Empty Deck 2</span>
                                    </div>
                                ) : (
                                    playlist2.map((f, i) => (
                                        <div key={f.id} className={`flex items-center gap-1 rounded transition-colors ${i === p2Index ? 'bg-emerald-600/20 border border-emerald-500/30' : 'hover:bg-zinc-800'}`}>
                                            <button onClick={() => playTrack(2, i)} className={`flex-1 text-left p-2 text-[11px] truncate ${i === p2Index ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                                                {i + 1}. {f.name}
                                            </button>
                                            <button onClick={() => removeTrack(2, i)} className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors shrink-0" title="Remove">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-3 border-t border-zinc-800">
                                <input type="file" multiple accept="audio/*" id="p-add-2" className="hidden" onChange={(e) => handleAddFiles(2, e)} />
                                <label htmlFor="p-add-2" className="flex items-center justify-center gap-2 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold text-zinc-300 cursor-pointer transition-all border border-zinc-700/50">
                                    <Plus className="w-3.5 h-3.5" /> Playlist 2
                                </label>
                            </div>
                        </div>

                    </div>

                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs font-semibold animate-shake">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}
            </div>

            {/* Guide */}
            <div className="p-5 bg-zinc-950/40 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-3">How To Broadcast</p>
                <div className="space-y-2">
                    <div className="flex gap-2.5 text-[11px] text-zinc-500">
                        <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-black shrink-0 border border-zinc-700 mt-0.5">1</div>
                        <span>For system audio, choose <span className="text-violet-400 font-semibold">"Mic + System Audio"</span>. Select your microphone from the dropdown above.</span>
                    </div>
                    <div className="flex gap-2.5 text-[11px]">
                        <div className="w-4 h-4 rounded-full bg-red-900/60 flex items-center justify-center text-[8px] font-black shrink-0 border border-red-700/60 mt-0.5 text-red-400">!</div>
                        <span className="text-red-400/80 font-semibold">CRITICAL: When prompted by Chrome, you MUST check the <em>"Also share system audio"</em> toggle!</span>
                    </div>
                    <div className="flex gap-2.5 text-[11px]">
                        <div className="w-4 h-4 rounded-full bg-amber-900/50 flex items-center justify-center text-[8px] font-black shrink-0 border border-amber-700/50 mt-0.5 text-amber-400">⚠</div>
                        <span className="text-amber-400/80">WARNING: If you play the dashboard radio while broadcasting, ALWAYS use <strong>Headphones</strong> to prevent echoing. Avoid "Mic + System Audio" if playing local station audio.</span>
                    </div>
                    <div className="flex gap-2.5 text-[11px] text-zinc-500">
                        <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-black shrink-0 border border-zinc-700 mt-0.5">3</div>
                        <span>Adjust the volumes of your Mic and System Audio in the mixer above.</span>
                    </div>
                    <div className="flex gap-2.5 text-[11px] text-zinc-500">
                        <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-black shrink-0 border border-zinc-700 mt-0.5">4</div>
                        <span>Press <span className="text-fuchsia-400 font-semibold">Go Live</span> — your audio will seamlessly fade in over the AutoDJ.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MixerChannel({ label, value, icon, onChange, color }) {
    const colorClasses = {
        fuchsia: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
        violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
        sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    };

    return (
        <div className="flex flex-col items-center gap-2 group">
            <div className="h-44 w-10 bg-zinc-950 rounded-lg flex justify-center border border-zinc-900 shadow-inner relative group-hover:border-zinc-700 transition-colors">
                <input
                    type="range" min="0" max="2" step="0.05"
                    value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="h-44 w-2 appearance-none bg-transparent cursor-pointer vertical-slider relative z-10 block m-0 p-0"
                    style={{ writingMode: 'vertical-rl', direction: 'rtl', WebkitAppearance: 'none' }}
                />
                <div className="absolute inset-x-0 bottom-0 bg-zinc-800/20 rounded-b-lg transition-all" style={{ height: `${(value / 2) * 100}%` }} />
            </div>
            <div className="flex flex-col items-center gap-1">
                <div className={`p-1.5 rounded-md border ${colorClasses[color]}`}>
                    {React.cloneElement(icon, { className: 'w-3 h-3' })}
                </div>
                <span className="text-[9px] font-black uppercase text-zinc-600 tracking-tighter">{label}</span>
            </div>
        </div>
    );
}
