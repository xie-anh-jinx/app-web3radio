/**
 * stream-relay/index.js
 *
 * WebSocket-to-Icecast relay for the DJ Dashboard live broadcast feature.
 */

const WebSocket = require('ws');
const net = require('net');

const WS_PORT      = 8765;
const ICECAST_HOST = '127.0.0.1';
const ICECAST_PORT = 8005;       // AzuraCast DJ Harbor port
const ICECAST_MOUNT       = '/';
const ICECAST_SOURCE_USER = 'web3radio';
const ICECAST_SOURCE_PASS = 'web3radio';

const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`[relay] WebSocket relay listening on ws://0.0.0.0:${WS_PORT}`);

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[relay] Browser client connected from ${clientIp}`);

    let icecast = null;          // null until 'init' message received
    let pendingAudio = [];       // audio chunks buffered before init

    // ── helpers ────────────────────────────────────────────────
    function safeSend(obj) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    function cleanup(reason) {
        console.log(`[relay] Cleanup: ${reason}`);
        if (icecast) {
            try { icecast.destroy(); } catch {}
            icecast = null;
        }
        pendingAudio = [];
    }

    // ── connect to Icecast with custom metadata ─────────────────
    function connectToIcecast(streamTitle, streamArtist) {
        const streamName = `${streamArtist} - ${streamTitle}`;
        console.log(`[relay] Opening Icecast connection for: ${streamName}`);

        const sock = net.createConnection({ host: ICECAST_HOST, port: ICECAST_PORT });

        sock.on('connect', () => {
            const auth   = Buffer.from(`${ICECAST_SOURCE_USER}:${ICECAST_SOURCE_PASS}`).toString('base64');
            const header = [
                `SOURCE ${ICECAST_MOUNT} ICE/1.0`,
                `Authorization: Basic ${auth}`,
                `Host: ${ICECAST_HOST}`,
                `Content-Type: audio/mpeg`,
                `ice-name: ${streamName}`,
                `ice-public: 1`,
                `ice-description: ${streamName}`,
                `ice-audio-info: bitrate=128;samplerate=44100;channels=2`,
                '',
                ''
            ].join('\r\n');

            sock.write(header);
            console.log(`[relay] Icecast SOURCE sent — confirming to browser`);
            safeSend({ type: 'connected', mount: ICECAST_MOUNT });

            // Flush any audio that arrived before icecast was ready
            if (pendingAudio.length > 0) {
                pendingAudio.forEach(chunk => sock.write(chunk));
                pendingAudio = [];
            }
        });

        sock.on('data', (d) => {
            const resp = d.toString();
            if (resp.includes('401') || resp.includes('403') || resp.includes('Error')) {
                console.error('[relay] Icecast auth/mount error:', resp.trim());
                safeSend({ type: 'error', message: 'Icecast rejected connection: ' + resp.trim() });
                ws.close();
            }
        });

        sock.on('error', (err) => {
            console.error('[relay] Icecast socket error:', err.message);
            safeSend({ type: 'error', message: err.message });
            ws.close();
        });

        sock.on('close', () => {
            console.log('[relay] Icecast connection closed');
            safeSend({ type: 'disconnected' });
            if (ws.readyState === WebSocket.OPEN) ws.close();
        });

        icecast = sock;
    }

    // ── incoming messages from browser ──────────────────────────
    ws.on('message', (data) => {
        let isString = typeof data === 'string';
        let strData = '';
        
        if (!isString && Buffer.isBuffer(data)) {
            // Check if this is a JSON message pretending to be binary
            const prefix = data.slice(0, 1).toString();
            if (prefix === '{') {
                isString = true;
                strData = data.toString('utf8');
            }
        } else if (isString) {
            strData = data;
        }

        if (isString) {
            try {
                const msg = JSON.parse(strData);
                if (msg.type === 'init' && !icecast) {
                    connectToIcecast(
                        (msg.title  || 'Live DJ Set').trim(),
                        (msg.artist || 'Web3Radio DJ').trim()
                    );
                } else if (msg.type === 'update_metadata' && icecast) {
                    const streamName = `${(msg.artist || 'Web3Radio DJ').trim()} - ${(msg.title || 'Live DJ Set').trim()}`;
                    console.log(`[relay] Received live metadata update: ${streamName}`);
                    // Note: We can't easily update Icecast SOURCE headers mid-stream, 
                    // but the frontend is now also pushing to AzuraCast API directly.
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

        // Binary audio
        if (icecast && icecast.writable) {
            icecast.write(data);
        } else {
            pendingAudio.push(data);
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

process.on('SIGINT',  () => { wss.close(() => process.exit(0)); });
process.on('SIGTERM', () => { wss.close(() => process.exit(0)); });
