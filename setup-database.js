require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase configuration missing!');
    console.log('\nAdd to .env:');
    console.log('SUPABASE_URL=https://muigampswuqdswbulgjg.supabase.co');
    console.log('SUPABASE_SERVICE_KEY=your-service-role-key');
    console.log('\nGet service key from:');
    console.log('Supabase Dashboard → Settings → API → service_role key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupSupabase() {
    try {
        console.log('Setting up Supabase for QuickDeploy...\n');

        const sql = `
            CREATE TABLE IF NOT EXISTS deployments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                description TEXT,
                url VARCHAR(500) NOT NULL,
                admin_url VARCHAR(500),
                status VARCHAR(50) DEFAULT 'active',
                file_count INTEGER DEFAULT 0,
                total_size BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
                metadata JSONB DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS deployment_files (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
                file_path TEXT NOT NULL,
                original_name VARCHAR(500),
                file_size BIGINT NOT NULL,
                mime_type VARCHAR(100),
                storage_path TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                level VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                user_id UUID,
                deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;

        const { error } = await supabase.rpc('exec_sql', { sql });

        if (error) {
            console.log('Using direct SQL execution...');
            
            const { Client } = require('pg');
            
            const databaseUrl = process.env.DATABASE_URL || 
                `postgresql://postgres:password@${supabaseUrl.replace('https://', '').split('.')[0]}.supabase.co:5432/postgres`;
            
            const client = new Client({
                connectionString: databaseUrl,
                ssl: { rejectUnauthorized: false }
            });
            
            await client.connect();
            await client.query(sql);
            await client.end();
            
            console.log('Tables created via direct connection');
        } else {
            console.log('Tables created via Supabase RPC');
        }

        console.log('\n2. Creating storage bucket...');
        
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
            console.error('Error listing buckets:', bucketsError.message);
        } else {
            const bucketExists = buckets.some(b => b.name === 'deployments');
            if (!bucketExists) {
                const { error: createError } = await supabase.storage.createBucket('deployments', {
                    public: true,
                    fileSizeLimit: 104857600,
                    allowedMimeTypes: [
                        'text/html',
                        'text/css',
                        'application/javascript',
                        'application/json',
                        'image/*',
                        'font/*',
                        'text/plain',
                        'application/pdf',
                        'application/zip'
                    ]
                });
                
                if (createError) {
                    console.error('Error creating bucket:', createError.message);
                } else {
                    console.log('Storage bucket "deployments" created');
                }
            } else {
                console.log('Storage bucket already exists');
            }
        }

        console.log('\n3. Inserting initial data...');
        
        const initialSettings = [
            { key: 'site_name', value: 'QuickDeploy', type: 'string', category: 'general' },
            { key: 'site_description', value: 'Deploy static sites in seconds', type: 'string', category: 'general' },
            { key: 'max_file_size', value: process.env.MAX_FILE_SIZE || '104857600', type: 'number', category: 'uploads' },
            { key: 'default_expiry_days', value: process.env.DEFAULT_EXPIRY_DAYS || '7', type: 'number', category: 'deployments' },
            { key: 'enable_registration', value: process.env.ENABLE_REGISTRATION || 'false', type: 'boolean', category: 'authentication' }
        ];

        const { error: settingsError } = await supabase.from('settings').upsert(initialSettings, {
            onConflict: 'key',
            ignoreDuplicates: false
        });

        if (settingsError) {
            console.error('Error inserting settings:', settingsError.message);
        } else {
            console.log('Default settings inserted');
        }

        console.log('\n✅ Supabase setup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Start the server: npm run dev');
        console.log('2. Open: http://localhost:3000');
        console.log('3. Create your first deployment');
        
    } catch (error) {
        console.error('Setup failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\nDatabase connection refused.');
            console.error('Please check your Supabase database connection.');
        } else if (error.code === '28P01') {
            console.error('\nAuthentication failed.');
            console.error('Please check your Supabase credentials.');
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    setupSupabase();
}

module.exports = { setupSupabase };