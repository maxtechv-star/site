/**
 * QuickDeploy - Database Setup Script
 * 
 * This script sets up the PostgreSQL database with required tables and initial data
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create logs directory
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log messages with timestamp
 */
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    
    // Also write to log file
    const logFile = path.join(logsDir, 'setup.log');
    fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Create tables in the database
 */
async function createTables() {
    const client = await pool.connect();
    
    try {
        log('Starting database setup...');
        
        await client.query('BEGIN');
        
        // ============================================
        // Create deployments table
        // ============================================
        log('Creating deployments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS deployments (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                url VARCHAR(500) NOT NULL,
                admin_url VARCHAR(500),
                status VARCHAR(50) DEFAULT 'active',
                file_count INTEGER DEFAULT 0,
                total_size BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
                metadata JSONB DEFAULT '{}',
                INDEX idx_deployments_status (status),
                INDEX idx_deployments_expires (expires_at),
                INDEX idx_deployments_created (created_at)
            )
        `);
        
        // ============================================
        // Create deployment_files table
        // ============================================
        log('Creating deployment_files table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS deployment_files (
                id SERIAL PRIMARY KEY,
                deployment_id VARCHAR(36) NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
                file_path TEXT NOT NULL,
                original_name VARCHAR(500),
                file_size BIGINT NOT NULL,
                mime_type VARCHAR(100),
                is_directory BOOLEAN DEFAULT false,
                parent_path TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(deployment_id, file_path),
                INDEX idx_deployment_files_deployment (deployment_id),
                INDEX idx_deployment_files_path (file_path)
            )
        `);
        
        // ============================================
        // Create users table (for future authentication)
        // ============================================
        log('Creating users table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(100) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                is_verified BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                last_login TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                settings JSONB DEFAULT '{}',
                INDEX idx_users_email (email),
                INDEX idx_users_role (role)
            )
        `);
        
        // ============================================
        // Create user_deployments table (many-to-many)
        // ============================================
        log('Creating user_deployments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_deployments (
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                deployment_id VARCHAR(36) NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
                role VARCHAR(50) DEFAULT 'owner',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, deployment_id),
                INDEX idx_user_deployments_user (user_id),
                INDEX idx_user_deployments_deployment (deployment_id)
            )
        `);
        
        // ============================================
        // Create api_keys table (for future API access)
        // ============================================
        log('Creating api_keys table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                key_hash VARCHAR(255) NOT NULL,
                last_used TIMESTAMP WITH TIME ZONE,
                expires_at TIMESTAMP WITH TIME ZONE,
                permissions JSONB DEFAULT '["deploy:read", "deploy:write"]',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_api_keys_user (user_id),
                INDEX idx_api_keys_hash (key_hash)
            )
        `);
        
        // ============================================
        // Create logs table (for audit trail)
        // ============================================
        log('Creating logs table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                level VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                user_id VARCHAR(36) REFERENCES users(id),
                deployment_id VARCHAR(36) REFERENCES deployments(id),
                ip_address INET,
                user_agent TEXT,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_logs_level (level),
                INDEX idx_logs_created (created_at),
                INDEX idx_logs_user (user_id),
                INDEX idx_logs_deployment (deployment_id)
            )
        `);
        
        // ============================================
        // Create analytics table (for future analytics)
        // ============================================
        log('Creating analytics table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS analytics (
                id SERIAL PRIMARY KEY,
                deployment_id VARCHAR(36) NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                hits INTEGER DEFAULT 0,
                unique_visitors INTEGER DEFAULT 0,
                bandwidth_used BIGINT DEFAULT 0,
                referrers JSONB DEFAULT '[]',
                user_agents JSONB DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(deployment_id, date),
                INDEX idx_analytics_deployment (deployment_id),
                INDEX idx_analytics_date (date)
            )
        `);
        
        // ============================================
        // Create settings table (for system settings)
        // ============================================
        log('Creating settings table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'string',
                category VARCHAR(100) DEFAULT 'general',
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_settings_category (category)
            )
        `);
        
        await client.query('COMMIT');
        log('All tables created successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        log(`Error creating tables: ${error.message}`, 'ERROR');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Insert initial data
 */
async function insertInitialData() {
    const client = await pool.connect();
    
    try {
        log('Inserting initial data...');
        
        await client.query('BEGIN');
        
        // ============================================
        // Create default admin user if enabled
        // ============================================
        if (process.env.ENABLE_REGISTRATION === 'true') {
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@quickdeploy.com';
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
            
            // Check if admin already exists
            const adminCheck = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [adminEmail]
            );
            
            if (adminCheck.rows.length === 0) {
                const userId = require('uuid').v4();
                const passwordHash = await bcrypt.hash(adminPassword, 10);
                
                await client.query(`
                    INSERT INTO users (id, email, username, password_hash, role, is_verified, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    userId,
                    adminEmail,
                    'admin',
                    passwordHash,
                    'admin',
                    true,
                    true
                ]);
                
                log(`Default admin user created: ${adminEmail}`);
            } else {
                log('Admin user already exists');
            }
        }
        
        // ============================================
        // Insert default settings
        // ============================================
        const defaultSettings = [
            {
                key: 'site_name',
                value: 'QuickDeploy',
                type: 'string',
                category: 'general',
                description: 'The name of the deployment platform'
            },
            {
                key: 'site_description',
                value: 'Deploy static sites in seconds',
                type: 'string',
                category: 'general',
                description: 'Site description for SEO'
            },
            {
                key: 'max_file_size',
                value: process.env.MAX_FILE_SIZE || '104857600',
                type: 'number',
                category: 'uploads',
                description: 'Maximum file size in bytes'
            },
            {
                key: 'allowed_file_types',
                value: process.env.ALLOWED_FILE_TYPES || '.html,.css,.js,.json,.png,.jpg,.jpeg,.gif,.svg,.webp,.ico,.woff,.woff2,.ttf,.otf,.txt,.md,.pdf,.zip',
                type: 'string',
                category: 'uploads',
                description: 'Comma-separated list of allowed file extensions'
            },
            {
                key: 'default_expiry_days',
                value: process.env.DEFAULT_EXPIRY_DAYS || '7',
                type: 'number',
                category: 'deployments',
                description: 'Default deployment expiry in days'
            },
            {
                key: 'max_deployments_per_user',
                value: '10',
                type: 'number',
                category: 'deployments',
                description: 'Maximum number of deployments per user'
            },
            {
                key: 'maintenance_mode',
                value: 'false',
                type: 'boolean',
                category: 'system',
                description: 'Enable maintenance mode'
            },
            {
                key: 'enable_registration',
                value: process.env.ENABLE_REGISTRATION || 'false',
                type: 'boolean',
                category: 'authentication',
                description: 'Enable user registration'
            },
            {
                key: 'enable_email_verification',
                value: process.env.ENABLE_EMAIL_VERIFICATION || 'false',
                type: 'boolean',
                category: 'authentication',
                description: 'Require email verification'
            }
        ];
        
        for (const setting of defaultSettings) {
            await client.query(`
                INSERT INTO settings (key, value, type, category, description)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    type = EXCLUDED.type,
                    category = EXCLUDED.category,
                    description = EXCLUDED.description,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                setting.key,
                setting.value,
                setting.type,
                setting.category,
                setting.description
            ]);
        }
        
        log('Default settings inserted/updated');
        
        await client.query('COMMIT');
        log('Initial data inserted successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        log(`Error inserting initial data: ${error.message}`, 'ERROR');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Create database functions
 */
async function createFunctions() {
    const client = await pool.connect();
    
    try {
        log('Creating database functions...');
        
        // ============================================
        // Function to update deployment updated_at
        // ============================================
        await client.query(`
            CREATE OR REPLACE FUNCTION update_deployment_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // ============================================
        // Function to update deployment stats
        // ============================================
        await client.query(`
            CREATE OR REPLACE FUNCTION update_deployment_stats()
            RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    UPDATE deployments 
                    SET 
                        file_count = file_count + 1,
                        total_size = total_size + NEW.file_size,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.deployment_id;
                ELSIF TG_OP = 'DELETE' THEN
                    UPDATE deployments 
                    SET 
                        file_count = file_count - 1,
                        total_size = total_size - OLD.file_size,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = OLD.deployment_id;
                END IF;
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // ============================================
        // Function to clean up expired deployments
        // ============================================
        await client.query(`
            CREATE OR REPLACE FUNCTION cleanup_expired_deployments()
            RETURNS INTEGER AS $$
            DECLARE
                deleted_count INTEGER;
            BEGIN
                WITH deleted AS (
                    DELETE FROM deployments 
                    WHERE expires_at < CURRENT_TIMESTAMP 
                    AND status != 'deleted'
                    RETURNING id
                )
                SELECT COUNT(*) INTO deleted_count FROM deleted;
                
                RETURN deleted_count;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // ============================================
        // Function to get deployment statistics
        // ============================================
        await client.query(`
            CREATE OR REPLACE FUNCTION get_deployment_stats()
            RETURNS TABLE(
                total_deployments BIGINT,
                active_deployments BIGINT,
                expired_deployments BIGINT,
                total_files BIGINT,
                total_storage BIGINT,
                average_file_size NUMERIC,
                deployments_today BIGINT
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    COUNT(*)::BIGINT as total_deployments,
                    COUNT(*) FILTER (WHERE status = 'active' AND expires_at > CURRENT_TIMESTAMP)::BIGINT as active_deployments,
                    COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP)::BIGINT as expired_deployments,
                    COALESCE(SUM(file_count), 0)::BIGINT as total_files,
                    COALESCE(SUM(total_size), 0)::BIGINT as total_storage,
                    COALESCE(AVG(total_size / NULLIF(file_count, 0)), 0)::NUMERIC as average_file_size,
                    COUNT(*) FILTER (WHERE created_at::DATE = CURRENT_DATE)::BIGINT as deployments_today
                FROM deployments
                WHERE status != 'deleted';
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        log('Database functions created successfully!');
        
    } catch (error) {
        log(`Error creating functions: ${error.message}`, 'ERROR');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Create triggers
 */
async function createTriggers() {
    const client = await pool.connect();
    
    try {
        log('Creating database triggers...');
        
        // ============================================
        // Trigger for deployment updated_at
        // ============================================
        await client.query(`
            DROP TRIGGER IF EXISTS update_deployment_timestamp ON deployments;
            CREATE TRIGGER update_deployment_timestamp
            BEFORE UPDATE ON deployments
            FOR EACH ROW
            EXECUTE FUNCTION update_deployment_updated_at();
        `);
        
        // ============================================
        // Trigger for deployment files stats
        // ============================================
        await client.query(`
            DROP TRIGGER IF EXISTS update_deployment_file_stats ON deployment_files;
            CREATE TRIGGER update_deployment_file_stats
            AFTER INSERT OR DELETE ON deployment_files
            FOR EACH ROW
            EXECUTE FUNCTION update_deployment_stats();
        `);
        
        log('Database triggers created successfully!');
        
    } catch (error) {
        log(`Error creating triggers: ${error.message}`, 'ERROR');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Create directories for file storage
 */
function createDirectories() {
    log('Creating storage directories...');
    
    const directories = [
        process.env.UPLOAD_PATH || './uploads',
        process.env.DEPLOYMENT_PATH || './deployments',
        './logs',
        './tmp'
    ];
    
    for (const dir of directories) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            log(`Created directory: ${dir}`);
        }
    }
    
    // Create .gitkeep files in empty directories
    const gitkeepDirs = [
        process.env.UPLOAD_PATH || './uploads',
        process.env.DEPLOYMENT_PATH || './deployments'
    ];
    
    for (const dir of gitkeepDirs) {
        const gitkeepPath = path.join(dir, '.gitkeep');
        if (!fs.existsSync(gitkeepPath)) {
            fs.writeFileSync(gitkeepPath, '');
        }
    }
    
    log('Storage directories created successfully!');
}

/**
 * Main setup function
 */
async function setupDatabase() {
    try {
        log('============================================');
        log('QuickDeploy Database Setup');
        log('============================================');
        
        // Test database connection
        log('Testing database connection...');
        const testClient = await pool.connect();
        const result = await testClient.query('SELECT NOW() as time');
        testClient.release();
        log(`Database connection successful: ${result.rows[0].time}`);
        
        // Create directories
        createDirectories();
        
        // Create tables
        await createTables();
        
        // Create functions
        await createFunctions();
        
        // Create triggers
        await createTriggers();
        
        // Insert initial data
        await insertInitialData();
        
        log('============================================');
        log('Database setup completed successfully!');
        log('============================================');
        
        console.log('\n✅ Database setup completed successfully!');
        console.log('You can now start the server with:');
        console.log('  npm run dev    (for development)');
        console.log('  npm start      (for production)');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Database setup failed!');
        console.error('Error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n⚠️  Database connection refused.');
            console.error('Please check:');
            console.error('1. Your DATABASE_URL in .env file');
            console.error('2. PostgreSQL server is running');
            console.error('3. Database credentials are correct');
        } else if (error.code === '28P01') {
            console.error('\n⚠️  Authentication failed.');
            console.error('Please check your database username and password');
        }
        
        process.exit(1);
    }
}

// Run setup if this script is executed directly
if (require.main === module) {
    setupDatabase();
}

module.exports = {
    setupDatabase,
    createTables,
    insertInitialData,
    createFunctions,
    createTriggers,
    createDirectories
};