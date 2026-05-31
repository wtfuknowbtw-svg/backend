const https = require('https');

const data = JSON.stringify({ phone: "9999999999", otp: "000000" });

const options = {
  hostname: 'apnabackend-theta.vercel.app',
  port: 443,
  path: '/api/mobile-login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
