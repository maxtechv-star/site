/**
 * QuickDeploy - Main JavaScript File
 * Version: 1.0.0
 * 
 * This file contains core functionality for the QuickDeploy application
 */

// ============================================================================
// Global Variables & Configuration
// ============================================================================

const Config = {
    API_BASE_URL: window.location.origin + '/api',
    UPLOAD_PATH: '/uploads',
    DEPLOYMENT_PATH: '/deployments',
    VERSION: '1.0.0',
    DEBUG: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Debounce function to limit function execution rate
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function to limit function execution rate
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
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
 * Format date to relative time or specific format
 */
function formatDate(date, format = 'relative') {
    const d = new Date(date);
    const now = new Date();
    
    if (format === 'relative') {
        const diff = now - d;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
        
        return d.toLocaleDateString();
    }
    
    if (format === 'datetime') {
        return d.toLocaleString();
    }
    
    if (format === 'date') {
        return d.toLocaleDateString();
    }
    
    if (format === 'time') {
        return d.toLocaleTimeString();
    }
    
    return d.toLocaleString();
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        
        // Fallback method
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard!', 'success');
        } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            showToast('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textArea);
        return false;
    }
}

/**
 * Generate a random ID
 */
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

/**
 * Validate email address
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate URL
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Make API request with error handling
 */
async function apiRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${Config.API_BASE_URL}${endpoint}`;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        credentials: 'same-origin'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    showLoading();
    
    try {
        const response = await fetch(url, finalOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (Config.DEBUG) {
            console.log(`API ${options.method || 'GET'} ${endpoint}:`, data);
        }
        
        hideLoading();
        return data;
    } catch (error) {
        hideLoading();
        console.error('API Request failed:', error);
        showToast(`Request failed: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Get deployments list
 */
async function getDeployments() {
    try {
        const data = await apiRequest('/deployments');
        return data.deployments || [];
    } catch (error) {
        return [];
    }
}

/**
 * Get deployment details
 */
async function getDeployment(id) {
    try {
        const data = await apiRequest(`/deployments/${id}`);
        return data.deployment || null;
    } catch (error) {
        return null;
    }
}

/**
 * Delete deployment
 */
async function deleteDeployment(id) {
    if (!confirm('Are you sure you want to delete this deployment? This action cannot be undone.')) {
        return false;
    }
    
    try {
        const data = await apiRequest(`/deployments/${id}`, {
            method: 'DELETE'
        });
        
        if (data.success) {
            showToast('Deployment deleted successfully', 'success');
            
            // Remove from UI
            const deploymentElement = document.querySelector(`[data-deployment-id="${id}"]`);
            if (deploymentElement) {
                deploymentElement.style.opacity = '0';
                deploymentElement.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    deploymentElement.remove();
                    updateDeploymentCount();
                }, 300);
            }
            
            return true;
        } else {
            showToast(data.error || 'Failed to delete deployment', 'error');
            return false;
        }
    } catch (error) {
        console.error('Delete deployment failed:', error);
        return false;
    }
}

/**
 * Renew deployment
 */
async function renewDeployment(id) {
    try {
        const data = await apiRequest(`/deployments/${id}/renew`, {
            method: 'POST'
        });
        
        if (data.success) {
            showToast('Deployment renewed for 7 days', 'success');
            return true;
        } else {
            showToast(data.error || 'Failed to renew deployment', 'error');
            return false;
        }
    } catch (error) {
        console.error('Renew deployment failed:', error);
        return false;
    }
}

/**
 * Clone deployment
 */
async function cloneDeployment(id) {
    try {
        const data = await apiRequest(`/deployments/${id}/clone`, {
            method: 'POST'
        });
        
        if (data.success) {
            showToast('Deployment cloned successfully', 'success');
            if (data.newId) {
                // Redirect to new deployment after a short delay
                setTimeout(() => {
                    window.location.href = `/deployment/${data.newId}`;
                }, 1500);
            }
            return true;
        } else {
            showToast(data.error || 'Failed to clone deployment', 'error');
            return false;
        }
    } catch (error) {
        console.error('Clone deployment failed:', error);
        return false;
    }
}

/**
 * Get system stats
 */
async function getSystemStats() {
    try {
        const data = await apiRequest('/stats');
        return data;
    } catch (error) {
        return {
            activeDeployments: 0,
            totalSize: 0,
            totalFiles: 0,
            expiringSoon: 0
        };
    }
}

