/**
 * File Handler Module - FileReader and Telegram file utilities
 */

/**
 * Read file as text using FileReader API
 * @param {File} file - File object
 * @returns {Promise<string>} - file content as string
 */
export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error(`Failed to read file: ${file.name}`));
        };
        
        reader.readAsText(file);
    });
}

/**
 * Download Telegram file from Telegram servers
 * @param {string} fileId - Telegram file ID
 * @param {string} botToken - Bot token
 * @returns {Promise<Blob>} - file blob
 */
export async function downloadTelegramFile(fileId, botToken) {
    try {
        // First, get file path from Telegram API
        const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
        const fileResponse = await fetch(getFileUrl);
        
        if (!fileResponse.ok) {
            throw new Error(`Failed to get file info: ${fileResponse.statusText}`);
        }
        
        const fileData = await fileResponse.json();
        
        if (!fileData.ok) {
            throw new Error(`Telegram API error: ${fileData.description}`);
        }
        
        const filePath = fileData.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        
        // Download the actual file
        const downloadResponse = await fetch(downloadUrl);
        
        if (!downloadResponse.ok) {
            throw new Error(`Failed to download file: ${downloadResponse.statusText}`);
        }
        
        const blob = await downloadResponse.blob();
        return blob;
    } catch (error) {
        console.error('Error downloading Telegram file:', error);
        throw error;
    }
}

/**
 * Read Telegram file blob as text
 * @param {Blob} blob - File blob
 * @returns {Promise<string>} - blob content as string
 */
export async function readBlobAsText(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read blob as text'));
        };
        
        reader.readAsText(blob);
    });
}

/**
 * Create a blob URL for data
 * @param {string|Blob} data - data to create URL for
 * @param {string} type - MIME type (default: 'application/json')
 * @returns {string} - object URL
 */
export function createBlobUrl(data, type = 'application/json') {
    const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
    return URL.createObjectURL(blob);
}

/**
 * Revoke a blob URL
 * @param {string} url - object URL to revoke
 */
export function revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

/**
 * Format file size for display
 * @param {number} bytes - size in bytes
 * @returns {string} - formatted size string
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * Validate file type and size
 * @param {File} file - File to validate
 * @param {Object} options - validation options
 * @param {Array<string>} options.allowedTypes - allowed MIME types
 * @param {number} options.maxSize - maximum file size in bytes
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file, options = {}) {
    const {
        allowedTypes = ['application/json'],
        maxSize = 50 * 1024 * 1024 // 50MB default
    } = options;
    
    if (!file) {
        return { valid: false, error: 'No file selected' };
    }
    
    if (allowedTypes.length > 0 && !allowedTypes.some(type => file.type === type || file.name.endsWith('.json'))) {
        return { valid: false, error: `Invalid file type. Expected: ${allowedTypes.join(', ')}` };
    }
    
    if (file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
        return { valid: false, error: `File too large. Maximum size: ${maxSizeMB}MB` };
    }
    
    return { valid: true };
}

// Storage for temporary data
const tempStorage = new Map();

/**
 * Store temporary data
 * @param {string} key - storage key
 * @param {any} value - value to store
 */
export function setTempData(key, value) {
    tempStorage.set(key, value);
}

/**
 * Retrieve temporary data
 * @param {string} key - storage key
 * @returns {any} - stored value
 */
export function getTempData(key) {
    return tempStorage.get(key);
}

/**
 * Remove temporary data
 * @param {string} key - storage key
 */
export function removeTempData(key) {
    tempStorage.delete(key);
}

/**
 * Cleanup all temporary data and blob URLs
 */
export function cleanup() {
    // Clear temp storage
    tempStorage.clear();
    
    // Note: blob URLs should be revoked individually when no longer needed
    console.log('Cleaned up temporary data');
}
