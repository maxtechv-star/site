/**
 * QuickDeploy - Main Server File
 * 
 * A simplified Vercel-like static site deployment platform
 */

require('dotenv').config();

// ============================================================================
// Imports
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const methodOverride = require('method-override');
const moment = require('moment');
const winston = require('winston');
const mime = require('mime-types');

// ============================================================================
// Configuration
// ============================================================================

const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    
    // Database
    databaseUrl: process.env.DATABASE_URL,
    
    // File storage
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    deploymentPath: process.env.DEPLOYMENT_PATH || './deployments',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB
    maxFiles: parseInt(process.env.MAX_FILES) || 50,
    
    // Security
    sessionSecret: process.env.SESSION_SECRET || 'quickdeploy-secret-key-change-in-production',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    
    // Deployment
    defaultExpiryDays: parseInt(process.env.DEFAULT_EXPIRY_DAYS) || 7,
    maxExpiryDays: parseInt(process.env.MAX_EXPIRY_DAYS) || 30,
    
    // Allowed file types
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || '.html,.css,.js,.json,.png,.jpg,.jpeg,.gif,.svg,.webp,.ico,.woff,.woff2,.ttf,.otf,.txt,.md,.pdf,.zip')
        .split(',')
        .map(ext => ext.trim().toLowerCase()),
    
    // Rate limiting
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
};

// ============================================================================
// Logger Setup
// ============================================================================

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'quickdeploy' },
    transports: [
        new winston.transports.File({ 
            filename: path.join(logDir, 'error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(logDir, 'combined.log') 
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ============================================================================
// Database Setup
// ============================================================================

const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.connect()
    .then(client => {
        logger.info('✅ Database connected successfully');
        client.release();
    })
    .catch(err => {
        logger.error('❌ Database connection failed:', err.message);
        process.exit(1);
    });

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Security middleware
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

// Compression
app.use(compression());

// CORS
app.use(cors({
    origin: config.env === 'development' ? true : process.env.CORS_ORIGIN,
    credentials: true
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Method override for DELETE, PUT
app.use(methodOverride('_method'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(config.deploymentPath));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimitWindow * 60 * 1000,
    max: config.rateLimitMax,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Session middleware
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.env === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================================
// File Upload Configuration
// ============================================================================

// Ensure upload directories exist
[config.uploadPath, config.deploymentPath].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadId = uuidv4();
        req.uploadId = uploadId;
        const uploadDir = path.join(config.uploadPath, uploadId);
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Sanitize filename
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, sanitizedName);
    }
});

const upload = multer({
    storage: uploadStorage,
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get file icon based on extension
 */
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

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push({
                path: fullPath,
                name: file,
                size: fs.statSync(fullPath).size,
                relativePath: path.relative(dirPath, fullPath)
            });
        }
    });
    
    return arrayOfFiles;
}

/**
 * Validate deployment name
 */
function isValidDeploymentName(name) {
    return /^[a-zA-Z0-9\s\-_]+$/.test(name) && name.length >= 1 && name.length <= 100;
}

/**
 * Log activity to database
 */
async function logActivity(level, message, userId = null, deploymentId = null, req = null) {
    try {
        await pool.query(`
            INSERT INTO logs (level, message, user_id, deployment_id, ip_address, user_agent, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            level,
            message,
            userId,
            deploymentId,
            req?.ip || null,
            req?.get('User-Agent') || null,
            JSON.stringify({ url: req?.originalUrl, method: req?.method })
        ]);
    } catch (error) {
        logger.error('Failed to log activity:', error);
    }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Check if user is authenticated (for future use)
 */
async function requireAuth(req, res, next) {
    // For now, allow all access (no login required)
    // This can be enhanced later for authentication
    next();
}

/**
 * Check if user is admin (for future use)
 */
async function requireAdmin(req, res, next) {
    // For now, allow all access
    // This can be enhanced later for admin authentication
    next();
}

/**
 * Add common variables to all views
 */
app.use((req, res, next) => {
    res.locals.currentPage = req.path.split('/')[1] || 'home';
    res.locals.baseUrl = config.baseUrl;
    res.locals.title = 'QuickDeploy';
    res.locals.messages = req.session.messages || {};
    delete req.session.messages;
    next();
});

// ============================================================================
// Routes
// ============================================================================

// ============================================
// View Routes
// ============================================

/**
 * Home page
 */
app.get('/', async (req, res) => {
    try {
        // Get recent deployments
        const deploymentsResult = await pool.query(`
            SELECT * FROM deployments 
            WHERE status = 'active' 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        // Get system stats
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_deployments,
                COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) as active_deployments,
                COALESCE(SUM(total_size), 0) as total_size,
                COALESCE(SUM(file_count), 0) as total_files,
                COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP - INTERVAL '1 day') as expiring_soon
            FROM deployments
            WHERE status != 'deleted'
        `);
        
        const stats = statsResult.rows[0] || {
            total_deployments: 0,
            active_deployments: 0,
            total_size: 0,
            total_files: 0,
            expiring_soon: 0
        };
        
        res.render('index', {
            title: 'Dashboard',
            recentDeployments: deploymentsResult.rows,
            stats: stats,
            deploymentsCount: deploymentsResult.rows.length
        });
        
        await logActivity('info', 'Accessed dashboard', null, null, req);
        
    } catch (error) {
        logger.error('Error loading dashboard:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load dashboard' 
        });
    }
});

/**
 * Upload page
 */
app.get('/upload', (req, res) => {
    const uploadType = req.query.type || 'files';
    res.render('upload', {
        title: 'New Deployment',
        uploadType: uploadType,
        maxFileSize: formatBytes(config.maxFileSize),
        allowedFileTypes: config.allowedFileTypes.join(', ')
    });
});

/**
 * Admin panel
 */
app.get('/admin', requireAdmin, async (req, res) => {
    try {
        // Get all deployments
        const deploymentsResult = await pool.query(`
            SELECT * FROM deployments 
            WHERE status != 'deleted'
            ORDER BY created_at DESC
        `);
        
        // Get admin stats
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_deployments,
                COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) as active_deployments,
                COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP) as expired_deployments,
                COALESCE(SUM(total_size), 0) as total_storage,
                COUNT(DISTINCT created_at::DATE) as active_days
            FROM deployments
            WHERE status != 'deleted'
        `);
        
        const adminStats = statsResult.rows[0] || {
            total_deployments: 0,
            active_deployments: 0,
            expired_deployments: 0,
            total_storage: 0,
            active_days: 0
        };
        
        res.render('admin', {
            title: 'Admin Panel',
            allDeployments: deploymentsResult.rows,
            adminStats: adminStats,
            deploymentsCount: deploymentsResult.rows.length
        });
        
        await logActivity('info', 'Accessed admin panel', null, null, req);
        
    } catch (error) {
        logger.error('Error loading admin panel:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load admin panel' 
        });
    }
});

