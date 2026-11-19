import {db,pool} from './client.js';
import {sql} from 'drizzle-orm';

async function testConnection() {
    try{
        const result = await db.execute(sql`
        SELECT
            current_database() AS database,
            current_user AS user,
            version() AS version,
            current_timestamp AS server_time
        `);

        console.log('database connection successful');
        console.log(result.rows[0]);
    }
    catch (error){
        console.error('database connection failed', error);
        process.exitCode = 1;
    }
    finally{
        await pool.end();
    }
    }

testConnection();