const sequelize = require('./backend/src/config/database');
const { User, RolePermission, Permission, Shop } = require('./backend/src/models');

async function inspectUser() {
  try {
    await sequelize.authenticate();
    const user = await User.findOne({
      where: { id: 207 }
    });

    if (!user) {
      console.log('User id 207 not found by ID. Searching by email...');
      const userByEmail = await User.findOne({ where: { email: 'achieng@sokosafi.co.ke' } });
      console.log('User by email:', userByEmail ? userByEmail.toJSON() : 'NOT FOUND');
    } else {
      console.log('User id 207:', user.toJSON());
    }

    const allUsersCount = await User.count();
    console.log(`Total users in DB: ${allUsersCount}`);

    const roles = await User.findAll({
      attributes: ['role', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['role'],
      raw: true
    });
    console.log('Role distribution across users:', roles);

  } catch (err) {
    console.error('Error inspecting user:', err);
  } finally {
    try { await sequelize.close(); } catch(e){}
    process.exit(0);
  }
}

inspectUser();
