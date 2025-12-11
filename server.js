require('dotenv').config();

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const methodOverride = require('method-override');
const moment = require('moment');
const NodeCache = require('node-cache');
const { createClient } = require('@supabase/supabase-js');

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const isProduction = process.env.NODE_ENV === 'production';

const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: isVercel ? `https://${process.env.VERCEL_URL}` : (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`),
    
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    
    sessionSecret: process.env.SESSION_SECRET || 'quickdeploy-secret-key-change-in-production',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024,
    maxFiles: parseInt(process.env.MAX_FILES) || 50,
    
    defaultExpiryDays: parseInt(process.env.DEFAULT_EXPIRY_DAYS) || 7,
    maxExpiryDays: parseInt(process.env.MAX_EXPIRY_DAYS) || 30,
    
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || '.html,.css,.js,.json,.png,.jpg,.jpeg,.gif,.svg,.webp,.ico,.woff,.woff2,.ttf,.otf,.txt,.md,.pdf,.zip')
        .split(',')
        .map(ext => ext.trim().toLowerCase()),
    
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
};

if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.error('❌ Supabase configuration missing!');
    console.error('Add to .env:');
    console.error('SUPABASE_URL=https://muigampswuqdswbulgjg.supabase.co');
    console.error('SUPABASE_SERVICE_KEY=your-service-role-key');
    if (isVercel) {
        console.error('Also add these to Vercel Environment Variables');
    }
    if (!isVercel) process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('_test').select('count').limit(1);
        if (error && !error.message.includes('does not exist')) {
            throw error;
        }
        console.log('✅ Supabase connection successful');
        return true;
    } catch (error) {
        console.error('❌ Supabase connection failed:', error.message);
        if (!isVercel) process.exit(1);
        return false;
    }
}

async function ensureDatabaseTables() {
    console.log('🔍 Checking database tables...');
    
    try {
        const { data: tableCheck, error: tableError } = await supabase
            .from('deployments')
            .select('*')
            .limit(1);

        if (tableError && tableError.code === 'PGRST204') {
            console.log('❌ deployments table not found in schema cache.');
            console.log('⚠️ You need to:');
            console.log('   1. Run setup-database.js');
            console.log('   2. Refresh schema cache in Supabase Dashboard');
            console.log('');
            console.log('Run: node setup-database.js');
            
            return false;
        }
        
        console.log('✅ Database tables are accessible');
        return true;
        
    } catch (error) {
        console.error('❌ Database check failed:', error.message);
        return false;
    }
}

const cache = new NodeCache({ stdTTL: 600 });

const app = express();

if (isVercel) {
    app.use(helmet({
        contentSecurityPolicy: false
    }));
} else {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://code.jquery.com"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "https:"],
            }
        }
    }));
}

app.use(compression());

app.use(cors({
    origin: config.env === 'development' ? true : process.env.CORS_ORIGIN,
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(methodOverride('_method'));

app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
    windowMs: config.rateLimitWindow * 60 * 1000,
    max: config.rateLimitMax,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(session({
    store: new MemoryStore({
        checkPeriod: 86400000
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.maxFileSize,
        files: config.maxFiles
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (config.allowedFileTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} is not allowed`));
        }
    }
});

function getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();
    const iconMap = {
        '.html': 'fas fa-code',
        '.htm': 'fas fa-code',
        '.css': 'fab fa-css3-alt',
        '.js': 'fab fa-js-square',
        '.json': 'fas fa-file-code',
        '.png': 'fas fa-file-image',
        '.jpg': 'fas fa-file-image',
        '.jpeg': 'fas fa-file-image',
        '.gif': 'fas fa-file-image',
        '.svg': 'fas fa-file-image',
        '.webp': 'fas fa-file-image',
        '.ico': 'fas fa-file-image',
        '.woff': 'fas fa-font',
        '.woff2': 'fas fa-font',
        '.ttf': 'fas fa-font',
        '.otf': 'fas fa-font',
        '.zip': 'fas fa-file-archive',
        '.txt': 'fas fa-file-alt',
        '.md': 'fas fa-file-alt',
        '.pdf': 'fas fa-file-pdf',
        default: 'fas fa-file'
    };
    
    return iconMap[ext] || iconMap.default;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getMimeType(filename) {
    const mimeTypes = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.zip': 'application/zip',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.pdf': 'application/pdf',
    };
    
    const ext = path.extname(filename).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

