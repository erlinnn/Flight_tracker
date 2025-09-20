// Initialize Globe with normal Earth texture
const globe = Globe()
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundColor('#000000')
    (document.getElementById('globeViz'));

globe.pointOfView({ lat: 0, lng: 0, altitude: 2.5 }, 0);
globe.controls().autoRotate = false; // Disable automatic rotation
globe.controls().autoRotateSpeed = 0.5; // Kept for manual control if enabled later

// Define a simple yellow triangle geometry
let triangleGeometry = new THREE.ShapeGeometry([
    new THREE.Shape()
        .moveTo(0, 0)
        .lineTo(0.05, 0.1) // Triangle points
        .lineTo(0.1, 0)
        .lineTo(0, 0)
]);
let triangleMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
let triangleMesh = new THREE.Mesh(triangleGeometry, triangleMaterial);

// Flight Data Handling
let flightData = [];
let prevFlightData = {};

async function fetchFlightData() {
    try {
        const response = await fetch('https://opensky-network.org/api/states/all');
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
            .filter(flight => flight.latitude && flight.longitude && flight.baro_altitude);
            // Removed .slice(0, 500) to show all valid flights
        console.log(`Fetched ${flightData.length} flights`, flightData.slice(0, 2));
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
        const obj = triangleMesh.clone();
        obj.rotation.y = Math.PI / 2 + (d.true_track * Math.PI / 180);
        console.log('Placed plane at:', d.latitude, d.longitude);
        return obj;
    })
    .customThreeObjectUpdate((obj, d) => {
        // Adjust altitude scaling for better visibility
        const altitude = d.baro_altitude ? d.baro_altitude / 100000 : 0.01; // Reduced divisor
        const { x, y, z } = globe.getCoords(d.latitude, d.longitude, altitude);
        obj.position.set(x, y, z);
        obj.rotation.y = Math.PI / 2 + (d.true_track * Math.PI / 180); // Update rotation
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
globe.onObjectClick((obj, event, { lat, lng, altitude }) => {
    const flight = flightData.find(f => Math.abs(f.latitude - lat) < 0.1 && Math.abs(f.longitude - lng) < 0.1);
    if (flight) {
        console.log('Clicked plane:', flight);
        globe.pointOfView({ lat: flight.latitude, lng: flight.longitude, altitude: 0.3 }, 1000);
        showFlightDetails(flight);
    } else {
        console.log('No matching flight found near', lat, lng);
    }
});

globe.onObjectHover((obj) => {
    if (obj) {
        obj.scale.set(0.04, 0.04, 0.04);
    }
    globe.scene().traverse(child => {
        if (child.userData && child.userData.__globeObjType === 'custom' && child !== obj) {
            child.scale.set(0.02, 0.02, 0.02);
        }
    });
});

function showFlightDetails(flight) {
    document.getElementById('flight-number').textContent = `Flight Number: ${flight.callsign || 'N/A'}`;
    document.getElementById('airline-country').textContent = `Airline/Country: ${flight.origin_country || 'Unknown'}`;
    document.getElementById('altitude').textContent = `Altitude: ${(flight.baro_altitude * 3.28084).toFixed(0)} ft`;
    document.getElementById('speed').textContent = `Speed: ${(flight.velocity * 3.6).toFixed(0)} km/h`;
    document.getElementById('heading').textContent = `Heading: ${flight.true_track.toFixed(0)}° (${degreesToCompass(flight.true_track) || 'N/A'})`;
    document.getElementById('origin').textContent = `Origin: ${flight.origin_country || 'Unknown'}`; // Proxy for from
    document.getElementById('destination').textContent = `Destination: N/A`; // Not available from OpenSky
}

function degreesToCompass(degrees) {
    if (degrees === undefined || isNaN(degrees)) return 'N/A';
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

// Start
fetchFlightData();
setInterval(fetchFlightData, 10000);
requestAnimationFrame(interpolatePositions);