// ============================================================================
// UI Functions
// ============================================================================

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 5000) {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    if (existingToasts.length >= 3) {
        existingToasts[0].remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    }[type] || 'fas fa-info-circle';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${icon}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-message">${sanitizeHTML(message)}</div>
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    const container = document.querySelector('.toast-container');
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.className = 'toast-container';
        document.body.appendChild(newContainer);
        newContainer.appendChild(toast);
    } else {
        container.appendChild(toast);
    }
    
    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);
    
    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        hideToast(toast);
    });
    
    // Auto hide
    if (duration > 0) {
        setTimeout(() => {
            hideToast(toast);
        }, duration);
    }
    
    return toast;
}

/**
 * Hide toast notification
 */
function hideToast(toast) {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

/**
 * Show loading spinner
 */
function showLoading(message = 'Loading...') {
    let loader = document.getElementById('global-loader');
    
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'loading-overlay';
        loader.innerHTML = `
            <div class="loading-content">
                <div class="spinner spinner-lg"></div>
                ${message ? `<p class="loading-message mt-3">${sanitizeHTML(message)}</p>` : ''}
            </div>
        `;
        document.body.appendChild(loader);
    }
    
    // Force reflow
    loader.offsetHeight;
    loader.classList.add('active');
    
    // Prevent scrolling
    document.body.style.overflow = 'hidden';
}

/**
 * Hide loading spinner
 */
function hideLoading() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.classList.remove('active');
        setTimeout(() => {
            if (loader.parentNode) {
                loader.parentNode.removeChild(loader);
            }
        }, 300);
    }
    
    // Restore scrolling
    document.body.style.overflow = '';
}

/**
 * Show confirmation modal
 */
function showConfirm(options) {
    return new Promise((resolve) => {
        const {
            title = 'Confirm Action',
            message = 'Are you sure you want to proceed?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'danger'
        } = options;
        
        let modal = document.getElementById('confirmation-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'confirmation-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-header">
                        <h3 class="modal-title">${sanitizeHTML(title)}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>${sanitizeHTML(message)}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" id="confirm-cancel">${sanitizeHTML(cancelText)}</button>
                        <button class="btn btn-${type}" id="confirm-ok">${sanitizeHTML(confirmText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.querySelector('.modal-title').textContent = title;
            modal.querySelector('.modal-body p').textContent = message;
            modal.querySelector('#confirm-cancel').textContent = cancelText;
            modal.querySelector('#confirm-ok').textContent = confirmText;
            modal.querySelector('#confirm-ok').className = `btn btn-${type}`;
        }
        
        // Show modal
        modal.classList.add('active');
        
        // Handle events
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        const handleClose = (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close')) {
                cleanup();
                resolve(false);
            }
        };
        
        const cleanup = () => {
            modal.classList.remove('active');
            modal.querySelector('#confirm-ok').removeEventListener('click', handleConfirm);
            modal.querySelector('#confirm-cancel').removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleClose);
        };
        
        modal.querySelector('#confirm-ok').addEventListener('click', handleConfirm);
        modal.querySelector('#confirm-cancel').addEventListener('click', handleCancel);
        modal.addEventListener('click', handleClose);
    });
}

/**
 * Update deployment count in UI
 */
function updateDeploymentCount() {
    const deploymentElements = document.querySelectorAll('.deployment-card, [data-deployment-id]');
    const countElements = document.querySelectorAll('.deployment-count, .nav-badge');
    
    countElements.forEach(element => {
        element.textContent = deploymentElements.length;
        element.style.display = deploymentElements.length > 0 ? 'inline-block' : 'none';
    });
}

/**
 * Update time elements with relative time
 */
function updateRelativeTimes() {
    document.querySelectorAll('[data-time]').forEach(element => {
        const timestamp = element.getAttribute('data-time');
        if (timestamp) {
            element.textContent = formatDate(timestamp, 'relative');
            element.title = formatDate(timestamp, 'datetime');
        }
    });
}

/**
 * Initialize tooltips
 */
function initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        const tooltip = element.getAttribute('data-tooltip');
        if (tooltip) {
            element.title = tooltip;
        }
    });
}

/**
 * Initialize copy buttons
 */
function initCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const text = button.getAttribute('data-copy');
            if (text) {
                await copyToClipboard(text);
            }
        });
    });
}

/**
 * Initialize delete buttons
 */
function initDeleteButtons() {
    document.querySelectorAll('[data-delete]').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = button.getAttribute('data-delete');
            if (id) {
                await deleteDeployment(id);
            }
        });
    });
}

/**
 * Initialize deployment actions
 */
function initDeploymentActions() {
    // Renew buttons
    document.querySelectorAll('[data-renew]').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = button.getAttribute('data-renew');
            if (id) {
                await renewDeployment(id);
            }
        });
    });
    
    // Clone buttons
    document.querySelectorAll('[data-clone]').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = button.getAttribute('data-clone');
            if (id) {
                await cloneDeployment(id);
            }
        });
    });
    
    // View buttons
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const id = button.getAttribute('data-view');
            if (id) {
                window.location.href = `/deployment/${id}`;
            }
        });
    });
}

// ============================================================================
// Sidebar & Navigation
// ============================================================================

/**
 * Toggle sidebar on mobile
 */
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebar && mainContent) {
        sidebar.classList.toggle('active');
        mainContent.classList.toggle('sidebar-active');
    }
}

/**
 * Initialize sidebar
 */
function initSidebar() {
    // Toggle button
    const toggleButton = document.querySelector('[data-toggle="sidebar"]');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleSidebar);
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && sidebar.classList.contains('active') && 
            window.innerWidth <= 992 &&
            !sidebar.contains(e.target) &&
            !e.target.closest('[data-toggle="sidebar"]')) {
            sidebar.classList.remove('active');
            mainContent.classList.remove('sidebar-active');
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', debounce(() => {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (window.innerWidth > 992) {
            sidebar?.classList.remove('active');
            mainContent?.classList.remove('sidebar-active');
        }
    }, 250));
}

/**
 * Initialize navigation
 */
function initNavigation() {
    // Mobile menu toggle
    const menuToggle = document.querySelector('[data-toggle="menu"]');
    const navMenu = document.querySelector('.nav-menu');
    
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navMenu && navMenu.classList.contains('active') &&
            !navMenu.contains(e.target) &&
            !e.target.closest('[data-toggle="menu"]')) {
            navMenu.classList.remove('active');
            menuToggle?.classList.remove('active');
        }
    });
    
    // Active link highlighting
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || 
            (href !== '/' && currentPath.startsWith(href))) {
            link.classList.add('active');
        }
    });
}

// ============================================================================
// Form Handling
// ============================================================================

/**
 * Validate form
 */
function validateForm(form) {
    let isValid = true;
    const errors = [];
    
    // Get all required inputs
    const requiredInputs = form.querySelectorAll('[required]');
    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.classList.add('is-invalid');
            errors.push(`${input.name || 'Field'} is required`);
        } else {
            input.classList.remove('is-invalid');
        }
    });
    
    // Validate email fields
    const emailInputs = form.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        if (input.value && !isValidEmail(input.value)) {
            isValid = false;
            input.classList.add('is-invalid');
            errors.push('Invalid email address');
        }
    });
    
    // Validate URL fields
    const urlInputs = form.querySelectorAll('input[type="url"]');
    urlInputs.forEach(input => {
        if (input.value && !isValidUrl(input.value)) {
            isValid = false;
            input.classList.add('is-invalid');
            errors.push('Invalid URL');
        }
    });
    
    // Show errors if any
    if (!isValid && errors.length > 0) {
        showToast(errors[0], 'error');
    }
    
    return isValid;
}

/**
 * Initialize forms
 */
function initForms() {
    document.querySelectorAll('form[data-ajax]').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!validateForm(form)) {
                return;
            }
            
            const submitButton = form.querySelector('button[type="submit"]');
            const originalText = submitButton?.textContent;
            
            // Disable submit button
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }
            
            try {
                const formData = new FormData(form);
                const response = await fetch(form.action, {
                    method: form.method,
                    body: form.enctype === 'multipart/form-data' ? formData : JSON.stringify(Object.fromEntries(formData)),
                    headers: form.enctype === 'multipart/form-data' ? {} : {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showToast(data.message || 'Operation completed successfully', 'success');
                    
                    // Redirect if specified
                    if (data.redirect) {
                        setTimeout(() => {
                            window.location.href = data.redirect;
                        }, 1500);
                    }
                    
                    // Reset form if specified
                    if (form.hasAttribute('data-reset')) {
                        form.reset();
                    }
                } else {
                    showToast(data.error || 'Operation failed', 'error');
                }
            } catch (error) {
                console.error('Form submission failed:', error);
                showToast('Request failed. Please try again.', 'error');
            } finally {
                // Re-enable submit button
                if (submitButton) {
                    submitButton.disabled = false;
                    if (originalText) {
                        submitButton.textContent = originalText;
                    }
                }
            }
        });
    });
}

