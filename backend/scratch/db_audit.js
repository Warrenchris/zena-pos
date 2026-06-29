const { sequelize } = require('../src/models');
const models = require('../src/models');
const fs = require('fs');
const path = require('path');

async function runAudit() {
  try {
    console.log('--- STARTING DATABASE AUDIT ---');
    await sequelize.authenticate();
    console.log('Database connection successful.\n');

    // 1. List all tables in actual database
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';
    `);
    const dbTableNames = tables.map(t => t.TABLE_NAME);
    console.log('Tables in database:', dbTableNames);

    // 2. Identify duplicate tables (case-insensitive or singular/plural check)
    console.log('\n--- CHECKING FOR DUPLICATE TABLES ---');
    const seen = new Set();
    const duplicates = [];
    for (const name of dbTableNames) {
      const lower = name.toLowerCase();
      if (seen.has(lower)) {
        duplicates.push(name);
      }
      seen.add(lower);
    }
    if (duplicates.length > 0) {
      console.log('🔴 DUPLICATE TABLES DETECTED:', duplicates);
    } else {
      console.log('🟢 No duplicate tables detected (case-insensitive checks).');
    }

    // 3. Compare models vs tables (schema drift)
    console.log('\n--- MODEL TO TABLE COMPARISON (SCHEMA DRIFT) ---');
    const modelList = Object.keys(models).filter(k => k !== 'sequelize' && k !== 'Sequelize');
    
    for (const modelName of modelList) {
      const model = models[modelName];
      const tableName = model.tableName;
      console.log(`Checking model "${modelName}" (maps to table "${tableName}")...`);
      
      if (!dbTableNames.includes(tableName)) {
        console.log(`  🔴 Table "${tableName}" does NOT exist in the database!`);
        continue;
      }

      // Get DB columns
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}';
      `);
      const dbColumnsMap = {};
      columns.forEach(c => {
        dbColumnsMap[c.COLUMN_NAME] = c;
      });

      // Get Model attributes
      const modelAttrs = model.rawAttributes;
      const modelFieldNames = Object.values(modelAttrs).map(attr => attr.field || attr.fieldName);

      // Check for columns in model missing in DB
      for (const attrName in modelAttrs) {
        const attr = modelAttrs[attrName];
        const fieldName = attr.field || attr.fieldName;
        if (!dbColumnsMap[fieldName]) {
          console.log(`  🔴 Drift: Model field "${fieldName}" in "${modelName}" is MISSING in database table "${tableName}"!`);
        }
      }

      // Check for columns in DB missing in model
      for (const colName in dbColumnsMap) {
        if (!modelFieldNames.includes(colName)) {
          console.log(`  🟡 DB Extra: Column "${colName}" exists in table "${tableName}" but is not defined in model "${modelName}".`);
        }
      }
    }

    // 4. Verify indexes
    console.log('\n--- CHECKING INDEXES & FOREIGN KEYS ---');
    // Find all foreign key definitions in information_schema
    const [foreignKeys] = await sequelize.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() 
        AND REFERENCED_TABLE_NAME IS NOT NULL;
    `);
    console.log(`Found ${foreignKeys.length} foreign key constraints in database schema:`);
    foreignKeys.forEach(fk => {
      console.log(`  - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} (Constraint: ${fk.CONSTRAINT_NAME})`);
    });

    // Check for indexes on all foreign keys (performance critical)
    console.log('\nChecking if all foreign key columns have indexes:');
    for (const fk of foreignKeys) {
      const [indexes] = await sequelize.query(`
        SELECT INDEX_NAME, SEQ_IN_INDEX
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = '${fk.TABLE_NAME}' 
          AND COLUMN_NAME = '${fk.COLUMN_NAME}';
      `);
      if (indexes.length === 0) {
        console.log(`  🔴 MISSING INDEX on foreign key: ${fk.TABLE_NAME}.${fk.COLUMN_NAME}`);
      } else {
        // Check if it's the first column in the index
        const firstColIndex = indexes.find(idx => idx.SEQ_IN_INDEX === 1);
        if (!firstColIndex) {
          console.log(`  🟡 INDEX on ${fk.TABLE_NAME}.${fk.COLUMN_NAME} exists but column is not the prefix column (SEQ_IN_INDEX != 1).`);
        }
      }
    }

    // 5. RBAC junction table check
    console.log('\n--- RBAC JCTION TABLE VALIDATION ---');
    const rbacTables = dbTableNames.filter(name => name.toLowerCase().includes('rolepermission'));
    console.log('RBAC related tables in DB:', rbacTables);
    if (rbacTables.includes('RolePermission') && rbacTables.includes('RolePermissions')) {
      console.log('  🔴 BOTH RolePermission (singular) and RolePermissions (plural) exist in the database!');
    } else if (rbacTables.includes('RolePermissions')) {
      console.log('  🟢 Only RolePermissions (plural) table exists. Authoritative schema configuration looks correct.');
    } else {
      console.log('  🔴 RolePermissions (plural) table is MISSING!');
    }

    // Check RolePermissions contents count
    if (rbacTables.includes('RolePermissions')) {
      const [rpCount] = await sequelize.query('SELECT COUNT(*) as count FROM RolePermissions;');
      console.log(`  RolePermissions row count: ${rpCount[0].count}`);
    }

  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await sequelize.close();
    console.log('\n--- AUDIT COMPLETE ---');
  }
}

runAudit();
