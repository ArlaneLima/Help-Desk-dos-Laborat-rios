const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // nunca no codigo
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});
pool.on('error', (e) => console.error('erro no pool:', e.message));

module.exports = pool;
