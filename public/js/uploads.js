/**
 * QuickDeploy - Upload JavaScript File
 * Version: 1.0.0
 * 
 * This file handles file uploads and deployment creation
 */

// ============================================================================
// Upload Manager
// ============================================================================

class UploadManager {
    constructor() {
        this.files = [];
        this.currentUpload = null;
        this.uploadProgress = new Map();
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.allowedTypes = [
            // Web files
            'text/html',
            'text/css',
            'text/javascript',
            'application/javascript',
            'application/json',
            'application/xml',
            
            // Images
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/svg+xml',
            'image/webp',
            
            // Fonts
            'font/woff',
            'font/woff2',
            'application/x-font-ttf',
            'application/x-font-otf',
            
            // Archives
            'application/zip',
            'application/x-zip-compressed',
            
            // Text files
            'text/plain',
            'text/markdown',
            'text/x-markdown'
        ];
        
        this.init();
    }
    
    /**
     * Initialize upload manager
     */
    init() {
        this.bindEvents();
        this.initDropzone();
        this.initFileInput();
        this.initUploadForm();
        this.initZipUpload();
        this.initGitHubUpload();
        this.initDragAndDrop();
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Tab switching
        document.querySelectorAll('[data-toggle="upload-tab"]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(tab.dataset.target);
            });
        });
        
        // Clear files button
        const clearBtn = document.getElementById('clear-files');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFiles());
        }
        
        // File removal
        document.addEventListener('click', (e) => {
            if (e.target.closest('.file-remove')) {
                const fileName = e.target.closest('.file-remove').dataset.file;
                this.removeFile(fileName);
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + V to paste files
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                this.handlePaste(e);
            }
            
            // Escape to clear selection
            if (e.key === 'Escape') {
                this.clearFiles();
            }
        });
        
        // Handle paste event
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        // Handle drag over
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Handle drag leave
        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeDragOverClass();
        });
        
        // Handle drop
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeDragOverClass();
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });
    }
    
    /**
     * Initialize dropzone
     */
    initDropzone() {
        const dropzone = document.getElementById('dropzone');
        if (!dropzone) return;
        
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
        
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });
    }
    
    /**
     * Initialize file input
     */
    initFileInput() {
        const fileInput = document.getElementById('file-input');
        const browseBtn = document.getElementById('browse-btn');
        
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => fileInput.click());
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFiles(e.target.files);
                    fileInput.value = ''; // Reset input
                }
            });
        }
    }
    
    /**
     * Initialize upload form
     */
    initUploadForm() {
        const form = document.getElementById('upload-form');
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (this.files.length === 0) {
                QuickDeploy.showToast('Please select files to upload', 'error');
                return;
            }
            
            await this.uploadFiles();
        });
    }
    
    /**
     * Initialize ZIP upload
     */
    initZipUpload() {
        const zipForm = document.getElementById('zip-upload-form');
        if (!zipForm) return;
        
        zipForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const zipFile = document.getElementById('zip-file').files[0];
            if (!zipFile) {
                QuickDeploy.showToast('Please select a ZIP file', 'error');
                return;
            }
            
            if (!zipFile.name.endsWith('.zip')) {
                QuickDeploy.showToast('Please select a valid ZIP file', 'error');
                return;
            }
            
            await this.uploadZip(zipFile);
        });
    }
    
    /**
     * Initialize GitHub upload
     */
    initGitHubUpload() {
        const githubForm = document.getElementById('github-upload-form');
        if (!githubForm) return;
        
        githubForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const url = document.getElementById('github-url').value.trim();
            if (!url) {
                QuickDeploy.showToast('Please enter a GitHub URL', 'error');
                return;
            }
            
            if (!this.isValidGitHubUrl(url)) {
                QuickDeploy.showToast('Please enter a valid GitHub repository URL', 'error');
                return;
            }
            
            await this.uploadFromGitHub(url);
        });
    }
    
    /**
     * Initialize drag and drop
     */
    initDragAndDrop() {
        // Add visual feedback for drag and drop
        document.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                document.body.classList.add('drag-active');
            }
        });
        
        document.addEventListener('dragleave', (e) => {
            if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
                document.body.classList.remove('drag-active');
            }
        });
        
        document.addEventListener('drop', () => {
            document.body.classList.remove('drag-active');
        });
    }
    
    /**
     * Switch between upload tabs
     */
    switchTab(tabId) {
        // Update active tab
        document.querySelectorAll('[data-toggle="upload-tab"]').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-target="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // Show active content
        document.querySelectorAll('.upload-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
        
        // Update form action based on tab
        const uploadForm = document.getElementById('upload-form');
        if (uploadForm && tabId === 'zip-upload') {
            uploadForm.style.display = 'none';
            document.getElementById('zip-upload-form').style.display = 'block';
        } else if (uploadForm && tabId === 'files-upload') {
            uploadForm.style.display = 'block';
            document.getElementById('zip-upload-form').style.display = 'none';
        }
        
        // Focus on first input
        setTimeout(() => {
            const firstInput = activeContent.querySelector('input, textarea, select');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }
    
    /**
     * Handle file selection
     */
    handleFiles(fileList) {
        const files = Array.from(fileList);
        let validFiles = 0;
        
        files.forEach(file => {
            if (this.validateFile(file)) {
                this.addFile(file);
                validFiles++;
            }
        });
        
        if (validFiles > 0) {
            QuickDeploy.showToast(`Added ${validFiles} file${validFiles !== 1 ? 's' : ''}`, 'success');
            this.updateFileList();
        }
        
        if (validFiles < files.length) {
            QuickDeploy.showToast(`Some files were skipped due to size or type restrictions`, 'warning');
        }
    }
    
    /**
     * Validate file before adding
     */
    validateFile(file) {
        // Check file size
        if (file.size > this.maxFileSize) {
            console.warn(`File too large: ${file.name} (${QuickDeploy.formatBytes(file.size)})`);
            return false;
        }
        
        // Check file type
        const fileType = file.type || this.getFileType(file.name);
        if (fileType && !this.allowedTypes.includes(fileType) && !fileType.startsWith('image/')) {
            console.warn(`File type not allowed: ${file.name} (${fileType})`);
            return false;
        }
        
        // Check for duplicate
        if (this.files.some(f => f.name === file.name && f.size === file.size)) {
            console.warn(`Duplicate file: ${file.name}`);
            return false;
        }
        
        return true;
    }
    
    /**
     * Get file type from extension
     */
    getFileType(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const typeMap = {
            // Web files
            'html': 'text/html',
            'htm': 'text/html',
            'css': 'text/css',
            'js': 'text/javascript',
            'json': 'application/json',
            'xml': 'application/xml',
            
            // Images
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp',
            
            // Fonts
            'woff': 'font/woff',
            'woff2': 'font/woff2',
            'ttf': 'application/x-font-ttf',
            'otf': 'application/x-font-otf',
            
            // Archives
            'zip': 'application/zip',
            
            // Text files
            'txt': 'text/plain',
            'md': 'text/markdown',
            'markdown': 'text/markdown'
        };
        
        return typeMap[extension] || 'application/octet-stream';
    }
    
    /**
     * Add file to upload queue
     */
    addFile(file) {
        // Generate unique ID for file
        const fileId = QuickDeploy.generateId();
        
        this.files.push({
            id: fileId,
            file: file,
            name: file.name,
            size: file.size,
            type: file.type || this.getFileType(file.name),
            progress: 0,
            status: 'pending',
            uploaded: 0
        });
        
        // Update UI
        this.updateFileCount();
    }
    
    /**
     * Remove file from upload queue
     */
    removeFile(fileName) {
        const index = this.files.findIndex(f => f.name === fileName);
        if (index !== -1) {
            this.files.splice(index, 1);
            this.updateFileList();
            this.updateFileCount();
            QuickDeploy.showToast('File removed', 'info');
        }
    }
    
    /**
     * Clear all files
     */
    clearFiles() {
        if (this.files.length === 0) return;
        
        if (confirm('Clear all files?')) {
            this.files = [];
            this.updateFileList();
            this.updateFileCount();
            QuickDeploy.showToast('All files cleared', 'info');
        }
    }
    
    /**
     * Update file list UI
     */
    updateFileList() {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;
        
        if (this.files.length === 0) {
            fileList.innerHTML = `
                <div class="empty-file-list">
                    <i class="fas fa-folder-open"></i>
                    <p>No files selected</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="file-list-items">';
        
        this.files.forEach((file, index) => {
            const icon = this.getFileIcon(file.name);
            const size = QuickDeploy.formatBytes(file.size);
            
            html += `
                <div class="file-list-item" data-file-id="${file.id}">
                    <div class="file-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${QuickDeploy.sanitizeHTML(file.name)}</div>
                        <div class="file-details">
                            <span class="file-size">${size}</span>
                            <span class="file-status ${file.status}">${file.status}</span>
                        </div>
                        ${file.status === 'uploading' ? `
                            <div class="file-progress">
                                <div class="progress-bar" style="width: ${file.progress}%"></div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="file-actions">
                        <button class="file-action file-remove" data-file="${file.name}" title="Remove">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        fileList.innerHTML = html;
    }
    
    /**
     * Get icon for file type
     */
    getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const iconMap = {
            // Web files
            'html': 'fas fa-code',
            'htm': 'fas fa-code',
            'css': 'fab fa-css3-alt',
            'js': 'fab fa-js-square',
            'json': 'fas fa-file-code',
            'xml': 'fas fa-file-code',
            
            // Images
            'jpg': 'fas fa-file-image',
            'jpeg': 'fas fa-file-image',
            'png': 'fas fa-file-image',
            'gif': 'fas fa-file-image',
            'svg': 'fas fa-file-image',
            'webp': 'fas fa-file-image',
            'ico': 'fas fa-file-image',
            
            // Fonts
            'woff': 'fas fa-font',
            'woff2': 'fas fa-font',
            'ttf': 'fas fa-font',
            'otf': 'fas fa-font',
            
            // Archives
            'zip': 'fas fa-file-archive',
            'rar': 'fas fa-file-archive',
            'tar': 'fas fa-file-archive',
            'gz': 'fas fa-file-archive',
            
            // Text files
            'txt': 'fas fa-file-alt',
            'md': 'fas fa-file-alt',
            'markdown': 'fas fa-file-alt',
            
            // PDF
            'pdf': 'fas fa-file-pdf',
            
            // Video
            'mp4': 'fas fa-file-video',
            'avi': 'fas fa-file-video',
            'mov': 'fas fa-file-video',
            
            // Audio
            'mp3': 'fas fa-file-audio',
            'wav': 'fas fa-file-audio'
        };
        
        return iconMap[extension] || 'fas fa-file';
    }
    
    /**
     * Update file count display
     */
    updateFileCount() {
        const countElements = document.querySelectorAll('.file-count');
        const totalSize = this.files.reduce((sum, file) => sum + file.size, 0);
        
        countElements.forEach(element => {
            element.textContent = this.files.length;
            element.title = `${this.files.length} files, ${QuickDeploy.formatBytes(totalSize)}`;
        });
        
        // Update upload button text
        const uploadBtn = document.querySelector('#upload-form button[type="submit"]');
        if (uploadBtn && this.files.length > 0) {
            uploadBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Deploy ${this.files.length} File${this.files.length !== 1 ? 's' : ''}`;
            uploadBtn.disabled = false;
        } else if (uploadBtn) {
            uploadBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Deploy`;
            uploadBtn.disabled = true;
        }
    }
    
    /**
     * Handle paste event
     */
    handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        const files = [];
        
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    files.push(file);
                }
            }
        }
        
        if (files.length > 0) {
            e.preventDefault();
            this.handleFiles(files);
            QuickDeploy.showToast(`Pasted ${files.length} file${files.length !== 1 ? 's' : ''}`, 'success');
        }
    }
    
    /**
     * Remove drag over class
     */
    removeDragOverClass() {
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.body.classList.remove('drag-active');
    }
    
    /**
     * Upload files to server
     */
    async uploadFiles() {
        if (this.currentUpload) {
            QuickDeploy.showToast('Upload already in progress', 'warning');
            return;
        }
        
        if (this.files.length === 0) {
            QuickDeploy.showToast('No files to upload', 'error');
            return;
        }
        
        const deploymentName = document.getElementById('deployment-name').value.trim() || 
                             `Deployment-${new Date().getTime()}`;
        const deploymentDesc = document.getElementById('deployment-desc').value.trim();
        
        // Validate deployment name
        if (!this.isValidDeploymentName(deploymentName)) {
            QuickDeploy.showToast('Deployment name can only contain letters, numbers, hyphens, and spaces', 'error');
            return;
        }
        
        // Show loading
        QuickDeploy.showLoading('Preparing upload...');
        
        try {
            this.currentUpload = true;
            
            // Create FormData
            const formData = new FormData();
            formData.append('name', deploymentName);
            if (deploymentDesc) {
                formData.append('description', deploymentDesc);
            }
            
            // Add files
            this.files.forEach(file => {
                formData.append('files', file.file);
            });
            
            // Upload files
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                QuickDeploy.showToast('Deployment created successfully!', 'success');
                
                // Reset form
                this.files = [];
                this.updateFileList();
                this.updateFileCount();
                document.getElementById('deployment-name').value = '';
                document.getElementById('deployment-desc').value = '';
                
                // Redirect to deployment page
                setTimeout(() => {
                    if (data.deploymentId) {
                        window.location.href = `/deployment/${data.deploymentId}`;
                    } else if (data.url) {
                        window.location.href = data.adminUrl || '/';
                    }
                }, 1500);
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            QuickDeploy.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            this.currentUpload = false;
            QuickDeploy.hideLoading();
        }
    }
    
    /**
     * Upload ZIP file
     */
    async uploadZip(zipFile) {
        if (this.currentUpload) {
            QuickDeploy.showToast('Upload already in progress', 'warning');
            return;
        }
        
        const deploymentName = document.getElementById('zip-deployment-name').value.trim() || 
                             `Deployment-${new Date().getTime()}`;
        const deploymentDesc = document.getElementById('zip-deployment-desc').value.trim();
        
        // Validate deployment name
        if (!this.isValidDeploymentName(deploymentName)) {
            QuickDeploy.showToast('Deployment name can only contain letters, numbers, hyphens, and spaces', 'error');
            return;
        }
        
        // Show loading
        QuickDeploy.showLoading('Uploading ZIP file...');
        
        try {
            this.currentUpload = true;
            
            const formData = new FormData();
            formData.append('name', deploymentName);
            if (deploymentDesc) {
                formData.append('description', deploymentDesc);
            }
            formData.append('zipFile', zipFile);
            
            const response = await fetch('/api/upload-zip', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`ZIP upload failed: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                QuickDeploy.showToast('ZIP deployment created successfully!', 'success');
                
                // Reset form
                document.getElementById('zip-file').value = '';
                document.getElementById('zip-deployment-name').value = '';
                document.getElementById('zip-deployment-desc').value = '';
                
                // Redirect to deployment page
                setTimeout(() => {
                    if (data.deploymentId) {
                        window.location.href = `/deployment/${data.deploymentId}`;
                    } else if (data.url) {
                        window.location.href = data.adminUrl || '/';
                    }
                }, 1500);
            } else {
                throw new Error(data.error || 'ZIP upload failed');
            }
        } catch (error) {
            console.error('ZIP upload failed:', error);
            QuickDeploy.showToast(`ZIP upload failed: ${error.message}`, 'error');
        } finally {
            this.currentUpload = false;
            QuickDeploy.hideLoading();
        }
    }
    
    /**
     * Upload from GitHub
     */
    async uploadFromGitHub(url) {
        QuickDeploy.showToast('GitHub integration coming soon!', 'info');
        
        // TODO: Implement GitHub integration
        // This would involve:
        // 1. Parsing GitHub URL
        // 2. Fetching repository contents via GitHub API
        // 3. Downloading and extracting the repository
        // 4. Uploading to our server
        
        console.log('GitHub URL:', url);
    }
    
    /**
     * Validate deployment name
     */
    isValidDeploymentName(name) {
        // Allow letters, numbers, spaces, hyphens, underscores
        const regex = /^[a-zA-Z0-9\s\-_]+$/;
        return regex.test(name) && name.length >= 1 && name.length <= 100;
    }
    
    /**
     * Validate GitHub URL
     */
    isValidGitHubUrl(url) {
        const patterns = [
            /^https?:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+(\/)?$/,
            /^https?:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+(\/tree\/[a-zA-Z0-9-_.\/]+)?$/,
            /^https?:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+(\/archive\/[a-zA-Z0-9-_.]+\.zip)?$/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }
    
    /**
     * Get total upload size
     */
    getTotalSize() {
        return this.files.reduce((total, file) => total + file.size, 0);
    }
    
    /**
     * Get file type statistics
     */
    getFileStats() {
        const stats = {
            html: 0,
            css: 0,
            js: 0,
            images: 0,
            other: 0
        };
        
        this.files.forEach(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            
            if (['html', 'htm'].includes(ext)) {
                stats.html++;
            } else if (ext === 'css') {
                stats.css++;
            } else if (ext === 'js') {
                stats.js++;
            } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
                stats.images++;
            } else {
                stats.other++;
            }
        });
        
        return stats;
    }
    
    /**
     * Generate deployment preview
     */
    generatePreview() {
        const stats = this.getFileStats();
        const totalSize = this.getTotalSize();
        
        return {
            fileCount: this.files.length,
            totalSize: QuickDeploy.formatBytes(totalSize),
            stats: stats,
            hasIndexHtml: this.files.some(file => 
                file.name.toLowerCase() === 'index.html' || 
                file.name.toLowerCase() === 'index.htm'
            ),
            estimatedTime: this.estimateUploadTime(totalSize)
        };
    }
    
    /**
     * Estimate upload time
     */
    estimateUploadTime(sizeInBytes) {
        // Assume average upload speed of 5 Mbps
        const speedMbps = 5;
        const speedBytesPerSecond = (speedMbps * 1024 * 1024) / 8;
        const seconds = sizeInBytes / speedBytesPerSecond;
        
        if (seconds < 60) {
            return `${Math.ceil(seconds)} seconds`;
        } else if (seconds < 3600) {
            return `${Math.ceil(seconds / 60)} minutes`;
        } else {
            return `${Math.ceil(seconds / 3600)} hours`;
        }
    }
}

// ============================================================================
// Initialization
// ============================================================================

// Initialize upload manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create upload manager instance
    window.uploadManager = new UploadManager();
    
    // Set default deployment name
    const deploymentNameInput = document.getElementById('deployment-name');
    if (deploymentNameInput && !deploymentNameInput.value) {
        deploymentNameInput.value = `My-Site-${new Date().getTime()}`;
    }
    
    // Initialize file type filtering
    initFileTypeFilter();
    
    // Initialize preview generation
    initPreviewGeneration();
    
    // Log initialization
    console.log('Upload manager initialized');
});

