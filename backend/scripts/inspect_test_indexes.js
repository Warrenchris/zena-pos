const { Sequelize } = require('sequelize');
const devConfig = require('../src/config/sequelize').development;
const testConfig = require('../src/config/sequelize').test;

async function check(name, config) {
  const s = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: false
  });
  const [indexes] = await s.query('SHOW INDEX FROM `Products`');
  console.log(`\nINDEXES ON Products in ${name} (${config.database}):`);
  console.table(indexes.map(x => ({ key: x.Key_name, col: x.Column_name, unique: x.Non_unique === 0 })));
  await s.close();
}

async function main() {
  await check('development', devConfig);
  await check('test', testConfig);
}

main();