function isValidDeploymentName(name) {
    return /^[a-zA-Z0-9\s\-_]+$/.test(name) && name.length >= 1 && name.length <= 100;
}

async function logActivity(level, message, userId = null, deploymentId = null, req = null) {
    try {
        await supabase.from('logs').insert({
            level,
            message,
            user_id: userId,
            deployment_id: deploymentId,
            ip_address: req?.ip || null,
            user_agent: req?.get('User-Agent') || null,
            metadata: { url: req?.originalUrl, method: req?.method }
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}

app.use((req, res, next) => {
    res.locals.currentPage = req.path.split('/')[1] || 'home';
    res.locals.baseUrl = config.baseUrl;
    res.locals.title = 'QuickDeploy';
    res.locals.messages = req.session.messages || {};
    delete req.session.messages;
    res.locals.formatBytes = formatBytes;
    res.locals.getFileIcon = getFileIcon;
    next();
});

app.get('/', async (req, res) => {
    try {
        const cacheKey = 'recent_deployments';
        let recentDeployments = cache.get(cacheKey);
        let stats = cache.get('stats');
        
        if (!recentDeployments) {
            const { data, error } = await supabase
                .from('deployments')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (error && error.code === 'PGRST204') {
                return res.render('index', {
                    title: 'Dashboard',
                    recentDeployments: [],
                    stats: {
                        total_deployments: 0,
                        active_deployments: 0,
                        total_size: 0,
                        total_files: 0,
                        expiring_soon: 0
                    },
                    deploymentsCount: 0,
                    setupRequired: true
                });
            }
            
            if (error) throw error;
            
            recentDeployments = data || [];
            cache.set(cacheKey, recentDeployments, 60);
        }
        
        if (!stats) {
            const { data: deploymentsData, error: deploymentsError } = await supabase
                .from('deployments')
                .select('total_size, file_count, expires_at');
            
            if (deploymentsError && deploymentsError.code === 'PGRST204') {
                stats = {
                    total_deployments: 0,
                    active_deployments: 0,
                    total_size: 0,
                    total_files: 0,
                    expiring_soon: 0
                };
            } else if (deploymentsError) {
                throw deploymentsError;
            } else {
                const now = new Date();
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                
                stats = {
                    total_deployments: deploymentsData?.length || 0,
                    active_deployments: deploymentsData?.filter(d => new Date(d.expires_at) > now).length || 0,
                    total_size: deploymentsData?.reduce((sum, d) => sum + (d.total_size || 0), 0) || 0,
                    total_files: deploymentsData?.reduce((sum, d) => sum + (d.file_count || 0), 0) || 0,
                    expiring_soon: deploymentsData?.filter(d => {
                        const exp = new Date(d.expires_at);
                        return exp > now && exp < tomorrow;
                    }).length || 0
                };
            }
            
            cache.set('stats', stats, 300);
        }
        
        res.render('index', {
            title: 'Dashboard',
            recentDeployments,
            stats,
            deploymentsCount: recentDeployments.length,
            setupRequired: false
        });
        
        await logActivity('info', 'Accessed dashboard', null, null, req);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load dashboard',
            status: 500,
            error: { message: error.message }
        });
    }
});

app.get('/upload', (req, res) => {
    const uploadType = req.query.type || 'files';
    res.render('upload', {
        title: 'New Deployment',
        uploadType,
        maxFileSize: formatBytes(config.maxFileSize),
        allowedFileTypes: config.allowedFileTypes.join(', ')
    });
});

app.get('/admin', async (req, res) => {
    try {
        const { data: deployments, error: deploymentsError } = await supabase
            .from('deployments')
            .select('*')
            .neq('status', 'deleted')
            .order('created_at', { ascending: false });
        
        if (deploymentsError && deploymentsError.code === 'PGRST204') {
            return res.render('admin', {
                title: 'Admin Panel',
                allDeployments: [],
                adminStats: {
                    total_deployments: 0,
                    active_deployments: 0,
                    expired_deployments: 0,
                    total_storage: 0,
                    active_days: 0
                },
                deploymentsCount: 0,
                setupRequired: true
            });
        }
        
        if (deploymentsError) throw deploymentsError;
        
        const now = new Date();
        const adminStats = {
            total_deployments: deployments?.length || 0,
            active_deployments: deployments?.filter(d => new Date(d.expires_at) > now).length || 0,
            expired_deployments: deployments?.filter(d => new Date(d.expires_at) <= now).length || 0,
            total_storage: deployments?.reduce((sum, d) => sum + (d.total_size || 0), 0) || 0,
            active_days: new Set(deployments?.map(d => new Date(d.created_at).toDateString())).size || 0
        };
        
        res.render('admin', {
            title: 'Admin Panel',
            allDeployments: deployments || [],
            adminStats,
            deploymentsCount: deployments?.length || 0,
            setupRequired: false
        });
        
        await logActivity('info', 'Accessed admin panel', null, null, req);
        
    } catch (error) {
        console.error('Error loading admin panel:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load admin panel',
            status: 500,
            error: { message: error.message }
        });
    }
});

