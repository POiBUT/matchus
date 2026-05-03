/**
 * Main App Module - Bootstrap and coordinate the application
 */

import { validateSession, getFileId, notifyFileUploaded, submitResults, getSessionStatus, sendDataToTelegram, closeTelegramApp, getSessionIdFromUrl, uploadFile, downloadPartnerFile } from './telegram-api.js';
import { readFileAsText, downloadTelegramFile, readBlobAsText, validateFile, setTempData, getTempData, removeTempData, cleanup as cleanupFileHandler } from './file-handler.js';
import { processJsonFileAsync, jsonToCSV, generateStatisticsSimple } from './json-converter.js';
import { findMatches } from './compare-core.js';
import { showScreen, updateProgress, displayResults, showError, showValidationStatus, updateFileInfo, showUploadProgress, showCompletion, SCREENS } from './ui-controller.js';

// App state
let appState = {
    sessionId: null,
    sessionData: null,
    userRole: null, // 'initiator' or 'partner'
    uploadedFileId: null,
    partnerFileId: null,
    csvData1: null,
    csvData2: null,
    results: null
};

/**
 * Initialize the app
 */
async function init() {
    try {
        // Initialize Telegram Web App
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
            
            // Apply Telegram theme
            applyTelegramTheme();
        }
        
        // Get session ID from URL
        appState.sessionId = getSessionIdFromUrl();
        
        if (!appState.sessionId) {
            showValidationStatus(false, 'No session ID provided in URL. Please use the bot to open this app.');
            return;
        }
        
        // Validate session
        await validateAndLoadSession();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError(`Initialization failed: ${error.message}`);
    }
}

/**
 * Apply Telegram theme to CSS variables
 */
function applyTelegramTheme() {
    const tg = window.Telegram?.WebApp;
    if (!tg || !tg.themeParams) return;
    
    const theme = tg.themeParams;
    const root = document.documentElement;
    
    if (theme.bg_color) root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
    if (theme.text_color) root.style.setProperty('--tg-theme-text-color', theme.text_color);
    if (theme.hint_color) root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
    if (theme.link_color) root.style.setProperty('--tg-theme-link-color', theme.link_color);
    if (theme.button_color) root.style.setProperty('--tg-theme-button-color', theme.button_color);
    if (theme.button_text_color) root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
    if (theme.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
}

/**
 * Validate session and load session data
 */
async function validateAndLoadSession() {
    try {
        showScreen(SCREENS.SESSION_VALIDATION);
        
        const sessionData = await validateSession(appState.sessionId);
        appState.sessionData = sessionData;
        
        // Determine user role
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        const currentUserId = tgUser?.id?.toString();
        
        if (currentUserId && sessionData.initiatorId === currentUserId) {
            appState.userRole = 'initiator';
        } else {
            appState.userRole = 'partner';
        }
        
        showValidationStatus(true, `Welcome! You are the ${appState.userRole}.`);
        
        // Set up file upload handlers
        setupFileUpload();
        
        // Check if partner already uploaded file
        if (appState.userRole === 'initiator') {
            checkForPartnerFile();
        }
        
    } catch (error) {
        console.error('Session validation error:', error);
        showValidationStatus(false, error.message);
    }
}

/**
 * Set up file upload event handlers
 */
function setupFileUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const removeFileBtn = document.getElementById('remove-file');
    const retryBtn = document.getElementById('retry-validation');
    
    let selectedFile = null;
    
    // Upload area click
    if (uploadArea) {
        uploadArea.addEventListener('click', () => {
            fileInput?.click();
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
    }
    
    // File input change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }
    
    // Handle file selection
    function handleFileSelect(file) {
        const validation = validateFile(file, {
            allowedTypes: ['application/json'],
            maxSize: 50 * 1024 * 1024 // 50MB
        });
        
        if (!validation.valid) {
            showError(validation.error, SCREENS.FILE_UPLOAD);
            return;
        }
        
        selectedFile = file;
        updateFileInfo(file);
        
        // Clear previous error
        const errorEl = document.getElementById('upload-error');
        if (errorEl) errorEl.classList.add('hidden');
    }
    
    // Remove file
    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedFile = null;
            updateFileInfo(null);
            if (fileInput) fileInput.value = '';
        });
    }
    
    // Upload button
    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            
            await handleFileUpload(selectedFile);
        });
    }
    
    // Retry validation
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            validateAndLoadSession();
        });
    }
}

/**
 * Handle file upload
 * @param {File} file - JSON file to upload
 */
