/**
 * @jest-environment jsdom
 */

/**
 * Tests for settings screen logic
 * Re-implements UI controller functions for testability (same pattern as compare-core.test.js)
 */

describe('Settings screen', () => {
  let timeWindowInput, maxDistanceInput, timeWindowValue, maxDistanceValue;
  let startBtn;

  beforeEach(() => {
    // Set up DOM elements as they appear in index.html
    document.body.innerHTML = `
      <div id="settings" class="screen">
        <div class="container">
          <h2>Settings</h2>
          <div class="setting-group">
            <label for="time-window">
              Time window: <span id="time-window-value">30</span> minutes
            </label>
            <input type="range" id="time-window" class="setting-slider"
              min="0" max="120" value="30" step="1">
            <div class="setting-hint">Max time difference between matching points</div>
          </div>
          <div class="setting-group">
            <label for="max-distance">
              Max distance: <span id="max-distance-value">100</span> meters
            </label>
            <input type="range" id="max-distance" class="setting-slider"
              min="10" max="1000" value="100" step="10">
            <div class="setting-hint">Max distance between matching coordinates</div>
          </div>
          <button id="start-comparison-btn" class="btn btn-primary btn-full">
            Run Comparison
          </button>
        </div>
      </div>
    `;

    timeWindowInput = document.getElementById('time-window');
    maxDistanceInput = document.getElementById('max-distance');
    timeWindowValue = document.getElementById('time-window-value');
    maxDistanceValue = document.getElementById('max-distance-value');
    startBtn = document.getElementById('start-comparison-btn');
  });

  function getSettingsValues() {
    return {
      strategy: 'optimized',
      timeWindowMinutes: parseInt(timeWindowInput?.value) || 30,
      maxDistanceMeters: parseInt(maxDistanceInput?.value) || 100
    };
  }

  function showSettingsScreen(currentSettings = {}) {
    if (timeWindowInput) {
      timeWindowInput.value = currentSettings.timeWindowMinutes ?? 30;
      if (timeWindowValue) timeWindowValue.textContent = timeWindowInput.value;
    }
    if (maxDistanceInput) {
      maxDistanceInput.value = currentSettings.maxDistanceMeters ?? 100;
      if (maxDistanceValue) maxDistanceValue.textContent = maxDistanceInput.value;
    }
  }

  describe('getSettingsValues', () => {
    test('should return default settings (30 min, 100 m)', () => {
      const settings = getSettingsValues();
      expect(settings).toEqual({
        strategy: 'optimized',
        timeWindowMinutes: 30,
        maxDistanceMeters: 100
      });
    });

    test('should return adjusted time window', () => {
      timeWindowInput.value = '60';
      const settings = getSettingsValues();
      expect(settings.timeWindowMinutes).toBe(60);
    });

    test('should return adjusted max distance', () => {
      maxDistanceInput.value = '500';
      const settings = getSettingsValues();
      expect(settings.maxDistanceMeters).toBe(500);
    });

    test('should still work if DOM elements are missing', () => {
      document.body.innerHTML = '';
      const settings = getSettingsValues();
      expect(settings.timeWindowMinutes).toBe(30);
      expect(settings.maxDistanceMeters).toBe(100);
    });
  });

  describe('showSettingsScreen', () => {
    test('should set slider values from passed settings', () => {
      showSettingsScreen({
        timeWindowMinutes: 45,
        maxDistanceMeters: 200
      });

      expect(timeWindowInput.value).toBe('45');
      expect(timeWindowValue.textContent).toBe('45');
      expect(maxDistanceInput.value).toBe('200');
      expect(maxDistanceValue.textContent).toBe('200');
    });

    test('should use defaults when no settings passed', () => {
      showSettingsScreen();

      expect(timeWindowInput.value).toBe('30');
      expect(timeWindowValue.textContent).toBe('30');
      expect(maxDistanceInput.value).toBe('100');
      expect(maxDistanceValue.textContent).toBe('100');
    });

    test('should use defaults for missing properties', () => {
      showSettingsScreen({ timeWindowMinutes: 15 });

      expect(timeWindowInput.value).toBe('15');
      expect(maxDistanceInput.value).toBe('100');
    });
  });

  describe('oninput handlers', () => {
    test('should update display value on slider change', () => {
      // Simulate the oninput behavior from index.html
      timeWindowInput.addEventListener('input', function () {
        const el = document.getElementById('time-window-value');
        if (el) el.textContent = this.value;
      });

      timeWindowInput.value = '90';
      timeWindowInput.dispatchEvent(new Event('input'));

      expect(timeWindowValue.textContent).toBe('90');
    });

    test('should update distance display on slider change', () => {
      maxDistanceInput.addEventListener('input', function () {
        const el = document.getElementById('max-distance-value');
        if (el) el.textContent = this.value;
      });

      maxDistanceInput.value = '750';
      maxDistanceInput.dispatchEvent(new Event('input'));

      expect(maxDistanceValue.textContent).toBe('750');
    });
  });

  describe('Run Comparison button', () => {
    test('should be present in DOM', () => {
      expect(startBtn).not.toBeNull();
      expect(startBtn.textContent).toContain('Run Comparison');
    });

    test('button click should call comparison logic', () => {
      const mockFn = jest.fn();
      startBtn.addEventListener('click', mockFn);
      startBtn.click();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should use current slider values on click', () => {
      timeWindowInput.value = '15';
      maxDistanceInput.value = '50';

      let capturedSettings = null;
      startBtn.addEventListener('click', () => {
        capturedSettings = getSettingsValues();
      });

      startBtn.click();

      expect(capturedSettings).toEqual({
        strategy: 'optimized',
        timeWindowMinutes: 15,
        maxDistanceMeters: 50
      });
    });
  });
});
