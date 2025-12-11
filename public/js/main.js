const Config = {
    API_BASE_URL: window.location.origin + '/api',
    DEBUG: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

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

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

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

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
        return true;
    } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard!', 'success');
        } catch (fallbackErr) {
            showToast('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textArea);
        return false;
    }
}

function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

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

async function deleteDeployment(id) {
    if (!confirm('Are you sure you want to delete this deployment?')) {
        return false;
    }
    
    try {
        const data = await apiRequest(`/deployments/${id}`, {
            method: 'DELETE'
        });
        
        if (data.success) {
            showToast('Deployment deleted successfully', 'success');
            
            const deploymentElement = document.querySelector(`[data-deployment-id="${id}"]`);
            if (deploymentElement) {
                deploymentElement.style.opacity = '0';
                deploymentElement.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    deploymentElement.remove();
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

function showToast(message, type = 'info', duration = 5000) {
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
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    });
    
    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
    
    return toast;
}

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
    
    loader.offsetHeight;
    loader.classList.add('active');
    document.body.style.overflow = 'hidden';
}

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
    document.body.style.overflow = '';
}

function updateRelativeTimes() {
    document.querySelectorAll('[data-time]').forEach(element => {
        const timestamp = element.getAttribute('data-time');
        if (timestamp) {
            element.textContent = formatDate(timestamp, 'relative');
            element.title = formatDate(timestamp, 'datetime');
        }
    });
}

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

function initDeploymentActions() {
    document.querySelectorAll('[data-renew]').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = button.getAttribute('data-renew');
            if (id) {
                await renewDeployment(id);
            }
        });
    });
    
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

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebar && mainContent) {
        sidebar.classList.toggle('active');
        mainContent.classList.toggle('sidebar-active');
    }
}

function initSidebar() {
    const toggleButton = document.querySelector('[data-toggle="sidebar"]');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleSidebar);
    }
    
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
    
    window.addEventListener('resize', debounce(() => {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (window.innerWidth > 992) {
            sidebar?.classList.remove('active');
            mainContent?.classList.remove('sidebar-active');
        }
    }, 250));
}

function initNavigation() {
    const menuToggle = document.querySelector('[data-toggle="menu"]');
    const navMenu = document.querySelector('.nav-menu');
    
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }
    
    document.addEventListener('click', (e) => {
        if (navMenu && navMenu.classList.contains('active') &&
            !navMenu.contains(e.target) &&
            !e.target.closest('[data-toggle="menu"]')) {
            navMenu.classList.remove('active');
            menuToggle?.classList.remove('active');
        }
    });
    
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || 
            (href !== '/' && currentPath.startsWith(href))) {
            link.classList.add('active');
        }
    });
}

function initThemeToggle() {
    const themeToggle = document.querySelector('[data-toggle="theme"]');
    if (!themeToggle) return;
    
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
    
    setTheme(savedTheme);
    
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

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initNavigation();
    initCopyButtons();
    initDeleteButtons();
    initDeploymentActions();
    initThemeToggle();
    
    updateRelativeTimes();
    
    setInterval(updateRelativeTimes, 60000);
    
    if (Config.DEBUG) {
        console.log('QuickDeploy initialized');
    }
});

window.QuickDeploy = {
    Config,
    debounce,
    formatBytes,
    formatDate,
    copyToClipboard,
    generateId,
    sanitizeHTML,
    apiRequest,
    deleteDeployment,
    renewDeployment,
    showToast,
    showLoading,
    hideLoading,
    initSidebar,
    initNavigation,
    initCopyButtons,
    initDeleteButtons,
    initDeploymentActions,
    initThemeToggle
};