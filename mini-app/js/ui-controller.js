/**
 * UI Controller Module - Screen management and UI updates
 */

// Screen IDs
const SCREENS = {
    SESSION_VALIDATION: 'session-validation',
    FILE_UPLOAD: 'file-upload',
    COMPARISON_PROGRESS: 'comparison-progress',
    RESULTS_DISPLAY: 'results-display',
    COMPLETION: 'completion'
};

/**
 * Show a specific screen and hide others
 * @param {string} screenId - ID of screen to show
 */
export function showScreen(screenId) {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show target screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    } else {
        console.error(`Screen not found: ${screenId}`);
    }
}

/**
 * Update progress bar and status message
 * @param {string} message - status message
 * @param {number} percent - progress percentage (0-100)
 * @param {string} screenId - which screen's progress to update (optional)
 */
export function updateProgress(message, percent, screenId = SCREENS.COMPARISON_PROGRESS) {
    const screen = document.getElementById(screenId);
    if (!screen) return;
    
    const progressFill = screen.querySelector('.progress-fill') || document.getElementById('comparison-progress-fill');
    const progressText = screen.querySelector('.progress-text') || document.getElementById('comparison-status');
    
    if (progressFill) {
        progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
    
    if (progressText) {
        progressText.textContent = message;
    }
}

/**
 * Display comparison results
 * @param {Object} results - comparison results object
 */
export function displayResults(results) {
    const summary = results.summary || {};
    const matches = results.matches || [];
    
    // Update total matches
    const totalMatchesEl = document.getElementById('total-matches');
    if (totalMatchesEl) {
        totalMatchesEl.textContent = summary.totalMatches || 0;
    }
    
    // Show/hide no results message
    const noResultsEl = document.getElementById('no-results');
    const resultsListEl = document.getElementById('results-list');
    
    if (matches.length === 0) {
        if (noResultsEl) noResultsEl.classList.remove('hidden');
        if (resultsListEl) resultsListEl.classList.add('hidden');
    } else {
        if (noResultsEl) noResultsEl.classList.add('hidden');
        if (resultsListEl) {
            resultsListEl.classList.remove('hidden');
            populateResultsList(resultsListEl, matches);
        }
    }
    
    // Show results screen
    showScreen(SCREENS.RESULTS_DISPLAY);
}

/**
 * Populate results list with match items
 * @param {HTMLElement} container - results list container
 * @param {Array} matches - array of match objects
 */
function populateResultsList(container, matches) {
    container.innerHTML = '';
    
    // Limit display to first 50 matches for performance
    const displayMatches = matches.slice(0, 50);
    
    displayMatches.forEach((match, index) => {
        const item = createResultItem(match, index + 1);
        container.appendChild(item);
    });
    
    if (matches.length > 50) {
        const moreInfo = document.createElement('p');
        moreInfo.className = 'hint';
        moreInfo.textContent = `... and ${matches.length - 50} more matches`;
        moreInfo.style.textAlign = 'center';
        moreInfo.style.color = 'var(--tg-theme-hint-color, #999999)';
        moreInfo.style.padding = '12px';
        container.appendChild(moreInfo);
    }
}

/**
 * Create a single result item element
 * @param {Object} match - match object
 * @param {number} number - match number
 * @returns {HTMLElement} - result item element
 */
function createResultItem(match, number) {
    const item = document.createElement('div');
    item.className = 'result-item';
    
    const distance = match.distanceMeters ? `${match.distanceMeters.toFixed(1)}m` : 'N/A';
    const timeDiff = match.timeDifferenceMinutes ? `${match.timeDifferenceMinutes.toFixed(1)} min` : 'N/A';
    
    item.innerHTML = `
        <div class="result-header">
            <span class="result-number">Match #${number}</span>
            <span class="result-distance">${distance}</span>
        </div>
        <div class="result-details">
            <div>Time difference: ${timeDiff}</div>
            <div>Location 1: ${match.record1.latitude}, ${match.record1.longitude}</div>
            <div>Location 2: ${match.record2.latitude}, ${match.record2.longitude}</div>
        </div>
        <div class="result-time">
            ${formatDateTime(match.record1.startTime)}
        </div>
    `;
    
    return item;
}

/**
 * Format date time for display
 * @param {string} dateTimeStr - ISO date string
 * @returns {string} - formatted date string
 */
function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
        const date = new Date(dateTimeStr);
        return date.toLocaleString();
    } catch (e) {
        return dateTimeStr;
    }
}

