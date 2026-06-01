require('dotenv').config();
const sql = require('mssql');

const config = {
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    database: process.env.SQL_SERVER_DATABASE,
    server: process.env.SQL_SERVER_HOST,
    port: parseInt(process.env.SQL_SERVER_PORT || "1433"),
    options: {
        encrypt: process.env.SQL_SERVER_ENCRYPT === 'true',
        trustServerCertificate: true
    }
};

async function testConnection() {
    try {
        console.log('Attempting to connect to SQL Server:', config.server);
        const pool = await sql.connect(config);
        console.log('✅ Successfully connected to ERP database!');
        pool.close();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
}

testConnection();
