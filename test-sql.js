const sql = require('mssql');

const config = {
    user: 'AiLogin',
    password: "'Si$co@889!'",
    database: 'SiscoERP_Data',
    server: '157.119.203.167',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testConnection() {
    try {
        console.log('Attempting to connect to SQL Server:', config.server);
        const pool = await sql.connect(config);
        console.log('✅ Successfully connected to ERP database!');
        const result = await sql.query`SELECT TOP 1 * FROM INFORMATION_SCHEMA.TABLES`;
        console.log('Query result:', result.recordset);
        pool.close();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        if (err.originalError) {
             console.error('Original Error:', err.originalError.message);
        }
    }
}

testConnection();
