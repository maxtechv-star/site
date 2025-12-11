class UploadManager {
    constructor() {
        this.files = [];
        this.currentUpload = null;
        this.uploadProgress = new Map();
        this.maxFileSize = 100 * 1024 * 1024;
        this.allowedTypes = [
            'text/html',
            'text/css',
            'text/javascript',
            'application/javascript',
            'application/json',
            'application/xml',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/svg+xml',
            'image/webp',
            'font/woff',
            'font/woff2',
            'application/x-font-ttf',
            'application/x-font-otf',
            'application/zip',
            'application/x-zip-compressed',
            'text/plain',
            'text/markdown',
            'text/x-markdown'
        ];
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.initDropzone();
        this.initFileInput();
        this.initUploadForm();
        this.initDragAndDrop();
    }
    
    bindEvents() {
        document.querySelectorAll('[data-toggle="upload-tab"]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(tab.dataset.target);
            });
        });
        
        const clearBtn = document.getElementById('clear-files');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFiles());
        }
        
        document.addEventListener('click', (e) => {
            if (e.target.closest('.file-remove')) {
                const fileName = e.target.closest('.file-remove').dataset.file;
                this.removeFile(fileName);
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                this.handlePaste(e);
            }
            
            if (e.key === 'Escape') {
                this.clearFiles();
            }
        });
        
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeDragOverClass();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeDragOverClass();
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });
    }
    
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
                    fileInput.value = '';
                }
            });
        }
    }
    
    initUploadForm() {
        const form = document.getElementById('upload-form');
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (this.files.length === 0) {
                this.showToast('Please select files to upload', 'error');
                return;
            }
            
            await this.uploadFiles();
        });
    }
    
    initDragAndDrop() {
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
    
    switchTab(tabId) {
        document.querySelectorAll('[data-toggle="upload-tab"]').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-target="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        document.querySelectorAll('.upload-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
        
        const uploadForm = document.getElementById('upload-form');
        if (uploadForm && tabId === 'files-upload') {
            uploadForm.style.display = 'block';
        }
        
        setTimeout(() => {
            const firstInput = activeContent.querySelector('input, textarea, select');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }
    
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
            this.showToast(`Added ${validFiles} file${validFiles !== 1 ? 's' : ''}`, 'success');
            this.updateFileList();
        }
        
        if (validFiles < files.length) {
            this.showToast(`Some files were skipped due to restrictions`, 'warning');
        }
    }
    
    validateFile(file) {
        if (file.size > this.maxFileSize) {
            console.warn(`File too large: ${file.name}`);
            return false;
        }
        
        const fileType = file.type || this.getFileType(file.name);
        if (fileType && !this.allowedTypes.includes(fileType) && !fileType.startsWith('image/')) {
            console.warn(`File type not allowed: ${file.name}`);
            return false;
        }
        
        if (this.files.some(f => f.name === file.name && f.size === file.size)) {
            console.warn(`Duplicate file: ${file.name}`);
            return false;
        }
        
        return true;
    }
    
    getFileType(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const typeMap = {
            'html': 'text/html',
            'htm': 'text/html',
            'css': 'text/css',
            'js': 'text/javascript',
            'json': 'application/json',
            'xml': 'application/xml',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp',
            'woff': 'font/woff',
            'woff2': 'font/woff2',
            'ttf': 'application/x-font-ttf',
            'otf': 'application/x-font-otf',
            'zip': 'application/zip',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'markdown': 'text/markdown'
        };
        
        return typeMap[extension] || 'application/octet-stream';
    }
    
    addFile(file) {
        const fileId = this.generateId();
        
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
        
        this.updateFileCount();
    }
    
    removeFile(fileName) {
        const index = this.files.findIndex(f => f.name === fileName);
        if (index !== -1) {
            this.files.splice(index, 1);
            this.updateFileList();
            this.updateFileCount();
            this.showToast('File removed', 'info');
        }
    }
    
    clearFiles() {
        if (this.files.length === 0) return;
        
        if (confirm('Clear all files?')) {
            this.files = [];
            this.updateFileList();
            this.updateFileCount();
            this.showToast('All files cleared', 'info');
        }
    }
    
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
        
        this.files.forEach((file) => {
            const icon = this.getFileIcon(file.name);
            const size = this.formatBytes(file.size);
            
            html += `
                <div class="file-list-item" data-file-id="${file.id}">
                    <div class="file-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${this.sanitizeHTML(file.name)}</div>
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
    
    getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'html': 'fas fa-code',
            'htm': 'fas fa-code',
            'css': 'fab fa-css3-alt',
            'js': 'fab fa-js-square',
            'json': 'fas fa-file-code',
            'xml': 'fas fa-file-code',
            'jpg': 'fas fa-file-image',
            'jpeg': 'fas fa-file-image',
            'png': 'fas fa-file-image',
            'gif': 'fas fa-file-image',
            'svg': 'fas fa-file-image',
            'webp': 'fas fa-file-image',
            'ico': 'fas fa-file-image',
            'woff': 'fas fa-font',
            'woff2': 'fas fa-font',
            'ttf': 'fas fa-font',
            'otf': 'fas fa-font',
            'zip': 'fas fa-file-archive',
            'rar': 'fas fa-file-archive',
            'tar': 'fas fa-file-archive',
            'gz': 'fas fa-file-archive',
            'txt': 'fas fa-file-alt',
            'md': 'fas fa-file-alt',
            'markdown': 'fas fa-file-alt',
            'pdf': 'fas fa-file-pdf',
            'mp4': 'fas fa-file-video',
            'avi': 'fas fa-file-video',
            'mov': 'fas fa-file-video',
            'mp3': 'fas fa-file-audio',
            'wav': 'fas fa-file-audio'
        };
        
        return iconMap[extension] || 'fas fa-file';
    }
    
    updateFileCount() {
        const countElements = document.querySelectorAll('.file-count');
        const totalSize = this.files.reduce((sum, file) => sum + file.size, 0);
        
        countElements.forEach(element => {
            element.textContent = this.files.length;
            element.title = `${this.files.length} files, ${this.formatBytes(totalSize)}`;
        });
        
        const uploadBtn = document.querySelector('#upload-form button[type="submit"]');
        if (uploadBtn && this.files.length > 0) {
            uploadBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Deploy ${this.files.length} File${this.files.length !== 1 ? 's' : ''}`;
            uploadBtn.disabled = false;
        } else if (uploadBtn) {
            uploadBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Deploy`;
            uploadBtn.disabled = true;
        }
    }
    
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
            this.showToast(`Pasted ${files.length} file${files.length !== 1 ? 's' : ''}`, 'success');
        }
    }
    
    removeDragOverClass() {
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        document.body.classList.remove('drag-active');
    }
    
    async uploadFiles() {
        if (this.currentUpload) {
            this.showToast('Upload already in progress', 'warning');
            return;
        }
        
        if (this.files.length === 0) {
            this.showToast('No files to upload', 'error');
            return;
        }
        
        const deploymentName = document.getElementById('deployment-name').value.trim() || 
                             `Deployment-${new Date().getTime()}`;
        const deploymentDesc = document.getElementById('deployment-desc').value.trim();
        
        if (!this.isValidDeploymentName(deploymentName)) {
            this.showToast('Deployment name can only contain letters, numbers, hyphens, and spaces', 'error');
            return;
        }
        
        this.showLoading('Preparing upload...');
        
        try {
            this.currentUpload = true;
            
            const formData = new FormData();
            formData.append('name', deploymentName);
            if (deploymentDesc) {
                formData.append('description', deploymentDesc);
            }
            
            this.files.forEach(file => {
                formData.append('files', file.file);
            });
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Deployment created successfully!', 'success');
                
                this.files = [];
                this.updateFileList();
                this.updateFileCount();
                document.getElementById('deployment-name').value = '';
                document.getElementById('deployment-desc').value = '';
                
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
            this.showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            this.currentUpload = false;
            this.hideLoading();
        }
    }
    
    isValidDeploymentName(name) {
        const regex = /^[a-zA-Z0-9\s\-_]+$/;
        return regex.test(name) && name.length >= 1 && name.length <= 100;
    }
    
    generateId() {
        return 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    sanitizeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close">&times;</button>
        `;
        
        const container = document.getElementById('toast-container') || this.createToastContainer();
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    getToastIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }
    
    showLoading(message = 'Loading...') {
        let loader = document.getElementById('loading-overlay');
        
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'loading-overlay';
            loader.className = 'loading-overlay';
            loader.innerHTML = `
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">${message}</div>
                </div>
            `;
            document.body.appendChild(loader);
        }
        
        loader.style.display = 'flex';
    }
    
    hideLoading() {
        const loader = document.getElementById('loading-overlay');
        if (loader) {
            loader.style.display = 'none';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.uploadManager = new UploadManager();
    
    const deploymentNameInput = document.getElementById('deployment-name');
    if (deploymentNameInput && !deploymentNameInput.value) {
        deploymentNameInput.value = `My-Site-${new Date().getTime()}`;
    }
    
    console.log('Upload manager initialized');
});

window.UploadManager = UploadManager;