/**
 * Deployment details page
 */
app.get('/deployment/:id', async (req, res) => {
    try {
        const deploymentId = req.params.id;
        
        // Get deployment details
        const deploymentResult = await pool.query(
            'SELECT * FROM deployments WHERE id = $1',
            [deploymentId]
        );
        
        if (deploymentResult.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Deployment not found'
            });
        }
        
        const deployment = deploymentResult.rows[0];
        
        // Get deployment files
        const filesResult = await pool.query(
            'SELECT * FROM deployment_files WHERE deployment_id = $1 ORDER BY file_path',
            [deploymentId]
        );
        
        // Get deployment path
        const deploymentPath = path.join(config.deploymentPath, deploymentId);
        
        res.render('deployment', {
            title: deployment.name || 'Deployment',
            deployment: deployment,
            files: filesResult.rows,
            deploymentPath: deploymentPath,
            formatBytes: formatBytes,
            getFileIcon: getFileIcon
        });
        
        await logActivity('info', `Viewed deployment ${deploymentId}`, null, deploymentId, req);
        
    } catch (error) {
        logger.error('Error loading deployment:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load deployment'
        });
    }
});

/**
 * All deployments page
 */
app.get('/deployments', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status || 'all';
        
        let query = `
            SELECT * FROM deployments 
            WHERE status != 'deleted'
        `;
        
        let countQuery = `
            SELECT COUNT(*) as total FROM deployments 
            WHERE status != 'deleted'
        `;
        
        const queryParams = [];
        const countParams = [];
        
        if (status !== 'all') {
            if (status === 'active') {
                query += ' AND expires_at > CURRENT_TIMESTAMP';
                countQuery += ' AND expires_at > CURRENT_TIMESTAMP';
            } else if (status === 'expired') {
                query += ' AND expires_at < CURRENT_TIMESTAMP';
                countQuery += ' AND expires_at < CURRENT_TIMESTAMP';
            }
        }
        
        query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
        queryParams.push(limit, offset);
        
        const [deploymentsResult, countResult] = await Promise.all([
            pool.query(query, queryParams),
            pool.query(countQuery, countParams)
        ]);
        
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        
        res.render('deployments', {
            title: 'All Deployments',
            deployments: deploymentsResult.rows,
            currentPage: page,
            totalPages: totalPages,
            limit: limit,
            status: status,
            formatBytes: formatBytes
        });
        
    } catch (error) {
        logger.error('Error loading deployments:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load deployments'
        });
    }
});

