const { Sequelize } = require('sequelize');
const config = require('../src/config/sequelize').test;
const s = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  logging: false
});

async function main() {
  const [indexes] = await s.query('SHOW INDEX FROM `Products`');
  console.log('INDEXES ON Products in zana_pos_test:');
  console.table(indexes.map(x => ({ key: x.Key_name, col: x.Column_name, unique: x.Non_unique === 0 })));
  await s.close();
}
main();