async function handleFileUpload(file) {
    try {
        showUploadProgress(true, 'Reading file...', 10);
        
        // Read file as text
        const jsonString = await readFileAsText(file);
        
        showUploadProgress(true, 'Processing JSON...', 30);
        
        // Convert JSON to CSV (for comparison)
        const csvString = await jsonToCSV(jsonString);
        
        showUploadProgress(true, 'Uploading to server...', 60);
        
        // Store CSV data locally
        if (appState.userRole === 'initiator') {
            appState.csvData1 = csvString;
        } else {
            appState.csvData2 = csvString;
        }
        
        // Upload file content to the bot server
        // The server will handle uploading to Telegram and getting a real file_id
        const uploadResult = await uploadFile(appState.sessionId, jsonString);
        
        // Store the fileId returned from the server
        appState.uploadedFileId = uploadResult.fileId;
        
        showUploadProgress(true, 'File uploaded successfully!', 100);
        
        // If initiator, check if partner file is available
        if (appState.userRole === 'initiator') {
            setTimeout(() => {
                checkForPartnerFile();
            }, 1000);
        } else {
            // Partner: wait for results
            showScreen(SCREENS.COMPARISON_PROGRESS);
            updateProgress('Waiting for initiator to process comparison...', 50);
        }
        
    } catch (error) {
        console.error('File upload error:', error);
        showUploadProgress(false);
        showError(`Upload failed: ${error.message}`, SCREENS.FILE_UPLOAD);
    }
}

/**
 * Check if partner has uploaded file (for initiator)
 */
async function checkForPartnerFile() {
    try {
        showScreen(SCREENS.COMPARISON_PROGRESS);
        updateProgress('Checking for partner file...', 20);
        
        const fileId = await getFileId(appState.sessionId);
        
        if (fileId) {
            appState.partnerFileId = fileId;
            updateProgress('Partner file found! Downloading...', 40);
            
            // Download and process partner's file
            await processPartnerFile(fileId);
        } else {
            updateProgress('Waiting for partner to upload file...', 30);
            
            // Poll for partner file (every 3 seconds)
            const pollInterval = setInterval(async () => {
                try {
                    const fileId = await getFileId(appState.sessionId);
                    if (fileId) {
                        clearInterval(pollInterval);
                        appState.partnerFileId = fileId;
                        updateProgress('Partner file found! Downloading...', 40);
                        await processPartnerFile(fileId);
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                }
            }, 3000);
            
            // Store interval ID for cleanup
            appState.pollInterval = pollInterval;
        }
        
    } catch (error) {
        console.error('Check partner file error:', error);
        showError(`Error: ${error.message}`, SCREENS.COMPARISON_PROGRESS);
    }
}

/**
 * Process partner's file (for initiator)
 * @param {string} fileId - Telegram file ID
 */
async function processPartnerFile(fileId) {
    try {
        updateProgress('Downloading partner file...', 50);
        
        // Download partner's file content from the server
        const partnerJsonString = await downloadPartnerFile(appState.sessionId);
        
        if (!partnerJsonString) {
            throw new Error('Partner file content not available');
        }
        
        updateProgress('Converting partner data...', 60);
        
        // Convert partner JSON to CSV
        const partnerCsvString = await jsonToCSV(partnerJsonString);
        appState.csvData2 = partnerCsvString;
        
        updateProgress('Running comparison...', 70);
        
        // Run comparison
        const results = findMatches(appState.csvData1, appState.csvData2, {
            strategy: 'optimized',
            timeWindowMinutes: 30,
            maxDistanceMeters: 100
        });
        
        appState.results = results;
        
        updateProgress('Comparison complete!', 100);
        
        // Submit results to server
        await submitResults(appState.sessionId, results);
        
        // Display results
        setTimeout(() => {
            displayResults(results);
        }, 500);
        
    } catch (error) {
        console.error('Process partner file error:', error);
        showError(`Comparison failed: ${error.message}`, SCREENS.COMPARISON_PROGRESS);
    }
}

/**
 * Set up result screen buttons
 */
function setupResultButtons() {
    const sendResultsBtn = document.getElementById('send-results-btn');
    const closeBtn = document.getElementById('close-app-btn');
    const completionCloseBtn = document.getElementById('completion-close-btn');
    
    if (sendResultsBtn) {
        sendResultsBtn.addEventListener('click', () => {
            // Send results to Telegram chat via sendData
            if (appState.results) {
                sendDataToTelegram({
                    type: 'comparison_results',
                    sessionId: appState.sessionId,
                    totalMatches: appState.results.summary.totalMatches,
                    results: appState.results
                });
                
                showCompletion('Results have been sent to the chat!');
            }
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            cleanup();
            closeTelegramApp();
        });
    }
    
    if (completionCloseBtn) {
        completionCloseBtn.addEventListener('click', () => {
            cleanup();
            closeTelegramApp();
        });
    }
}

/**
 * Cleanup resources
 */
function cleanup() {
    // Clear polling interval
    if (appState.pollInterval) {
        clearInterval(appState.pollInterval);
    }
    
    // Cleanup file handler
    cleanupFileHandler();
    
    // Clear state
    appState = {
        sessionId: null,
        sessionData: null,
        userRole: null,
        uploadedFileId: null,
        partnerFileId: null,
        csvData1: null,
        csvData2: null,
        results: null
    };
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        setupResultButtons();
    });
} else {
    init();
    setupResultButtons();
}