// ============================================
// API Routes
// ============================================

/**
 * Get system stats
 */
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as totalDeployments,
                COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) as activeDeployments,
                COALESCE(SUM(total_size), 0) as totalSize,
                COALESCE(SUM(file_count), 0) as totalFiles,
                COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP - INTERVAL '1 day') as expiringSoon
            FROM deployments
            WHERE status != 'deleted'
        `);
        
        res.json({
            success: true,
            ...result.rows[0]
        });
        
    } catch (error) {
        logger.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system stats'
        });
    }
});

/**
 * Get all deployments
 */
app.get('/api/deployments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM deployments 
            WHERE status = 'active' 
            ORDER BY created_at DESC
        `);
        
        res.json({
            success: true,
            deployments: result.rows
        });
        
    } catch (error) {
        logger.error('Error getting deployments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get deployments'
        });
    }
});

/**
 * Get single deployment
 */
app.get('/api/deployments/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM deployments WHERE id = $1',
            [req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }
        
        // Get deployment files
        const filesResult = await pool.query(
            'SELECT * FROM deployment_files WHERE deployment_id = $1',
            [req.params.id]
        );
        
        res.json({
            success: true,
            deployment: result.rows[0],
            files: filesResult.rows
        });
        
    } catch (error) {
        logger.error('Error getting deployment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get deployment'
        });
    }
});

/**
 * Upload files
 */
