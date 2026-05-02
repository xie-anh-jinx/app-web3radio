const WebSocket = require('ws');
const net       = require('net');
const http      = require('http');
const { spawn } = require('child_process');

const WS_PORT             = 8765;
const ICECAST_HOST        = '127.0.0.1';
const ICECAST_PORT        = 8005;   // AzuraCast DJ Harbor port
const ICECAST_MOUNT       = '/';
const ICECAST_SOURCE_USER = 'web3radio';
const ICECAST_SOURCE_PASS = 'web3radio';

// How many audio chunks to buffer before starting FFmpeg pipeline
const PRE_BUFFER_CHUNKS   = 10;

// Store current live metadata in memory for the app to poll
let currentLiveMetadata = null;

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/metadata' || req.url === '/stream-relay/metadata') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentLiveMetadata || { live: false }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

// Keep-alive heartbeat
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

console.log(`[relay] WebSocket & HTTP relay listening on port ${WS_PORT}`);

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[relay] Browser client connected from ${clientIp}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let icecastSock   = null;
    let ffmpegProc    = null;
    let preBuffer     = [];
    let pipelineReady = false;
    let streamMeta    = null;  // stored from init message
    let cleaning      = false;

    // ── helpers ────────────────────────────────────────────────
    function safeSend(obj) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    function cleanup(reason) {
        if (cleaning) return;
        cleaning = true;
        console.log(`[relay] Cleanup: ${reason}`);
        
        // Reset global metadata if this was the active stream
        currentLiveMetadata = null;

        if (ffmpegProc) {
            try { ffmpegProc.stdin.end(); } catch {}
            setTimeout(() => {
                try { if (ffmpegProc) ffmpegProc.kill('SIGTERM'); } catch {}
                ffmpegProc = null;
            }, 500);
        }
        if (icecastSock) {
            try { icecastSock.destroy(); } catch {}
            icecastSock = null;
        }
        preBuffer     = [];
        pipelineReady = false;
    }

    // ── start the full pipeline once we have enough buffered audio ──
    function startPipeline() {
        if (pipelineReady || !streamMeta) return;

        const { streamName, mimeType } = streamMeta;
        console.log(`[relay] Pre-buffer full (${preBuffer.length} chunks) — starting FFmpeg`);

        const isWebM = mimeType && (mimeType.includes('webm') || mimeType.includes('opus'));
        const inputFormat = isWebM ? 'webm' : 'mp3';

        const ffArgs = [
            '-hide_banner',
            '-loglevel', 'warning',
            '-probesize', '65536',
            '-analyzeduration', '1000000',
            '-fflags', '+nobuffer+flush_packets',
            '-f', inputFormat,
            '-i', 'pipe:0',
            '-acodec', 'libmp3lame',
            '-ab', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-flush_packets', '1',
            '-f', 'mp3',
            'pipe:1'
        ];

        console.log(`[relay] Spawning FFmpeg: ffmpeg ${ffArgs.join(' ')}`);
        ffmpegProc = spawn('ffmpeg', ffArgs);

        let ffmpegOutputStarted = false;
        let mp3Buffer = [];
        let icecastConnecting = false;

        function connectIcecast() {
            if (icecastConnecting || icecastSock) return;
            icecastConnecting = true;
            console.log(`[relay] FFmpeg produced output. Connecting to Icecast...`);

            icecastSock = net.createConnection({ host: ICECAST_HOST, port: ICECAST_PORT });

            icecastSock.on('connect', () => {
                const auth = Buffer.from(`${ICECAST_SOURCE_USER}:${ICECAST_SOURCE_PASS}`).toString('base64');
                const header = [
                    `SOURCE ${ICECAST_MOUNT} ICE/1.0`,
                    `Authorization: Basic ${auth}`,
                    `User-Agent: butt/0.1.31`,
                    `Host: ${ICECAST_HOST}`,
                    `Content-Type: audio/mpeg`,
                    `ice-name: ${streamName}`,
                    `ice-public: 0`,
                    `ice-description: ${streamName}`,
                    `ice-audio-info: channels=2;samplerate=44100;bitrate=128`,
                    '',
                    ''
                ].join('\r\n');

                icecastSock.write(header);
                console.log(`[relay] Icecast SOURCE header sent — waiting for 200 OK`);
            });

            icecastSock.on('data', (d) => {
                const resp = d.toString();
                if (!pipelineReady) {
                    if (resp.includes('200 OK')) {
                        console.log(`[relay] ✅ Icecast handshake successful — pipeline is LIVE`);
                        pipelineReady = true;
                        safeSend({ type: 'connected', mount: ICECAST_MOUNT });
                        
                        // Flush accumulated MP3 buffer
                        if (mp3Buffer.length > 0) {
                            console.log(`[relay] Flushing ${mp3Buffer.length} MP3 chunks to Icecast`);
                            mp3Buffer.forEach(chunk => icecastSock.write(chunk));
                            mp3Buffer = [];
                        }
                    } else {
                        console.error('[relay] Icecast rejected:', resp.trim());
                        safeSend({ type: 'error', message: 'Icecast rejected: ' + resp.trim() });
                        if (ws.readyState === WebSocket.OPEN) ws.close();
                    }
                }
            });

            icecastSock.on('error', (err) => {
                console.error('[relay] Icecast socket error:', err.message);
                safeSend({ type: 'error', message: err.message });
                if (ws.readyState === WebSocket.OPEN) ws.close();
            });

            icecastSock.on('close', () => {
                console.log('[relay] Icecast connection closed');
                safeSend({ type: 'disconnected' });
                cleanup('icecast closed');
                if (ws.readyState === WebSocket.OPEN) ws.close();
            });
        }

        ffmpegProc.stdout.on('data', (chunk) => {
            if (!ffmpegOutputStarted) {
                ffmpegOutputStarted = true;
                console.log(`[relay] FFmpeg started producing MP3 output (${chunk.length} bytes)`);
                connectIcecast();
            }
            
            if (pipelineReady && icecastSock && !icecastSock.destroyed) {
                icecastSock.write(chunk);
            } else {
                mp3Buffer.push(chunk);
            }
        });

        ffmpegProc.stderr.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg) console.log(`[ffmpeg] ${msg}`);
        });

        ffmpegProc.on('error', (err) => {
            console.error('[relay] FFmpeg spawn error:', err.message);
            safeSend({ type: 'error', message: 'Transcoder error: ' + err.message });
            if (ws.readyState === WebSocket.OPEN) ws.close();
        });

        ffmpegProc.on('close', (code) => {
            console.log(`[relay] FFmpeg exited with code ${code}`);
            cleanup('ffmpeg closed');
            if (ws.readyState === WebSocket.OPEN) ws.close();
        });

        console.log(`[relay] Flushing pre-buffer into FFmpeg...`);
        for (const chunk of preBuffer) {
            if (ffmpegProc.stdin.writable) {
                ffmpegProc.stdin.write(chunk);
            }
        }
        preBuffer = [];
    }

    // ── incoming messages from browser ──────────────────────────
    ws.on('message', (data) => {
        let isString = typeof data === 'string';
        let strData  = '';

        if (!isString && Buffer.isBuffer(data)) {
            if (data[0] === 0x7B) { // '{' character
                isString = true;
                strData  = data.toString('utf8');
            }
        } else if (isString) {
            strData = data;
        }

        if (isString) {
            try {
                const msg = JSON.parse(strData);
                if (msg.type === 'init' && !streamMeta) {
                    const title  = (msg.title  || 'Live DJ Set').trim();
                    const artist = (msg.artist || 'Web3Radio DJ').trim();
                    streamMeta = {
                        streamName: `${artist} - ${title}`,
                        mimeType: msg.mimeType || 'audio/webm;codecs=opus'
                    };
                    
                    // Store global metadata
                    currentLiveMetadata = {
                        live: true,
                        title: title,
                        artist: artist,
                        artwork: msg.artwork || null,
                        timestamp: Date.now()
                    };

                    console.log(`[relay] Init received: ${streamMeta.streamName}`);
                    safeSend({ type: 'buffering', message: 'Buffering audio...' });
                } else if (msg.type === 'update_metadata') {
                    const title = (msg.title || '').trim();
                    const artist = (msg.artist || '').trim();
                    
                    currentLiveMetadata = {
                        ...currentLiveMetadata,
                        title: title,
                        artist: artist,
                        artwork: msg.artwork || currentLiveMetadata?.artwork
                    };
                    console.log(`[relay] Metadata update: ${artist} - ${title}`);
                } else if (msg.type === 'stop') {
                    console.log('[relay] Client requested stop');
                    cleanup('stop message');
                    ws.close();
                }
            } catch (e) {
                console.error('[relay] JSON parse error:', e.message);
            }
            return;
        }

        // Binary audio data
        if (!streamMeta) return;

        if (!pipelineReady && !ffmpegProc) {
            preBuffer.push(data);
            if (preBuffer.length >= PRE_BUFFER_CHUNKS) {
                startPipeline();
            }
        } else if (ffmpegProc && ffmpegProc.stdin.writable) {
            ffmpegProc.stdin.write(data);
        }
    });

    ws.on('close', () => {
        console.log(`[relay] Browser disconnected from ${clientIp}`);
        cleanup('ws close');
    });

    ws.on('error', (err) => {
        console.error('[relay] WebSocket error:', err.message);
        cleanup('ws error');
    });
});

server.listen(WS_PORT, () => {
    console.log(`[relay] Server running on port ${WS_PORT}`);
});

process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
