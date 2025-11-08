const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Write keys to files
fs.writeFileSync(path.join(__dirname, '../jwt_private_key.pem'), privateKey);
fs.writeFileSync(path.join(__dirname, '../jwt_public_key.pem'), publicKey);

console.log('RSA key pair generated successfully!');