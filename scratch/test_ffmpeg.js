const { spawn } = require('child_process');

const ffArgs = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-probesize', '32768',
    '-analyzeduration', '500000',
    '-fflags', '+nobuffer+flush_packets',
    '-f', 'webm',
    '-i', 'pipe:0',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-flush_packets', '1',
    '-f', 'mp3',
    'pipe:1'
];

const ffmpegProc = spawn('ffmpeg', ffArgs);

ffmpegProc.stdout.on('data', (chunk) => {
    console.log(`[ffmpeg] output chunk: ${chunk.length} bytes`);
});

ffmpegProc.stderr.on('data', (d) => {
    console.log(`[ffmpeg] error: ${d.toString()}`);
});

ffmpegProc.on('close', (code) => {
    console.log(`[ffmpeg] exited with code ${code}`);
});

// We need some valid webm data to feed it...
// We don't have any locally unless we save it from the relay.
