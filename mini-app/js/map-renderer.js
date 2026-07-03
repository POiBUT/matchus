/**
 * Map Renderer Module - Renders Leaflet map with match markers
 */

let mapInstance = null;
let markersLayer = null;

/**
 * Render a map showing all matched location pairs
 * @param {Array} matches - array of match objects from compare-core
 * @param {string} containerId - DOM element ID for the map
 */
export function renderMatchMap(matches, containerId = 'map-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.classList.remove('hidden');

    // Destroy previous map instance
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    // Collect all unique coordinates to compute bounds
    const allCoords = [];
    const markerData = [];

    matches.slice(0, 100).forEach((match, i) => {
        const lat1 = parseFloat(match.record1.latitude);
        const lon1 = parseFloat(match.record1.longitude);
        const lat2 = parseFloat(match.record2.latitude);
        const lon2 = parseFloat(match.record2.longitude);

        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return;

        allCoords.push([lat1, lon1], [lat2, lon2]);
        markerData.push({
            index: i,
            lat1, lon1, lat2, lon2,
            distance: match.distanceMeters,
            timeDiff: match.timeDifferenceMinutes
        });
    });

    if (allCoords.length === 0) {
        container.innerHTML = '<p class="hint" style="text-align:center;padding:20px;">No coordinates to display.</p>';
        return;
    }

    // Create map
    mapInstance = L.map(container, {
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(mapInstance);

    // Fit bounds to show all markers
    const bounds = L.latLngBounds(allCoords);
    mapInstance.fitBounds(bounds, { padding: [40, 40] });

    // Add markers
    markersLayer = L.layerGroup().addTo(mapInstance);

    markerData.forEach((data) => {
        // User A marker (blue)
        const marker1 = L.circleMarker([data.lat1, data.lon1], {
            radius: 7,
            fillColor: '#007aff',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(markersLayer);

        marker1.bindTooltip(`A: #${data.index + 1}`, { direction: 'top' });

        // User B marker (red)
        const marker2 = L.circleMarker([data.lat2, data.lon2], {
            radius: 7,
            fillColor: '#ff3b30',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(markersLayer);

        marker2.bindTooltip(`B: #${data.index + 1}`, { direction: 'top' });

        // Connect matched pair with a line
        L.polyline([[data.lat1, data.lon1], [data.lat2, data.lon2]], {
            color: '#34c759',
            weight: 1.5,
            opacity: 0.5,
            dashArray: '4 4'
        }).addTo(markersLayer);

        // Popup on click
        const popupContent = `
            <b>Match #${data.index + 1}</b><br>
            A: ${data.lat1.toFixed(4)}, ${data.lon1.toFixed(4)}<br>
            B: ${data.lat2.toFixed(4)}, ${data.lon2.toFixed(4)}<br>
            Distance: ${data.distance?.toFixed(1) || 'N/A'}m<br>
            Time diff: ${data.timeDiff?.toFixed(1) || 'N/A'} min
        `;
        marker1.bindPopup(popupContent);
        marker2.bindPopup(popupContent);
    });

    // Invalidate size after render (fixes Telegram WebView sizing)
    setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize();
    }, 300);
}

/**
 * Destroy the current map instance
 */
export function destroyMap() {
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }
}