/**
 * Initialize file type filter
 */
function initFileTypeFilter() {
    const filterSelect = document.getElementById('file-type-filter');
    if (!filterSelect) return;
    
    filterSelect.addEventListener('change', (e) => {
        const filter = e.target.value;
        const fileItems = document.querySelectorAll('.file-list-item');
        
        fileItems.forEach(item => {
            const fileName = item.querySelector('.file-name').textContent;
            const extension = fileName.split('.').pop().toLowerCase();
            
            if (filter === 'all') {
                item.style.display = '';
            } else if (filter === 'html' && ['html', 'htm'].includes(extension)) {
                item.style.display = '';
            } else if (filter === 'css' && extension === 'css') {
                item.style.display = '';
            } else if (filter === 'js' && extension === 'js') {
                item.style.display = '';
            } else if (filter === 'images' && ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(extension)) {
                item.style.display = '';
            } else if (filter === 'other') {
                const otherExtensions = ['html', 'htm', 'css', 'js', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'];
                if (!otherExtensions.includes(extension)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            } else {
                item.style.display = 'none';
            }
        });
    });
}

/**
 * Initialize preview generation
 */
function initPreviewGeneration() {
    const generateBtn = document.getElementById('generate-preview');
    const previewContainer = document.getElementById('preview-container');
    
    if (!generateBtn || !previewContainer) return;
    
    generateBtn.addEventListener('click', () => {
        if (!window.uploadManager || window.uploadManager.files.length === 0) {
            QuickDeploy.showToast('No files to preview', 'warning');
            return;
        }
        
        const preview = window.uploadManager.generatePreview();
        
        let html = `
            <div class="preview-card">
                <h4><i class="fas fa-eye"></i> Deployment Preview</h4>
                <div class="preview-stats">
                    <div class="stat">
                        <span class="stat-label">Files:</span>
                        <span class="stat-value">${preview.fileCount}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Total Size:</span>
                        <span class="stat-value">${preview.totalSize}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Estimated Time:</span>
                        <span class="stat-value">${preview.estimatedTime}</span>
                    </div>
                </div>
                <div class="preview-file-types">
                    <h5>File Types:</h5>
                    <ul>
                        ${preview.stats.html > 0 ? `<li><i class="fas fa-code"></i> HTML: ${preview.stats.html}</li>` : ''}
                        ${preview.stats.css > 0 ? `<li><i class="fab fa-css3-alt"></i> CSS: ${preview.stats.css}</li>` : ''}
                        ${preview.stats.js > 0 ? `<li><i class="fab fa-js-square"></i> JavaScript: ${preview.stats.js}</li>` : ''}
                        ${preview.stats.images > 0 ? `<li><i class="fas fa-image"></i> Images: ${preview.stats.images}</li>` : ''}
                        ${preview.stats.other > 0 ? `<li><i class="fas fa-file"></i> Other: ${preview.stats.other}</li>` : ''}
                    </ul>
                </div>
                ${preview.hasIndexHtml ? 
                    '<div class="preview-success"><i class="fas fa-check-circle"></i> Contains index.html</div>' : 
                    '<div class="preview-warning"><i class="fas fa-exclamation-triangle"></i> No index.html found</div>'
                }
            </div>
        `;
        
        previewContainer.innerHTML = html;
        previewContainer.style.display = 'block';
    });
}

// ============================================================================
// Export to Window
// ============================================================================

window.UploadManager = UploadManager;