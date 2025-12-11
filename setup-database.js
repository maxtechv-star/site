require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Supabase configuration missing!');
    console.log('\nAdd to .env:');
    console.log('SUPABASE_URL=https://muigampswuqdswbulgjg.supabase.co');
    console.log('SUPABASE_SERVICE_KEY=your-service-role-key');
    console.log('\nGet service key from:');
    console.log('Supabase Dashboard → Settings → API → service_role key');
    console.log('\n⚠️ Also add these to Vercel Environment Variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupSupabase() {
    try {
        console.log('🚀 Setting up Supabase for QuickDeploy...\n');

        // Check if we can connect first
        console.log('1. Testing Supabase connection...');
        const { error: connectionError } = await supabase.auth.getSession();
        if (connectionError && !connectionError.message.includes('Auth session missing')) {
            throw new Error(`Connection failed: ${connectionError.message}`);
        }
        console.log('✅ Connection successful\n');

        console.log('2. Creating tables...');
        
        // Complete SQL with ALL required tables
        const sql = `
            -- ===========================================
            -- DEPLOYMENTS TABLE
            -- ===========================================
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

            -- ===========================================
            -- DEPLOYMENT_FILES TABLE
            -- ===========================================
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

            -- ===========================================
            -- LOGS TABLE
            -- ===========================================
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

            -- ===========================================
            -- SETTINGS TABLE (MISSING IN YOUR VERSION!)
            -- ===========================================
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                type VARCHAR(50) DEFAULT 'string',
                category VARCHAR(50) DEFAULT 'general',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- ===========================================
            -- CREATE INDEXES FOR PERFORMANCE
            -- ===========================================
            CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
            CREATE INDEX IF NOT EXISTS idx_deployments_expires_at ON deployments(expires_at);
            CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at);
            CREATE INDEX IF NOT EXISTS idx_deployment_files_deployment_id ON deployment_files(deployment_id);
            CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
        `;

        console.log('Executing SQL statements...');

        // Method 1: Try using supabase.rpc first
        try {
            const { error: rpcError } = await supabase.rpc('exec_sql', { sql });
            
            if (!rpcError) {
                console.log('✅ Tables created via Supabase RPC');
            } else {
                // If RPC doesn't exist, try direct connection
                console.log('RPC not available, trying direct connection...');
                throw new Error('RPC not available');
            }
        } catch (rpcError) {
            // Method 2: Direct PostgreSQL connection
            console.log('Using direct PostgreSQL connection...');
            
            const { Client } = require('pg');
            
            // Construct database URL from Supabase URL
            const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
            const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD;
            
            if (!dbPassword) {
                console.error('\n❌ Database password missing!');
                console.log('Add to .env:');
                console.log('SUPABASE_DB_PASSWORD=your-database-password');
                console.log('\nGet password from:');
                console.log('Supabase Dashboard → Settings → Database → Password');
                process.exit(1);
            }
            
            const databaseUrl = `postgresql://postgres:${dbPassword}@${projectRef}.supabase.co:5432/postgres`;
            
            const client = new Client({
                connectionString: databaseUrl,
                ssl: { rejectUnauthorized: false }
            });
            
            await client.connect();
            
            // Split SQL into individual statements and execute
            const statements = sql.split(';').filter(stmt => stmt.trim());
            for (const statement of statements) {
                if (statement.trim()) {
                    await client.query(statement + ';');
                }
            }
            
            await client.end();
            console.log('✅ Tables created via direct PostgreSQL connection');
        }

        console.log('\n3. Setting up storage bucket...');
        
        // Check if bucket exists
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
            console.error('❌ Error listing buckets:', bucketsError.message);
            console.log('⚠️ You may need to create the bucket manually in Supabase Storage');
        } else {
            const bucketExists = buckets.some(b => b.name === 'deployments');
            if (!bucketExists) {
                console.log('Creating "deployments" bucket...');
                const { error: createError } = await supabase.storage.createBucket('deployments', {
                    public: true,
                    fileSizeLimit: 104857600, // 100MB
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
                    console.error('❌ Error creating bucket:', createError.message);
                    console.log('⚠️ Create the bucket manually in Supabase Dashboard → Storage');
                } else {
                    console.log('✅ Storage bucket "deployments" created');
                }
            } else {
                console.log('✅ Storage bucket already exists');
            }
        }

        console.log('\n4. Inserting initial settings...');
        
        const initialSettings = [
            { key: 'site_name', value: 'QuickDeploy', type: 'string', category: 'general' },
            { key: 'site_description', value: 'Deploy static sites in seconds', type: 'string', category: 'general' },
            { key: 'max_file_size', value: process.env.MAX_FILE_SIZE || '104857600', type: 'number', category: 'uploads' },
            { key: 'default_expiry_days', value: process.env.DEFAULT_EXPIRY_DAYS || '7', type: 'number', category: 'deployments' },
            { key: 'max_expiry_days', value: process.env.MAX_EXPIRY_DAYS || '30', type: 'number', category: 'deployments' },
            { key: 'enable_registration', value: process.env.ENABLE_REGISTRATION || 'false', type: 'boolean', category: 'authentication' },
            { key: 'admin_password', value: process.env.ADMIN_PASSWORD || 'admin123', type: 'string', category: 'authentication' },
            { key: 'allowed_file_types', value: process.env.ALLOWED_FILE_TYPES || '.html,.css,.js,.json,.png,.jpg,.jpeg,.gif,.svg,.webp,.ico,.woff,.woff2,.ttf,.otf,.txt,.md,.pdf,.zip', type: 'string', category: 'uploads' }
        ];

        // First, check if settings table exists and is accessible
        const { error: checkSettingsError } = await supabase
            .from('settings')
            .select('key')
            .limit(1);

        if (checkSettingsError && checkSettingsError.code === 'PGRST204') {
            console.error('❌ Settings table not accessible. Did you refresh PostgREST schema cache?');
            console.log('\n⚠️ Go to Supabase Dashboard → API → API Settings → "Refresh Schema Cache"');
        } else {
            // Insert settings
            const { error: settingsError } = await supabase.from('settings').upsert(initialSettings, {
                onConflict: 'key',
                ignoreDuplicates: false
            });

            if (settingsError) {
                console.error('❌ Error inserting settings:', settingsError.message);
                console.log('You can add these manually later');
            } else {
                console.log('✅ Default settings inserted');
            }
        }

        console.log('\n🎉 Supabase setup completed!');
        console.log('\n📋 Next steps:');
        console.log('1. ⚠️ IMPORTANT: Refresh PostgREST schema cache:');
        console.log('   - Go to Supabase Dashboard → API → API Settings');
        console.log('   - Click "Refresh Schema Cache"');
        console.log('');
        console.log('2. Test your setup:');
        console.log('   - Start server: npm run dev');
        console.log('   - Open: http://localhost:3000');
        console.log('   - Check for any database errors');
        console.log('');
        console.log('3. For Vercel deployment:');
        console.log('   - Make sure all environment variables are set in Vercel');
        console.log('   - Deploy and check logs for errors');
        console.log('');
        console.log('4. If tables still not accessible, run this SQL in Supabase:');
        console.log('   NOTIFY pgrst, \'reload schema\';');
        
        // Refresh schema cache via API if possible
        try {
            console.log('\n🔄 Attempting to refresh PostgREST schema cache...');
            const projectRef = supabaseUrl.split('//')[1].split('.')[0];
            const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api/rest`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ operation: 'reload-schema' })
            });
            
            if (response.ok) {
                console.log('✅ Schema cache refresh requested via API');
            } else {
                console.log('⚠️ Manual refresh required (see step 1 above)');
            }
        } catch (apiError) {
            console.log('⚠️ Manual schema cache refresh required');
        }
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n🔌 Database connection refused.');
            console.error('   - Check your internet connection');
            console.error('   - Verify Supabase project is active');
        } else if (error.code === '28P01') {
            console.error('\n🔐 Authentication failed.');
            console.error('   - Check your SUPABASE_SERVICE_KEY');
            console.error('   - Regenerate key in Supabase Dashboard → Settings → API');
        } else if (error.message.includes('self signed certificate')) {
            console.error('\n🔒 SSL certificate issue.');
            console.error('   - This is normal for Supabase');
            console.error('   - The setup should still work');
        }
        
        console.log('\n💡 Troubleshooting tips:');
        console.log('1. Run SQL manually in Supabase SQL Editor:');
        console.log('   - Copy the SQL from this script');
        console.log('   - Execute in Supabase Dashboard → SQL Editor');
        console.log('');
        console.log('2. Check table permissions:');
        console.log('   - Tables need SELECT/INSERT/UPDATE/DELETE permissions');
        console.log('   - Enable Row Level Security if needed');
        
        process.exit(1);
    }
}

// Run setup if called directly
if (require.main === module) {
    setupSupabase();
}

module.exports = { setupSupabase };