/**
 * Show error message
 * @param {string} message - error message
 * @param {string} screenId - which screen to show error on (optional)
 */
export function showError(message, screenId = null) {
    if (screenId) {
        const screen = document.getElementById(screenId);
        if (screen) {
            const errorEl = screen.querySelector('.error-message') || createErrorElement(screen);
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    } else {
        // Show in current screen
        const activeScreen = document.querySelector('.screen.active');
        if (activeScreen) {
            const errorEl = activeScreen.querySelector('.error-message') || createErrorElement(activeScreen);
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }
}

/**
 * Create error element and append to screen
 * @param {HTMLElement} screen - screen element
 * @returns {HTMLElement} - error element
 */
function createErrorElement(screen) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    screen.querySelector('.container').appendChild(errorEl);
    return errorEl;
}

/**
 * Show validation status
 * @param {boolean} isValid - whether validation passed
 * @param {string} message - status message
 */
export function showValidationStatus(isValid, message) {
    const statusEl = document.getElementById('validation-status');
    const errorEl = document.getElementById('validation-error');
    
    if (isValid) {
        if (statusEl) {
            statusEl.innerHTML = `
                <div style="color: #34c759; font-size: 48px; margin-bottom: 16px;">✓</div>
                <p>${message || 'Session validated successfully!'}</p>
            `;
        }
        setTimeout(() => {
            showScreen(SCREENS.FILE_UPLOAD);
        }, 1000);
    } else {
        if (statusEl) statusEl.classList.add('hidden');
        if (errorEl) {
            errorEl.classList.remove('hidden');
            errorEl.querySelector('p').textContent = message || 'Session validation failed';
        }
    }
}

/**
 * Update file info display
 * @param {File|null} file - file object or null to hide
 */
export function updateFileInfo(file) {
    const fileInfoEl = document.getElementById('file-info');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const uploadBtn = document.getElementById('upload-btn');
    
    if (file && fileInfoEl && fileNameEl && fileSizeEl) {
        fileInfoEl.classList.remove('hidden');
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatFileSize(file.size);
        if (uploadBtn) uploadBtn.disabled = false;
    } else {
        if (fileInfoEl) fileInfoEl.classList.add('hidden');
        if (uploadBtn) uploadBtn.disabled = true;
    }
}

/**
 * Format file size for display
 * @param {number} bytes - size in bytes
 * @returns {string} - formatted size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Show upload progress
 * @param {boolean} show - whether to show progress
 * @param {string} message - progress message
 * @param {number} percent - progress percentage
 */
export function showUploadProgress(show, message = 'Processing...', percent = 0) {
    const progressEl = document.getElementById('upload-progress');
    const progressFill = document.getElementById('upload-progress-fill');
    const progressText = document.getElementById('upload-progress-text');
    
    if (progressEl) {
        if (show) {
            progressEl.classList.remove('hidden');
        } else {
            progressEl.classList.add('hidden');
        }
    }
    
    if (progressFill) {
        progressFill.style.width = `${percent}%`;
    }
    
    if (progressText) {
        progressText.textContent = message;
    }
}

/**
 * Show completion screen
 * @param {string} message - completion message
 */
export function showCompletion(message = 'Results have been sent to the chat.') {
    const messageEl = document.getElementById('completion-message');
    if (messageEl) {
        messageEl.textContent = message;
    }
    showScreen(SCREENS.COMPLETION);
}

// Export screen constants
export { SCREENS };
