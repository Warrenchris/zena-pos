require('dotenv').config();
const seq = require('./src/config/database');
seq.query("SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'SalePayments' AND TABLE_SCHEMA = 'zana_pos' AND REFERENCED_TABLE_NAME IS NOT NULL")
  .then(([r]) => { console.log('SalePayments FKs:', JSON.stringify(r, null, 2)); seq.close(); })
  .catch(e => { console.error(e.message); process.exit(1); });