app.post('/api/upload', upload.array('files'), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const deploymentName = req.body.name || `Deployment-${Date.now()}`;
        const deploymentDesc = req.body.description || '';
        
        // Validate deployment name
        if (!isValidDeploymentName(deploymentName)) {
            throw new Error('Invalid deployment name');
        }
        
        // Create deployment directory
        const deploymentDir = path.join(config.deploymentPath, deploymentId);
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        // Move files from upload directory to deployment directory
        const uploadDir = path.join(config.uploadPath, req.uploadId);
        const files = getAllFiles(uploadDir);
        
        let totalSize = 0;
        const fileRecords = [];
        
        for (const file of files) {
            const destPath = path.join(deploymentDir, file.relativePath);
            const destDir = path.dirname(destPath);
            
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            
            fs.copyFileSync(file.path, destPath);
            
            totalSize += file.size;
            fileRecords.push({
                deployment_id: deploymentId,
                file_path: file.relativePath,
                original_name: file.name,
                file_size: file.size,
                mime_type: mime.lookup(file.name) || 'application/octet-stream'
            });
        }
        
        // Calculate expiry date
        const expiryDays = parseInt(req.body.expiryDays) || config.defaultExpiryDays;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Math.min(expiryDays, config.maxExpiryDays));
        
        // Create deployment record
        const deploymentUrl = `${config.baseUrl}/static/${deploymentId}`;
        const adminUrl = `${config.baseUrl}/deployment/${deploymentId}`;
        
        await client.query(`
            INSERT INTO deployments (id, name, description, url, admin_url, file_count, total_size, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            deploymentId,
            deploymentName,
            deploymentDesc,
            deploymentUrl,
            adminUrl,
            files.length,
            totalSize,
            expiresAt
        ]);
        
        // Insert file records
        for (const fileRecord of fileRecords) {
            await client.query(`
                INSERT INTO deployment_files (deployment_id, file_path, original_name, file_size, mime_type)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                fileRecord.deployment_id,
                fileRecord.file_path,
                fileRecord.original_name,
                fileRecord.file_size,
                fileRecord.mime_type
            ]);
        }
        
        // Clean up upload directory
        fs.rmSync(uploadDir, { recursive: true, force: true });
        
        await client.query('COMMIT');
        
        // Log activity
        await logActivity('info', `Created deployment ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            deploymentId: deploymentId,
            url: deploymentUrl,
            adminUrl: adminUrl,
            fileCount: files.length,
            totalSize: totalSize,
            message: 'Deployment created successfully'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Upload error:', error);
        
        // Clean up any uploaded files
        if (req.uploadId) {
            const uploadDir = path.join(config.uploadPath, req.uploadId);
            if (fs.existsSync(uploadDir)) {
                fs.rmSync(uploadDir, { recursive: true, force: true });
            }
        }
        
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    } finally {
        client.release();
    }
});

/**
 * Upload ZIP file
 */
app.post('/api/upload-zip', upload.single('zipFile'), async (req, res) => {
    const client = await pool.connect();
    
    try {
        if (!req.file) {
            throw new Error('No ZIP file provided');
        }
        
        if (!req.file.originalname.endsWith('.zip')) {
            throw new Error('File must be a ZIP archive');
        }
        
        await client.query('BEGIN');
        
        const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const deploymentName = req.body.name || `Deployment-${Date.now()}`;
        const deploymentDesc = req.body.description || '';
        
        // Validate deployment name
        if (!isValidDeploymentName(deploymentName)) {
            throw new Error('Invalid deployment name');
        }
        
        // Create deployment directory
        const deploymentDir = path.join(config.deploymentPath, deploymentId);
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        // Extract ZIP file
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(unzipper.Extract({ path: deploymentDir }))
                .on('close', resolve)
                .on('error', reject);
        });
        
        // Get all extracted files
        const files = getAllFiles(deploymentDir);
        
        let totalSize = 0;
        const fileRecords = [];
        
        for (const file of files) {
            totalSize += file.size;
            fileRecords.push({
                deployment_id: deploymentId,
                file_path: file.relativePath,
                original_name: file.name,
                file_size: file.size,
                mime_type: mime.lookup(file.name) || 'application/octet-stream'
            });
        }
        
        // Calculate expiry date
        const expiryDays = parseInt(req.body.expiryDays) || config.defaultExpiryDays;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Math.min(expiryDays, config.maxExpiryDays));
        
        // Create deployment record
        const deploymentUrl = `${config.baseUrl}/static/${deploymentId}`;
        const adminUrl = `${config.baseUrl}/deployment/${deploymentId}`;
        
        await client.query(`
            INSERT INTO deployments (id, name, description, url, admin_url, file_count, total_size, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            deploymentId,
            deploymentName,
            deploymentDesc,
            deploymentUrl,
            adminUrl,
            files.length,
            totalSize,
            expiresAt
        ]);
        
        // Insert file records
        for (const fileRecord of fileRecords) {
            await client.query(`
                INSERT INTO deployment_files (deployment_id, file_path, original_name, file_size, mime_type)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                fileRecord.deployment_id,
                fileRecord.file_path,
                fileRecord.original_name,
                fileRecord.file_size,
                fileRecord.mime_type
            ]);
        }
        
        // Clean up uploaded ZIP
        fs.unlinkSync(req.file.path);
        
        await client.query('COMMIT');
        
        // Log activity
        await logActivity('info', `Created deployment from ZIP ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            deploymentId: deploymentId,
            url: deploymentUrl,
            adminUrl: adminUrl,
            fileCount: files.length,
            totalSize: totalSize,
            message: 'Deployment created from ZIP successfully'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('ZIP upload error:', error);
        
        // Clean up any extracted files
        if (deploymentId) {
            const deploymentDir = path.join(config.deploymentPath, deploymentId);
            if (fs.existsSync(deploymentDir)) {
                fs.rmSync(deploymentDir, { recursive: true, force: true });
            }
        }
        
        // Clean up uploaded ZIP
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: error.message || 'ZIP upload failed'
        });
    } finally {
        client.release();
    }
});

/**
 * Delete deployment
 */
