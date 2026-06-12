const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query('SELECT * FROM api_keys WHERE is_system = true'))
  .then(res => {
    if(res.rows.length === 0) {
      return client.query("INSERT INTO api_keys (key_name, api_key, is_system, daily_limit, status) VALUES ('System Key 1', $1, true, 20, 'healthy')", [process.env.AI_INTEGRATIONS_GEMINI_API_KEY]).then(() => console.log('Seeded!'));
    }
    console.log('Already seeded');
  })
  .catch(console.error)
  .finally(() => client.end());
