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

async function testQuery() {
    try {
        const pool = await sql.connect(config);
        console.log('✅ Connected to ERP database! Fetching data...\n');
        
        // Fetching top 3 recent invoices to confirm data access
        const result = await pool.request().query(`
            SELECT TOP 3 
                sales_invoice_header_id, 
                voucher_date,
                DATE_OF_REMOVAL, 
                confirmed 
            FROM dbo.Sales_Invoice_Header 
            ORDER BY sales_invoice_header_id DESC
        `);
        
        console.log('--- RECENT INVOICES ---');
        console.table(result.recordset);
        
        pool.close();
    } catch (err) {
        console.error('❌ Database query failed:', err.message);
    }
}

testQuery();