app.delete('/api/deployments/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const deploymentId = req.params.id;
        
        await client.query('BEGIN');
        
        // Check if deployment exists
        const deploymentResult = await client.query(
            'SELECT * FROM deployments WHERE id = $1',
            [deploymentId]
        );
        
        if (deploymentResult.rows.length === 0) {
            throw new Error('Deployment not found');
        }
        
        // Mark deployment as deleted
        await client.query(
            'UPDATE deployments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['deleted', deploymentId]
        );
        
        // Delete deployment directory
        const deploymentDir = path.join(config.deploymentPath, deploymentId);
        if (fs.existsSync(deploymentDir)) {
            fs.rmSync(deploymentDir, { recursive: true, force: true });
        }
        
        await client.query('COMMIT');
        
        // Log activity
        await logActivity('info', `Deleted deployment ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            message: 'Deployment deleted successfully'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Delete error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete deployment'
        });
    } finally {
        client.release();
    }
});

/**
 * Renew deployment
 */
app.post('/api/deployments/:id/renew', async (req, res) => {
    try {
        const deploymentId = req.params.id;
        const days = parseInt(req.body.days) || config.defaultExpiryDays;
        
        // Calculate new expiry date
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + Math.min(days, config.maxExpiryDays));
        
        await pool.query(
            'UPDATE deployments SET expires_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newExpiry, deploymentId]
        );
        
        // Log activity
        await logActivity('info', `Renewed deployment ${deploymentId}`, null, deploymentId, req);
        
        res.json({
            success: true,
            message: 'Deployment renewed successfully',
            newExpiry: newExpiry
        });
        
    } catch (error) {
        logger.error('Renew error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to renew deployment'
        });
    }
});

/**
 * Clone deployment
 */
app.post('/api/deployments/:id/clone', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const originalDeploymentId = req.params.id;
        
        await client.query('BEGIN');
        
        // Get original deployment
        const originalResult = await client.query(
            'SELECT * FROM deployments WHERE id = $1',
            [originalDeploymentId]
        );
        
        if (originalResult.rows.length === 0) {
            throw new Error('Original deployment not found');
        }
        
        const original = originalResult.rows[0];
        
        // Create new deployment
        const newDeploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newDeploymentName = `${original.name} (Copy)`;
        
        // Calculate expiry date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + config.defaultExpiryDays);
        
        // Create new deployment directory
        const newDeploymentDir = path.join(config.deploymentPath, newDeploymentId);
        const originalDeploymentDir = path.join(config.deploymentPath, originalDeploymentId);
        
        if (!fs.existsSync(newDeploymentDir)) {
            fs.mkdirSync(newDeploymentDir, { recursive: true });
        }
        
        // Copy files
        if (fs.existsSync(originalDeploymentDir)) {
            const files = getAllFiles(originalDeploymentDir);
            
            for (const file of files) {
                const destPath = path.join(newDeploymentDir, file.relativePath);
                const destDir = path.dirname(destPath);
                
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                
                fs.copyFileSync(file.path, destPath);
            }
        }
        
        // Create deployment record
        const deploymentUrl = `${config.baseUrl}/static/${newDeploymentId}`;
        const adminUrl = `${config.baseUrl}/deployment/${newDeploymentId}`;
        
        await client.query(`
            INSERT INTO deployments (id, name, description, url, admin_url, file_count, total_size, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            newDeploymentId,
            newDeploymentName,
            original.description,
            deploymentUrl,
            adminUrl,
            original.file_count,
            original.total_size,
            expiresAt
        ]);
        
        // Copy file records
        const filesResult = await client.query(
            'SELECT * FROM deployment_files WHERE deployment_id = $1',
            [originalDeploymentId]
        );
        
        for (const file of filesResult.rows) {
            await client.query(`
                INSERT INTO deployment_files (deployment_id, file_path, original_name, file_size, mime_type)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                newDeploymentId,
                file.file_path,
                file.original_name,
                file.file_size,
                file.mime_type
            ]);
        }
        
        await client.query('COMMIT');
        
        // Log activity
        await logActivity('info', `Cloned deployment ${originalDeploymentId} to ${newDeploymentId}`, null, originalDeploymentId, req);
        
        res.json({
            success: true,
            message: 'Deployment cloned successfully',
            newId: newDeploymentId,
            newUrl: deploymentUrl
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Clone error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to clone deployment'
        });
    } finally {
        client.release();
    }
});

/**
 * Download deployment as ZIP
 */
app.get('/api/deployments/:id/download', async (req, res) => {
    try {
        const deploymentId = req.params.id;
        const deploymentDir = path.join(config.deploymentPath, deploymentId);
        
        if (!fs.existsSync(deploymentDir)) {
            return res.status(404).json({
                success: false,
                error: 'Deployment not found'
            });
        }
        
        // Get deployment name for filename
        const deploymentResult = await pool.query(
            'SELECT name FROM deployments WHERE id = $1',
            [deploymentId]
        );
        
        const deploymentName = deploymentResult.rows[0]?.name || 'deployment';
        const filename = `${deploymentName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${deploymentId}.zip`;
        
        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });
        
        res.attachment(filename);
        archive.pipe(res);
        archive.directory(deploymentDir, false);
        archive.finalize();
        
        // Log activity
        await logActivity('info', `Downloaded deployment ${deploymentId}`, null, deploymentId, req);
        
    } catch (error) {
        logger.error('Download error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to download deployment'
        });
    }
});

/**
 * Admin cleanup endpoint
 */
app.post('/api/admin/cleanup', requireAdmin, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get expired deployments
        const expiredResult = await client.query(`
            SELECT id FROM deployments 
            WHERE expires_at < CURRENT_TIMESTAMP 
            AND status != 'deleted'
        `);
        
        const expiredIds = expiredResult.rows.map(row => row.id);
        
        // Mark as deleted
        await client.query(`
            UPDATE deployments 
            SET status = 'deleted', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ANY($1)
        `, [expiredIds]);
        
        // Delete directories
        for (const id of expiredIds) {
            const deploymentDir = path.join(config.deploymentPath, id);
            if (fs.existsSync(deploymentDir)) {
                fs.rmSync(deploymentDir, { recursive: true, force: true });
            }
        }
        
        await client.query('COMMIT');
        
        // Log activity
        await logActivity('info', `Cleaned up ${expiredIds.length} expired deployments`, null, null, req);
        
        res.json({
            success: true,
            message: `Cleaned up ${expiredIds.length} expired deployments`,
            deleted: expiredIds.length
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to cleanup expired deployments'
        });
    } finally {
        client.release();
    }
});

/**
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
    try {
        // Check database connection
        await pool.query('SELECT 1');
        
        // Check disk space
        const deploymentDir = config.deploymentPath;
        const stats = fs.statfsSync(deploymentDir);
        const freeSpace = stats.bavail * stats.bsize;
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            diskSpace: formatBytes(freeSpace),
            uptime: process.uptime()
        });
        
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.'
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', {
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
        message: message,
        error: config.env === 'development' ? err : {}
    });
});

// ============================================================================
// Startup
// ============================================================================

/**
 * Clean up old uploads on startup
 */
async function cleanupOldUploads() {
    try {
        const uploadDir = config.uploadPath;
        if (!fs.existsSync(uploadDir)) return;
        
        const dirs = fs.readdirSync(uploadDir);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const dir of dirs) {
            const dirPath = path.join(uploadDir, dir);
            const stat = fs.statSync(dirPath);
            
            if (now - stat.ctimeMs > maxAge) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                logger.info(`Cleaned up old upload: ${dir}`);
            }
        }
    } catch (error) {
        logger.error('Failed to cleanup old uploads:', error);
    }
}

/**
 * Start the server
 */
async function startServer() {
    try {
        // Cleanup old uploads
        await cleanupOldUploads();
        
        // Start server
        app.listen(config.port, () => {
            logger.info(`✅ Server running on port ${config.port}`);
            logger.info(`📁 Upload path: ${config.uploadPath}`);
            logger.info(`📁 Deployment path: ${config.deploymentPath}`);
            logger.info(`🌐 Base URL: ${config.baseUrl}`);
            logger.info(`🔧 Environment: ${config.env}`);
            
            console.log('\n============================================');
            console.log('🚀 QuickDeploy is running!');
            console.log('============================================');
            console.log(`Local:    ${config.baseUrl}`);
            console.log(`Upload:   ${config.baseUrl}/upload`);
            console.log(`Admin:    ${config.baseUrl}/admin`);
            console.log('============================================\n');
        });
        
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    pool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully...');
    pool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
    });
});

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = app;