app.get('/deployment/:id', async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        const { data: deployment, error: deploymentError } = await supabase
            .from('deployments')
            .select('*')
            .eq('id', deploymentId)
            .single();
        
        if (deploymentError && deploymentError.code === 'PGRST204') {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Database table not found. Please run setup.',
                status: 404,
                error: { message: 'Table deployments does not exist' }
            });
        }
        
        if (deploymentError || !deployment) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Deployment not found',
                status: 404,
                error: { message: deploymentError?.message || 'Deployment not found' }
            });
        }
        
        const { data: files, error: filesError } = await supabase
            .from('deployment_files')
            .select('*')
            .eq('deployment_id', deploymentId)
            .order('file_path');
        
        if (filesError && filesError.code === 'PGRST204') {
            return res.render('deployment', {
                title: deployment.name || 'Deployment',
                deployment,
                files: []
            });
        }
        
        if (filesError) throw filesError;
        
        res.render('deployment', {
            title: deployment.name || 'Deployment',
            deployment,
            files: files || []
        });
        
        await logActivity('info', `Viewed deployment ${deploymentId}`, null, deploymentId, req);
        
    } catch (error) {
        console.error('Error loading deployment:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load deployment',
            status: 500,
            error: { message: error.message }
        });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const { data: deployments, error } = await supabase
            .from('deployments')
            .select('total_size, file_count, expires_at');
        
        if (error && error.code === 'PGRST204') {
            return res.json({
                success: true,
                totalDeployments: 0,
                activeDeployments: 0,
                totalSize: 0,
                totalFiles: 0,
                expiringSoon: 0,
                setupRequired: true
            });
        }
        
        if (error) throw error;
        
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        const stats = {
            totalDeployments: deployments?.length || 0,
            activeDeployments: deployments?.filter(d => new Date(d.expires_at) > now).length || 0,
            totalSize: deployments?.reduce((sum, d) => sum + (d.total_size || 0), 0) || 0,
            totalFiles: deployments?.reduce((sum, d) => sum + (d.file_count || 0), 0) || 0,
            expiringSoon: deployments?.filter(d => {
                const exp = new Date(d.expires_at);
                return exp > now && exp < tomorrow;
            }).length || 0
        };
        
        res.json({
            success: true,
            ...stats
        });
        
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system stats',
            details: error.message
        });
    }
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
    try {
        const deploymentId = uuidv4();
        const deploymentName = req.body.name || `Deployment-${Date.now()}`;
        const deploymentDesc = req.body.description || '';
        const expiryDays = parseInt(req.body.expiryDays) || config.defaultExpiryDays;
        
        if (!isValidDeploymentName(deploymentName)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid deployment name'
            });
        }
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Math.min(expiryDays, config.maxExpiryDays));
        
        let totalSize = 0;
        const fileRecords = [];
        
        for (const file of req.files) {
            const filePath = `${deploymentId}/${file.originalname}`;
            
            const { data, error } = await supabase.storage
                .from('deployments')
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });
            
            if (error) throw error;
            
            totalSize += file.size;
            fileRecords.push({
                deployment_id: deploymentId,
                file_path: file.originalname,
                original_name: file.originalname,
                file_size: file.size,
                mime_type: file.mimetype,
                storage_path: data.path
            });
        }
        
        const deploymentUrl = `${config.supabaseUrl}/storage/v1/object/public/deployments/${deploymentId}`;
        const adminUrl = `${config.baseUrl}/deployment/${deploymentId}`;
        
        const { data: deployment, error: deploymentError } = await supabase
            .from('deployments')
            .insert({
                id: deploymentId,
                name: deploymentName,
                description: deploymentDesc,
                url: deploymentUrl,
                admin_url: adminUrl,
                file_count: fileRecords.length,
                total_size: totalSize,
                expires_at: expiresAt.toISOString(),
                status: 'active'
            })
            .select()
            .single();
        
        if (deploymentError) {
            if (deploymentError.code === 'PGRST204') {
                return res.status(500).json({
                    success: false,
                    error: 'Database table not found. Please run setup.'
                });
            }
            throw deploymentError;
        }
        
        if (fileRecords.length > 0) {
            const { error: filesError } = await supabase
                .from('deployment_files')
                .insert(fileRecords);
            
            if (filesError && filesError.code === 'PGRST204') {
                console.warn('deployment_files table not found, skipping file records');
            } else if (filesError) {
                throw filesError;
            }
        }
        
        cache.del('recent_deployments');
        cache.del('stats');
        
        await logActivity('info', `Created deployment ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            deploymentId,
            url: deploymentUrl,
            adminUrl,
            fileCount: fileRecords.length,
            totalSize,
            message: 'Deployment created successfully'
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
});

app.get('/api/deployments/:id', async (req, res) => {
    try {
        const { data: deployment, error: deploymentError } = await supabase
            .from('deployments')
            .select('*')
            .eq('id', req.params.id)
            .single();
        
        if (deploymentError && deploymentError.code === 'PGRST204') {
            return res.status(404).json({
                success: false,
                error: 'Database table not found'
            });
        }
        
        if (deploymentError || !deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }
        
        const { data: files, error: filesError } = await supabase
            .from('deployment_files')
            .select('*')
            .eq('deployment_id', req.params.id);
        
        if (filesError && filesError.code === 'PGRST204') {
            return res.json({
                success: true,
                deployment,
                files: []
            });
        }
        
        if (filesError) throw filesError;
        
        res.json({
            success: true,
            deployment,
            files: files || []
        });
        
    } catch (error) {
        console.error('Error getting deployment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get deployment'
        });
    }
});

app.delete('/api/deployments/:id', async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        const { data: deployment, error: checkError } = await supabase
            .from('deployments')
            .select('*')
            .eq('id', deploymentId)
            .single();
        
        if (checkError && checkError.code === 'PGRST204') {
            return res.status(404).json({
                success: false,
                error: 'Database table not found'
            });
        }
        
        if (checkError || !deployment) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }
        
        const { error: deleteError } = await supabase
            .from('deployments')
            .update({ 
                status: 'deleted',
                updated_at: new Date().toISOString()
            })
            .eq('id', deploymentId);
        
        if (deleteError) throw deleteError;
        
        const { data: files, error: filesError } = await supabase
            .from('deployment_files')
            .select('storage_path')
            .eq('deployment_id', deploymentId);
        
        if (!filesError && files && files.length > 0) {
            const filePaths = files.map(f => f.storage_path).filter(Boolean);
            if (filePaths.length > 0) {
                await supabase.storage
                    .from('deployments')
                    .remove(filePaths);
            }
        }
        
        cache.del('recent_deployments');
        cache.del('stats');
        
        await logActivity('info', `Deleted deployment ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            message: 'Deployment deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete deployment'
        });
    }
});

