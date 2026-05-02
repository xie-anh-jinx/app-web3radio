const net = require('net');

const user = 'web3radio';
const pass = 'web3radio';
const auth = Buffer.from(`${user}:${pass}`).toString('base64');

function testConnection(label, headers) {
    console.log(`Testing ${label}...`);
    const sock = net.createConnection({ host: '127.0.0.1', port: 8005 });
    
    sock.on('connect', () => {
        const header = headers.join('\r\n') + '\r\n\r\n';
        sock.write(header);
    });

    sock.on('data', (d) => {
        console.log(`[${label}] Response:\n`, d.toString());
        // Do NOT destroy immediately, wait to see if it closes
    });

    sock.on('error', (e) => {
        console.log(`[${label}] Error: ${e.message}`);
    });

    sock.on('close', () => {
        console.log(`[${label}] Connection closed`);
    });
    
    setTimeout(() => {
        if (!sock.destroyed) {
            console.log(`[${label}] Still open after 2s - Success?`);
            sock.write(Buffer.alloc(1024)); // Send some dummy data
            setTimeout(() => sock.destroy(), 1000);
        }
    }, 2000);
}

// 1. Current attempt
testConnection('CURRENT', [
    'SOURCE / ICE/1.0',
    `Authorization: Basic ${auth}`,
    'Content-Type: audio/mpeg',
    'ice-name: Test Stream'
]);

// 2. Added User-Agent (butt style)
testConnection('BUTT_UA', [
    'SOURCE / ICE/1.0',
    `Authorization: Basic ${auth}`,
    'User-Agent: butt/0.1.31',
    'Content-Type: audio/mpeg',
    'ice-name: Test Stream UA'
]);

// 3. Different Mount
testConnection('LIVE_MOUNT', [
    'SOURCE /live ICE/1.0',
    `Authorization: Basic ${auth}`,
    'Content-Type: audio/mpeg'
]);
