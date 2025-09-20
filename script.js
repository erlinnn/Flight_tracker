// Initialize Globe with normal Earth texture
const globe = Globe()
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg') // Normal blue/green Earth
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundColor('#000000')
    (document.getElementById('globeViz'));

globe.pointOfView({ lat: 0, lng: 0, altitude: 2.5 }, 0);
globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.5;

// API Credentials
const openSkyClientId = 'antony_paul123-api-client';
const openSkyClientSecret = 'ExUdIu0SnhB3X6BVNcr8Z4EyqJ3EN9LE';
const openWeatherApiKey = 'ea99cd3d8aeeb401f9dc4ab3202326f6';

// Load 3D Plane Model
let planeModel;
const loader = new THREE.GLTFLoader();
loader.load('assets/plane.glb', (gltf) => {
    planeModel = gltf.scene;
    planeModel.scale.set(0.01, 0.01, 0.01); // Slightly larger for visibility
    console.log('Plane model loaded successfully');
}, undefined, (error) => {
    console.error('Error loading plane model:', error);
    planeModel = new THREE.Mesh(
        new THREE.SphereGeometry(0.02), // Larger, bright yellow fallback
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    console.log('Using yellow sphere fallback for planes');
});

// Flight Data Handling
let flightData = [];
let prevFlightData = {};

async function getOpenSkyToken() {
    try {
        const response = await fetch('https://opensky-network.org/api/auth/v1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                'grant_type': 'client_credentials',
                'client_id': openSkyClientId,
                'client_secret': openSkyClientSecret,
            }),
        });
        const data = await response.json();
        console.log('OpenSky token fetched:', data.access_token ? 'Success' : 'Failed');
        return data.access_token;
    } catch (error) {
        console.error('Error fetching OpenSky token:', error);
        return null;
    }
}

