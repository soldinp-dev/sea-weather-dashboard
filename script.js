// Configuration
const CONFIG = {
    STATION_ID: 'KSEA',
    API_ENDPOINT: 'https://aviationweather.gov/api/data/metar',
    CORS_PROXY: 'https://cors-anywhere.herokuapp.com/',
    REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
    HOURS_BACK: 24
};

let autoRefreshEnabled = true;
let refreshInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    fetchAndParseMetar();
    startAutoRefresh();
});

// Event listeners
function setupEventListeners() {
    document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
        autoRefreshEnabled = e.target.checked;
        if (autoRefreshEnabled) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    document.getElementById('manualRefreshBtn').addEventListener('click', fetchAndParseMetar);
}

// Auto-refresh management
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(fetchAndParseMetar, CONFIG.REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
}

// Main fetch and parse function
async function fetchAndParseMetar() {
    const statusEl = document.getElementById('metarStatus');
    statusEl.classList.add('show');
    statusEl.classList.remove('error', 'success');
    statusEl.textContent = '📡 Fetching METAR data...';

    try {
        const now = new Date();
        const startTime = new Date(now.getTime() - CONFIG.HOURS_BACK * 60 * 60 * 1000);

        // Format timestamps for API
        const startStr = formatTimeForAPI(startTime);
        const endStr = formatTimeForAPI(now);

        // Try to fetch data with CORS proxy first, then fallback
        let response;
        try {
            response = await fetch(
                `${CONFIG.CORS_PROXY}${CONFIG.API_ENDPOINT}?ids=${CONFIG.STATION_ID}&format=json&hours=${CONFIG.HOURS_BACK}`
            );
        } catch (e) {
            // Fallback to direct fetch (may not work due to CORS)
            console.warn('CORS proxy failed, trying direct fetch...');
            response = await fetch(
                `${CONFIG.API_ENDPOINT}?ids=${CONFIG.STATION_ID}&format=json&hours=${CONFIG.HOURS_BACK}`
            );
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.ObstationMetar || data.ObstationMetar.length === 0) {
            throw new Error('No METAR data returned from aviationweather.gov');
        }

        // Parse all METAR reports
        const metarReports = data.ObstationMetar.map(metar => parseMetar(metar)).filter(Boolean);

        if (metarReports.length === 0) {
            throw new Error('Could not parse any METAR reports');
        }

        // Sort by time (newest first for display)
        metarReports.sort((a, b) => new Date(b.time) - new Date(a.time));

        // Update UI
        updateStatCards(metarReports);
        updateMetarTable(metarReports);

        statusEl.classList.add('success');
        statusEl.textContent = `✅ Updated ${metarReports.length} METAR reports`;
        document.getElementById('lastUpdated').textContent = now.toLocaleTimeString('en-US', { 
            timeZone: 'UTC', 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + ' UTC';

        // Hide status after 5 seconds
        setTimeout(() => statusEl.classList.remove('show'), 5000);
    } catch (error) {
        console.error('METAR fetch error:', error);
        statusEl.classList.add('error');
        statusEl.textContent = `❌ Error: ${error.message}. Check browser console for details.`;
    }
}

// Parse individual METAR report
function parseMetar(metarData) {
    try {
        const rawMetar = metarData.rawOb;
        if (!rawMetar) return null;

        const result = {
            time: new Date(metarData.obsTime),
            rawMetar: rawMetar,
            tempF: null,
            tempPreciseF: null,
            windSpeedKt: null,
            windDirection: null,
            dewpointF: null,
            visibility: null,
            skyCondition: null
        };

        // Parse temperature with decimal precision from T-group
        const tGroupMatch = rawMetar.match(/T(\d{4})(\d{4})/);
        if (tGroupMatch) {
            const tempCelsius = parseInt(tGroupMatch[1]) / 10;
            result.tempF = parseFloat((tempCelsius * 9/5 + 32).toFixed(1));
            result.tempPreciseF = result.tempF;
            
            // Rounded value for WU resolution
            result.roundedF = Math.round(result.tempF);
        }

        // Fallback: parse from temperature string
        if (!result.tempF) {
            const tempMatch = rawMetar.match(/M?(\d{2})\/M?(\d{2})/);
            if (tempMatch) {
                let temp = parseInt(tempMatch[1]);
                if (rawMetar.includes('M' + tempMatch[1])) temp = -temp;
                result.tempF = temp;
                result.roundedF = temp;
            }
        }

        // Parse dew point
        const dewMatch = rawMetar.match(/\/M?(\d{2})/);
        if (dewMatch) {
            let dp = parseInt(dewMatch[1]);
            if (rawMetar.substring(rawMetar.indexOf('/'), rawMetar.indexOf('/')+3).includes('M')) dp = -dp;
            result.dewpointF = dp;
        }

        // Parse wind
        const windMatch = rawMetar.match(/(\d{3})(\d{2})KT/);
        if (windMatch) {
            result.windDirection = windMatch[1];
            result.windSpeedKt = parseInt(windMatch[2]);
        }

        // Parse visibility
        const visMatch = rawMetar.match(/(\d+)SM/);
        if (visMatch) {
            result.visibility = visMatch[1] + ' SM';
        }

        // Parse sky condition (simplified)
        if (rawMetar.includes('SKC') || rawMetar.includes('CLR')) {
            result.skyCondition = 'Clear';
        } else if (rawMetar.includes('FEW')) {
            result.skyCondition = 'Few clouds';
        } else if (rawMetar.includes('SCT')) {
            result.skyCondition = 'Scattered';
        } else if (rawMetar.includes('BKN')) {
            result.skyCondition = 'Broken';
        } else if (rawMetar.includes('OVC')) {
            result.skyCondition = 'Overcast';
        }

        return result;
    } catch (error) {
        console.error('Parse error:', error);
        return null;
    }
}

// Update stat cards
function updateStatCards(reports) {
    // Find high temperature
    const highReport = reports.reduce((max, curr) => 
        (curr.tempF && (!max.tempF || curr.tempF > max.tempF)) ? curr : max
    );

    if (highReport.tempF) {
        document.getElementById('highTempRounded').textContent = `${highReport.roundedF}°F`;
        document.getElementById('highTempPrecise').textContent = `(${highReport.tempPreciseF}°F)`;
        document.getElementById('wuResolution').textContent = `${highReport.roundedF}°F`;
    }

    // Latest report
    if (reports.length > 0 && reports[0].tempF) {
        document.getElementById('latestTempRounded').textContent = `${reports[0].roundedF}°F`;
        document.getElementById('latestTempPrecise').textContent = `(${reports[0].tempPreciseF}°F)`;
        document.getElementById('lastMetarTime').textContent = reports[0].time.toLocaleTimeString('en-US', {
            timeZone: 'UTC',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Other latest values
    if (reports[0].windSpeedKt !== null) {
        document.getElementById('windSpeed').textContent = `${reports[0].windSpeedKt} kt`;
        document.getElementById('windDir').textContent = `${reports[0].windDirection}°`;
    }

    if (reports[0].dewpointF !== null) {
        document.getElementById('dewPoint').textContent = `${reports[0].dewpointF}°F`;
    }

    if (reports[0].visibility) {
        document.getElementById('visibility').textContent = reports[0].visibility;
    }

    if (reports[0].skyCondition) {
        document.getElementById('skyCondition').textContent = reports[0].skyCondition;
    }
}

// Update METAR table
function updateMetarTable(reports) {
    const tbody = document.getElementById('metarTableBody');
    tbody.innerHTML = '';

    const highTemp = Math.max(...reports.map(r => r.tempF || -Infinity));

    reports.forEach(report => {
        const row = document.createElement('tr');
        
        const isHigh = report.tempF === highTemp && report.tempF !== null;
        if (isHigh) {
            row.classList.add('high-temp');
        }

        row.innerHTML = `
            <td>${formatTime(report.time)}</td>
            <td>${report.roundedF !== null ? report.roundedF + '°F' : '--'}</td>
            <td>${report.tempPreciseF !== null ? report.tempPreciseF + '°F' : '--'}${isHigh ? '<span class="high-badge">HIGH</span>' : ''}</td>
            <td>${report.windSpeedKt !== null ? report.windSpeedKt + ' kt' : '--'}</td>
            <td>${report.dewpointF !== null ? report.dewpointF + '°F' : '--'}</td>
            <td>${report.visibility || '--'}</td>
            <td>${report.skyCondition || '--'}</td>
            <td><span class="raw-metar">${report.rawMetar}</span></td>
        `;

        tbody.appendChild(row);
    });
}

// Utility functions
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        timeZone: 'UTC',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeForAPI(date) {
    return date.toISOString();
}

// Handle page visibility to pause/resume refresh
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else if (autoRefreshEnabled) {
        startAutoRefresh();
    }
});