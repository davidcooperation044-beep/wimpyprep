const https = require('https');
https.get('https://wimpyai.onrender.com/', (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    const lines = body.split(/\n/);
    const start = Math.max(0, 1180);
    const end = Math.min(lines.length, 1225);
    for (let i = start; i < end; i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  });
}).on('error', (err) => {
  console.error('error', err.message);
});
