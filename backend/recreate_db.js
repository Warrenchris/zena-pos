const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3307,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'root'
  });

  console.log('Connected to MySQL server.');
  await connection.query('DROP DATABASE IF EXISTS zana_pos;');
  console.log('Database dropped.');
  await connection.query('CREATE DATABASE zana_pos;');
  console.log('Database zana_pos created successfully.');
  await connection.end();
}

run().catch(err => {
  console.error('Failed to recreate database:', err);
  process.exit(1);
});
