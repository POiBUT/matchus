/**
 * Telegram API Module - Communication with Bot API
 */

// Get API base URL from environment or use default
const API_BASE_URL = window.location.origin || 'http://localhost:3000';

/**
 * Upload file content to the bot server
 * The server will then upload to Telegram and return a fileId
 * @param {string} sessionId - Session ID
 * @param {string} fileContent - JSON file content as string
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<Object>} - response with fileId
 */
export async function uploadFile(sessionId, fileContent, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}/file`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                fileContent,
                timestamp: Date.now()
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to upload file: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(`Server error: ${data.error || 'Unknown error'}`);
        }
        
        return data.result;
    } catch (error) {
        console.error('Upload file error:', error);
        throw error;
    }
}

/**
 * Download partner's file content from the bot server
 * @param {string} sessionId - Session ID
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<string|null>} - file content as string or null
 */
export async function downloadPartnerFile(sessionId, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}/file`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // No file uploaded yet
            }
            throw new Error(`Failed to download file: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            return null;
        }
        
        // Return the file content directly
        return data.result?.fileContent || null;
    } catch (error) {
        console.error('Download partner file error:', error);
        throw error;
    }
}

/**
 * Validate session with the bot server
 * @param {string} sessionId - Session ID from URL
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<Object>} - session data
 */
export async function validateSession(sessionId, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Session validation failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(`Session validation failed: ${data.error || 'Unknown error'}`);
        }
        
        return data.result;
    } catch (error) {
        console.error('Session validation error:', error);
        throw error;
    }
}

/**
 * Get file ID from session
 * @param {string} sessionId - Session ID
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<string|null>} - file ID or null
 */
export async function getFileId(sessionId, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}/file`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // No file uploaded yet
            }
            throw new Error(`Failed to get file ID: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            return null;
        }
        
        return data.result?.fileId || null;
    } catch (error) {
        console.error('Get file ID error:', error);
        return null;
    }
}

/**
 * Notify server that file has been uploaded (legacy - kept for compatibility)
 * @param {string} sessionId - Session ID
 * @param {string} fileId - Telegram file ID
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<Object>} - response data
 */
export async function notifyFileUploaded(sessionId, fileId, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}/file`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileId })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to notify file upload: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(`Server error: ${data.error || 'Unknown error'}`);
        }
        
        return data.result;
    } catch (error) {
        console.error('Notify file uploaded error:', error);
        throw error;
    }
}

/**
 * Submit comparison results to server
 * @param {string} sessionId - Session ID
 * @param {Object} results - comparison results
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<Object>} - response data
 */
export async function submitResults(sessionId, results, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}/results`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(results)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to submit results: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(`Server error: ${data.error || 'Unknown error'}`);
        }
        
        return data.result;
    } catch (error) {
        console.error('Submit results error:', error);
        throw error;
    }
}

/**
 * Get session status
 * @param {string} sessionId - Session ID
 * @param {string} apiBaseUrl - API base URL (optional)
 * @returns {Promise<Object>} - session status
 */
export async function getSessionStatus(sessionId, apiBaseUrl = API_BASE_URL) {
    try {
        const url = `${apiBaseUrl}/api/session/${sessionId}/status`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to get session status: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(`Server error: ${data.error || 'Unknown error'}`);
        }
        
        return data.result;
    } catch (error) {
        console.error('Get session status error:', error);
        throw error;
    }
}

/**
 * Send data back to Telegram via Telegram Web App SDK
 * @param {Object} data - data to send
 */
export function sendDataToTelegram(data) {
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.sendData(JSON.stringify(data));
    } else {
        console.error('Telegram Web App SDK not available');
    }
}

/**
 * Close Telegram Web App
 */
export function closeTelegramApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.close();
    } else {
        console.log('Telegram Web App SDK not available, closing window');
        window.close();
    }
}

/**
 * Get URL parameters
 * @returns {Object} - URL parameters as object
 */
export function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params.entries()) {
        result[key] = value;
    }
    return result;
}

/**
 * Get session ID from URL parameters
 * @returns {string|null} - session ID or null
 */
export function getSessionIdFromUrl() {
    const params = getUrlParams();
    return params.session || params.sessionId || null;
}
