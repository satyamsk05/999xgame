const { query } = require('../src/database/db');

async function main() {
  try {
    const res = await query(
      "UPDATE _schema_migrations SET checksum = '5ef913a4bbf208e54ef8d44e48ee70adca630524992ca223287ca985d058c0c7' WHERE version = '001_initial.sql' RETURNING *"
    );
    console.log('Successfully updated migration checksum:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Failed to update checksum:', err);
    process.exit(1);
  }
}

main();
