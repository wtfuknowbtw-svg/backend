const { Client } = require('pg');

const connectionString = "postgresql://neondb_owner:npg_ZVK0y8dBcHAn@ep-flat-dream-a1g37dfu-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = new Client({
  connectionString: connectionString,
});

client.connect()
  .then(() => {
    console.log('✅ Connected to Neon PostgreSQL successfully!');
    return client.query('SELECT version()');
  })
  .then((result) => {
    console.log('Database version:', result.rows[0].version);
    return client.query('SELECT current_database()');
  })
  .then((result) => {
    console.log('Current database:', result.rows[0].current_database);
    return client.end();
  })
  .then(() => {
    console.log('✅ Connection closed successfully');
  })
  .catch((err) => {
    console.error('❌ Connection failed:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  });