// ============================================================================
// File Handling
// ============================================================================

/**
 * Preview image file
 */
function previewImage(file, container) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'img-preview';
        container.innerHTML = '';
        container.appendChild(img);
    };
    reader.readAsDataURL(file);
}

/**
 * Preview text file
 */
function previewText(file, container, maxLength = 5000) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const pre = document.createElement('pre');
        pre.className = 'text-preview';
        pre.textContent = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        container.innerHTML = '';
        container.appendChild(pre);
        
        if (text.length > maxLength) {
            const warning = document.createElement('p');
            warning.className = 'text-muted';
            warning.textContent = `Preview truncated. Full file is ${formatBytes(file.size)}.`;
            container.appendChild(warning);
        }
    };
    reader.readAsText(file);
}

// ============================================================================
// Search & Filter
// ============================================================================

/**
 * Initialize search functionality
 */
function initSearch() {
    const searchInput = document.querySelector('[data-search]');
    if (!searchInput) return;
    
    const searchTable = searchInput.getAttribute('data-search-table');
    const table = searchTable ? document.querySelector(searchTable) : null;
    
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    
    searchInput.addEventListener('input', debounce((e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    }, 300));
}

/**
 * Initialize filters
 */
function initFilters() {
    document.querySelectorAll('[data-filter]').forEach(filter => {
        filter.addEventListener('change', (e) => {
            const filterValue = e.target.value;
            const target = filter.getAttribute('data-filter');
            const items = document.querySelectorAll(target);
            
            items.forEach(item => {
                if (filterValue === 'all' || item.getAttribute('data-status') === filterValue) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

// ============================================================================
// Charts & Statistics (if Chart.js is available)
// ============================================================================

/**
 * Initialize charts if Chart.js is loaded
 */
function initCharts() {
    if (typeof Chart === 'undefined') return;
    
    document.querySelectorAll('[data-chart]').forEach(canvas => {
        const chartType = canvas.getAttribute('data-chart') || 'line';
        const chartData = canvas.getAttribute('data-chart-data');
        
        if (!chartData) return;
        
        try {
            const data = JSON.parse(chartData);
            
            new Chart(canvas, {
                type: chartType,
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to initialize chart:', error);
        }
    });
}

// ============================================================================
// Theme & Appearance
// ============================================================================

/**
 * Initialize theme toggle
 */
function initThemeToggle() {
    const themeToggle = document.querySelector('[data-toggle="theme"]');
    if (!themeToggle) return;
    
    // Check for saved theme preference or respect OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    
    const setTheme = (theme) => {
        if (theme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    };
    
    // Set initial theme
    setTheme(savedTheme);
    
    // Toggle theme on click
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        themeToggle.innerHTML = newTheme === 'dark' 
            ? '<i class="fas fa-sun"></i>' 
            : '<i class="fas fa-moon"></i>';
    });
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize everything when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize components
    initSidebar();
    initNavigation();
    initTooltips();
    initCopyButtons();
    initDeleteButtons();
    initDeploymentActions();
    initForms();
    initSearch();
    initFilters();
    initThemeToggle();
    
    // Update relative times
    updateRelativeTimes();
    
    // Initialize charts if available
    setTimeout(initCharts, 100);
    
    // Auto-update relative times every minute
    setInterval(updateRelativeTimes, 60000);
    
    // Load initial data
    loadInitialData();
    
    // Log version for debugging
    if (Config.DEBUG) {
        console.log(`QuickDeploy v${Config.VERSION} initialized`);
    }
});

/**
 * Load initial data for the page
 */
async function loadInitialData() {
    // Get current page
    const path = window.location.pathname;
    
    try {
        // Load stats for dashboard
        if (path === '/' || path === '/admin') {
            const stats = await getSystemStats();
            updateStatsUI(stats);
        }
        
        // Load deployments for dashboard
        if (path === '/') {
            const deployments = await getDeployments();
            updateRecentDeployments(deployments.slice(0, 5));
        }
    } catch (error) {
        console.error('Failed to load initial data:', error);
    }
}

/**
 * Update stats UI
 */
function updateStatsUI(stats) {
    // Update stats cards
    document.querySelectorAll('[data-stat="activeDeployments"]').forEach(el => {
        el.textContent = stats.activeDeployments || 0;
    });
    
    document.querySelectorAll('[data-stat="totalSize"]').forEach(el => {
        el.textContent = formatBytes(stats.totalSize || 0);
    });
    
    document.querySelectorAll('[data-stat="totalFiles"]').forEach(el => {
        el.textContent = stats.totalFiles || 0;
    });
    
    document.querySelectorAll('[data-stat="expiringSoon"]').forEach(el => {
        el.textContent = stats.expiringSoon || 0;
    });
}

/**
 * Update recent deployments UI
 */
function updateRecentDeployments(deployments) {
    const container = document.getElementById('recent-deployments');
    if (!container) return;
    
    if (deployments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cloud-upload-alt"></i>
                <h3>No deployments yet</h3>
                <p>Upload your first static site to get started!</p>
                <a href="/upload" class="btn btn-primary mt-3">
                    <i class="fas fa-cloud-upload-alt"></i> Deploy Now
                </a>
            </div>
        `;
        return;
    }
    
    let html = '';
    deployments.forEach(deploy => {
        const statusClass = deploy.status === 'active' ? 'success' : 
                          deploy.status === 'expired' ? 'danger' : 'warning';
        
        html += `
            <div class="deployment-card" data-deployment-id="${deploy.id}">
                <div class="deployment-header">
                    <div class="deployment-title">
                        <h4 class="deployment-name">${sanitizeHTML(deploy.name || 'Untitled')}</h4>
                        <span class="badge badge-${statusClass}">${deploy.status}</span>
                    </div>
                    <a href="${deploy.url}" target="_blank" class="deployment-url">
                        ${deploy.url.replace(/^https?:\/\//, '')}
                    </a>
                </div>
                <div class="deployment-body">
                    <div class="deployment-meta">
                        <span class="meta-item">
                            <i class="fas fa-folder"></i>
                            ${deploy.file_count || 0} files
                        </span>
                        <span class="meta-item">
                            <i class="fas fa-hdd"></i>
                            ${formatBytes(deploy.total_size || 0)}
                        </span>
                        <span class="meta-item" title="${formatDate(deploy.created_at, 'datetime')}">
                            <i class="fas fa-clock"></i>
                            ${formatDate(deploy.created_at, 'relative')}
                        </span>
                    </div>
                </div>
                <div class="deployment-footer">
                    <div class="deployment-actions">
                        <a href="/deployment/${deploy.id}" class="btn btn-sm btn-outline" data-view="${deploy.id}">
                            <i class="fas fa-eye"></i> Details
                        </a>
                        <a href="${deploy.url}" target="_blank" class="btn btn-sm btn-primary">
                            <i class="fas fa-external-link-alt"></i> Visit
                        </a>
                        <button class="btn btn-sm btn-outline-danger" data-delete="${deploy.id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Re-initialize buttons
    initDeleteButtons();
    initDeploymentActions();
}

// ============================================================================
// Export to Window
// ============================================================================

// Make useful functions available globally
window.QuickDeploy = {
    Config,
    
    // Utility functions
    debounce,
    throttle,
    formatBytes,
    formatDate,
    copyToClipboard,
    generateId,
    sanitizeHTML,
    isValidEmail,
    isValidUrl,
    
    // API functions
    apiRequest,
    getDeployments,
    getDeployment,
    deleteDeployment,
    renewDeployment,
    cloneDeployment,
    getSystemStats,
    
    // UI functions
    showToast,
    hideToast,
    showLoading,
    hideLoading,
    showConfirm,
    
    // Initialization
    initSidebar,
    initNavigation,
    initTooltips,
    initCopyButtons,
    initDeleteButtons,
    initDeploymentActions,
    initForms,
    initSearch,
    initFilters,
    initCharts,
    initThemeToggle
};