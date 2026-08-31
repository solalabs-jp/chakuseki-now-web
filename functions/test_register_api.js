const http = require('http');

const postData = JSON.stringify({
  email: 'test_register3@example.com',
  password: 'password123',
  role: 'student',
  classId: 'class-1A'
});

const options = {
  hostname: '127.0.0.1',
  port: 5001,
  path: '/chakuseki-now/us-central1/registerUser',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('RESPONSE:', data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