app.post('/api/deployments/:id/renew', async (req, res) => {
    try {
        const deploymentId = req.params.id;
        const days = parseInt(req.body.days) || config.defaultExpiryDays;
        
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + Math.min(days, config.maxExpiryDays));
        
        const { error } = await supabase
            .from('deployments')
            .update({ 
                expires_at: newExpiry.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', deploymentId);
        
        if (error) {
            if (error.code === 'PGRST204') {
                return res.status(500).json({
                    success: false,
                    error: 'Database table not found'
                });
            }
            throw error;
        }
        
        cache.del('recent_deployments');
        
        await logActivity('info', `Renewed deployment ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            message: 'Deployment renewed successfully',
            newExpiry
        });
        
    } catch (error) {
        console.error('Renew error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to renew deployment'
        });
    }
});

app.get('/api/health', async (req, res) => {
    try {
        const { data, error } = await supabase.from('_test').select('count').limit(1);
        
        if (error && !error.message.includes('does not exist')) {
            throw error;
        }
        
        const tablesCheck = await ensureDatabaseTables();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            supabase: 'connected',
            database_tables: tablesCheck ? 'available' : 'setup_required',
            uptime: process.uptime(),
            environment: config.env,
            vercel: isVercel
        });
        
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            environment: config.env,
            vercel: isVercel
        });
    }
});

app.get('/static/:deploymentId/*', async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId;
        const filePath = req.params[0];
        
        const { data: deployment, error } = await supabase
            .from('deployments')
            .select('*')
            .eq('id', deploymentId)
            .eq('status', 'active')
            .single();
        
        if (error && error.code === 'PGRST204') {
            return res.status(404).send('Deployment not found (database not ready)');
        }
        
        if (error || !deployment) {
            return res.status(404).send('Deployment not found');
        }
        
        if (new Date(deployment.expires_at) < new Date()) {
            return res.status(410).send('Deployment has expired');
        }
        
        const fullPath = `${deploymentId}/${filePath}`;
        const { data, error: storageError } = await supabase.storage
            .from('deployments')
            .download(fullPath);
        
        if (storageError) {
            if (filePath === '' || filePath.endsWith('/')) {
                const indexPath = `${deploymentId}/${filePath}index.html`;
                const { data: indexData, error: indexError } = await supabase.storage
                    .from('deployments')
                    .download(indexPath);
                
                if (!indexError && indexData) {
                    res.set('Content-Type', 'text/html');
                    return res.send(Buffer.from(await indexData.arrayBuffer()));
                }
            }
            return res.status(404).send('File not found');
        }
        
        const mimeType = getMimeType(filePath);
        res.set('Content-Type', mimeType);
        
        res.send(Buffer.from(await data.arrayBuffer()));
        
    } catch (error) {
        console.error('Error serving static file:', error);
        res.status(500).send('Internal server error');
    }
});

app.get('/setup', async (req, res) => {
    res.render('setup', {
        title: 'Setup Required',
        supabaseUrl: config.supabaseUrl,
        setupRequired: true
    });
});

app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.',
        status: 404,
        error: {}
    });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });
    
    const statusCode = err.status || 500;
    const message = config.env === 'development' ? err.message : 'Something went wrong!';
    
    res.status(statusCode).render('error', {
        title: 'Error',
        message,
        status: statusCode,
        error: { message: err.message, stack: config.env === 'development' ? err.stack : undefined }
    });
});

testSupabaseConnection();
ensureDatabaseTables();

module.exports = app;