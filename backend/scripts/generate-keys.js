const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate key pair
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

// Write private key
fs.writeFileSync(path.join(__dirname, '..', 'jwt_private_key.pem'), privateKey);
console.log('Private key generated: jwt_private_key.pem');

// Write public key
fs.writeFileSync(path.join(__dirname, '..', 'jwt_public_key.pem'), publicKey);
console.log('Public key generated: jwt_public_key.pem');

// Copy public key to AI service
const aiServicePath = path.join(__dirname, '..', '..', 'ai_service');
fs.copyFileSync(
  path.join(__dirname, '..', 'jwt_public_key.pem'),
  path.join(aiServicePath, 'jwt_public_key.pem')
);
console.log('Public key copied to AI service');