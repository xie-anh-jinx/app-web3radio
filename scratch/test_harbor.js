const net = require('net');

const user = 'web3radio';
const pass = 'web3radio';
const auth = Buffer.from(`${user}:${pass}`).toString('base64');

function testConnection(method, mount, headers = []) {
    console.log(`Testing ${method} ${mount}...`);
    const sock = net.createConnection({ host: '127.0.0.1', port: 8005 });
    
    sock.on('connect', () => {
        const lines = [
            `${method} ${mount} ICE/1.0`,
            `Authorization: Basic ${auth}`,
            ...headers,
            '',
            ''
        ];
        sock.write(lines.join('\r\n'));
    });

    sock.on('data', (d) => {
        console.log(`[${method}] Response:\n`, d.toString());
        sock.destroy();
    });

    sock.on('error', (e) => {
        console.log(`[${method}] Error: ${e.message}`);
    });

    sock.on('close', () => {
        console.log(`[${method}] Connection closed`);
    });
}

testConnection('SOURCE', '/');
testConnection('PUT', '/');
