const sql = require('mssql/msnodesqlv8');

const buildConnectionString = () => {
    const server = process.env.SQL_SERVER || 'HASSANLAPTOP,1433';
    const database = process.env.SQL_DATABASE || 'InvoiceSystem';
    const trustServerCert = (process.env.SQL_TRUST_SERVER_CERT || 'true') === 'true';
    const odbcDriver = process.env.SQL_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server';
    const useWindowsAuth = (process.env.SQL_USE_WINDOWS_AUTH || 'true') === 'true';

    let connString;

    if (useWindowsAuth) {
        connString = `Driver={${odbcDriver}};Server=${server};Database=${database};Trusted_Connection=Yes;Encrypt=No;TrustServerCertificate=${trustServerCert ? 'Yes' : 'No'};`;
    } else {
        const user = process.env.SQL_USER || 'sa';
        const password = process.env.SQL_PASSWORD || '';
        connString = `Driver={${odbcDriver}};Server=${server};Database=${database};Uid=${user};Pwd=${password};Encrypt=No;TrustServerCertificate=${trustServerCert ? 'Yes' : 'No'};`;
    }

    console.log('[DB] Attempting connection to:', server);
    console.log('[DB] Database:', database);
    console.log('[DB] Driver:', odbcDriver);
    return connString;
};

let poolPromise;

function getPool() {
    if (!poolPromise) {
        const tryConnect = async () => {
            const connString = buildConnectionString();
            try {
                const pool = new sql.ConnectionPool({
                    connectionString: connString,
                    driver: 'msnodesqlv8',
                    options: {
                        encrypt: false,
                        trustServerCertificate: true,
                    },
                    requestTimeout: Number(process.env.SQL_TIMEOUT_MS || 30000),
                });
                await pool.connect();
                console.log('[DB] ✅ Connected successfully!');
                return pool;
            } catch (err) {
                console.error('[DB] ❌ Connection failed:');
                console.error('[DB] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
                throw err;
            }
        };

        poolPromise = tryConnect();
    }

    return poolPromise;
}

async function query(text, params = []) {
    const pool = await getPool();
    const request = pool.request();

    if (Array.isArray(params)) {
        params.forEach((param) => {
            if (param && typeof param === 'object') {
                for (const [key, value] of Object.entries(param)) {
                    request.input(key, value);
                }
            }
        });
    }

    return request.query(text);
}

module.exports = {
    sql,
    getPool,
    query,
};