async function fetchFlightData() {
    const token = await getOpenSkyToken();
    if (!token) {
        console.error('No token, cannot fetch flight data');
        return;
    }

    try {
        const response = await fetch('https://opensky-network.org/api/states/all', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        flightData = data.states
            .map(state => ({
                icao24: state[0],
                callsign: state[1] ? state[1].trim() : 'Unknown',
                origin_country: state[2],
                longitude: state[5],
                latitude: state[6],
                baro_altitude: state[7],
                velocity: state[9],
                true_track: state[10],
            }))
            .filter(flight => flight.latitude && flight.longitude && flight.baro_altitude)
            .slice(0, 500); // Limit for performance
        console.log(`Fetched ${flightData.length} flights`, flightData.slice(0, 2)); // Log sample data
        updateLiveCount();
        updatePlanes();

        flightData.forEach(flight => {
            prevFlightData[flight.icao24] = { ...flight, timestamp: Date.now() };
        });
        Object.keys(prevFlightData).forEach(id => {
            if (!flightData.find(f => f.icao24 === id)) delete prevFlightData[id];
        });
    } catch (error) {
        console.error('Error fetching flight data:', error);
    }
}

// Plane Layer
const planesLayer = globe.customLayerData([])
    .customThreeObject(d => {
        if (!planeModel) {
            console.error('Plane model not loaded yet');
            return new THREE.Mesh(
                new THREE.SphereGeometry(0.02),
                new THREE.MeshBasicMaterial({ color: 0xffff00 })
            );
        }
        const obj = planeModel.clone();
        obj.rotation.y = Math.PI / 2 + (d.true_track * Math.PI / 180);
        console.log('Placed plane at:', d.latitude, d.longitude); // Debug placement
        return obj;
    })
    .customThreeObjectUpdate((obj, d) => {
        globe.setObjLatLngAlt(obj, d.latitude, d.longitude, d.baro_altitude / 500000); // Adjusted altitude
    });

function updatePlanes() {
    console.log('Updating planes layer with', flightData.length, 'flights');
    planesLayer.customLayerData(flightData);
}

function updateLiveCount() {
    document.getElementById('live-count').textContent = `Live Flights: ${flightData.length}`;
}

// Smooth Interpolation
function interpolatePositions() {
    const now = Date.now();
    flightData.forEach(flight => {
        const prev = prevFlightData[flight.icao24];
        if (prev) {
            const timeDiff = now - prev.timestamp;
            const interpFactor = Math.min(timeDiff / 10000, 1);
            flight.latitude = prev.latitude + (flight.latitude - prev.latitude) * interpFactor;
            flight.longitude = prev.longitude + (flight.longitude - prev.longitude) * interpFactor;
            flight.baro_altitude = prev.baro_altitude + (flight.baro_altitude - prev.baro_altitude) * interpFactor;
            flight.true_track = prev.true_track + (flight.true_track - prev.true_track) * interpFactor;
        }
    });
    updatePlanes();
    requestAnimationFrame(interpolatePositions);
}

// Click and Hover Interactions
planesLayer.onClick((d) => {
    console.log('Clicked plane:', d);
    globe.pointOfView({ lat: d.latitude, lng: d.longitude, altitude: 0.3 }, 1000);
    showFlightDetails(d);
});

planesLayer.onHover((d) => {
    if (d) {
        const obj = planesLayer.getCustomThreeObject(d);
        obj.scale.set(0.02, 0.02, 0.02);
    }
    globe.scene().traverse(child => {
        if (child.userData && child.userData.hoverOut) {
            child.scale.set(0.01, 0.01, 0.01);
        }
    });
});

function showFlightDetails(flight) {
    document.getElementById('flight-number').textContent = `Flight Number: ${flight.callsign}`;
    document.getElementById('airline-country').textContent = `Airline/Country: ${flight.origin_country}`;
    document.getElementById('altitude').textContent = `Altitude: ${(flight.baro_altitude * 3.28084).toFixed(0)} ft`;
    document.getElementById('speed').textContent = `Speed: ${(flight.velocity * 3.6).toFixed(0)} km/h`;
    document.getElementById('heading').textContent = `Heading: ${flight.true_track.toFixed(0)}° (${degreesToCompass(flight.true_track)})`;
}

function degreesToCompass(degrees) {
    const val = Math.floor((degrees / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
}

// Search Box
document.getElementById('search-box').addEventListener('input', (e) => {
    const query = e.target.value.toUpperCase().trim();
    const matchingFlight = flightData.find(f => f.callsign === query);
    if (matchingFlight) {
        console.log('Found flight:', matchingFlight);
        globe.pointOfView({ lat: matchingFlight.latitude, lng: matchingFlight.longitude, altitude: 0.3 }, 1000);
        showFlightDetails(matchingFlight);
    }
});

// Day/Night Overlay (Optional, subtle)
async function fetchDayNightData() {
    const latLngGrid = [
        { lat: 0, lon: 0 }, { lat: 0, lon: 90 }, { lat: 0, lon: -90 },
        { lat: 45, lon: 0 }, { lat: -45, lon: 0 },
    ];
    const dayNightData = [];

    for (const point of latLngGrid) {
        try {
            const response = await fetch(
                `https://api.openweathermap.org/data/3.0/onecall?lat=${point.lat}&lon=${point.lon}&exclude=minutely,hourly,daily,alerts&appid=${openWeatherApiKey}`
            );
            const data = await response.json();
            const isDay = Date.now() / 1000 > data.current.sunrise && Date.now() / 1000 < data.current.sunset;
            dayNightData.push({ lat: point.lat, lon: point.lon, isDay });
        } catch (error) {
            console.error('Error fetching weather data:', error);
        }
    }
    return dayNightData;
}

async function updateDayNightOverlay() {
    const data = await fetchDayNightData();
    console.log('Day/night data:', data);
    globe.hexPolygonsData(data)
        .hexPolygonColor(d => d.isDay ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 50, 0.1)')
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.1);
}

// Start
fetchFlightData();
setInterval(fetchFlightData, 10000);
requestAnimationFrame(interpolatePositions);
updateDayNightOverlay();
setInterval(updateDayNightOverlay, 300000);
