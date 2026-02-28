require('dotenv').config();
const db = require('./db');

async function check() {
    try {
        const res = await db.query('SELECT * FROM wallets');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await db.pool.end();
    }
}

check();
