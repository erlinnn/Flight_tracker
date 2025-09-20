// ====== Globe setup ======
const globe = Globe()
  (document.getElementById('globeViz'))
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png');

globe.pointOfView({ lat: 20, lng: 0, altitude: 2 }); // Start view

// ====== Load plane model ======
const loader = new THREE.GLTFLoader();
let planeModel;

loader.load('assets/plane.glb', (gltf) => {
  planeModel = gltf.scene;
  planeModel.scale.set(0.02, 0.02, 0.02);
  console.log("Plane model loaded successfully");
}, undefined, (err) => {
  console.error("Error loading plane model:", err);
});

// ====== Fetch flights from OpenSky ======
async function fetchFlights() {
  try {
    const res = await fetch("https://opensky-network.org/api/states/all");
    if (!res.ok) throw new Error("OpenSky API error");
    const data = await res.json();

    const flights = data.states
      .filter(f => f[5] && f[6]) // lat/lon not null
      .slice(0, 50) // limit for performance
      .map(f => ({
        lat: f[6],
        lng: f[5],
        callsign: f[1] || "Unknown"
      }));

    // Show as objects on globe
    globe.objectsData(flights)
      .objectLat(d => d.lat)
      .objectLng(d => d.lng)
      .objectLabel(d => `✈ ${d.callsign}`)
      .objectThreeObject(() => {
        if (planeModel) return planeModel.clone();
        return new THREE.Mesh(
          new THREE.SphereGeometry(0.05),
          new THREE.MeshBasicMaterial({ color: "yellow" })
        );
      });

    console.log("Flights loaded:", flights.length);

  } catch (err) {
    console.error("Error fetching flights:", err);
  }
}

// Refresh flights every 30 sec
fetchFlights();
setInterval(fetchFlights, 30000);

// ====== OpenWeather ======
const weatherApiKey = "fa9e78cadd76a9a61cfc87dbca1a5826"; // your API key

async function getWeather() {
  const city = document.getElementById("cityInput").value;
  if (!city) return;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${weatherApiKey}&units=metric`
    );
    if (!res.ok) throw new Error("Weather API error");
    const data = await res.json();

    document.getElementById("weatherResult").innerHTML = `
      <p><b>${data.name}</b> - ${data.weather[0].description}</p>
      <p>🌡 Temp: ${data.main.temp}°C</p>
      <p>💨 Wind: ${data.wind.speed} m/s</p>
    `;
  } catch (err) {
    console.error("Weather error:", err);
    document.getElementById("weatherResult").innerText = "Error fetching weather.";
  }
}
