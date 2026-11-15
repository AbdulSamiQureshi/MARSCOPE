import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import * as THREE from "three";
import { FACTS, FEATURES, KB, LAYERS, R, SITES } from "./data";
import "./App.css";

const TABS = [
  ["overview", "Overview"],
  ["about", "About Mars"],
  ["explore", "Explore"],
  ["safety", "Safety"],
  ["science", "Science"],
  ["assistant", "Assistant"],
];

const rad = (degrees) => (degrees * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function Tag({ p }) {
  return <span className={`tag ${p.toLowerCase()}`}>{p}</span>;
}

function Globe() {
  const ref = useRef(null);
  const [textureStatus, setTextureStatus] = useState("Illustrative");
  const [isRotating, setIsRotating] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const rotationRef = useRef(isRotating);

  const enterFullscreen = () => {
    ref.current?.requestFullscreen().catch((error) => {
      console.error("Could not display the Mars globe fullscreen.", error);
    });
  };

  const toggleRotation = () => {
    rotationRef.current = !rotationRef.current;
    setIsRotating(rotationRef.current);
  };

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error("Could not initialize the Mars globe.", error);
      element.dataset.webglError = "true";
      return undefined;
    }

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 2.85;

    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 4096;
    colorCanvas.height = 2048;
    const colorContext = colorCanvas.getContext("2d");
    colorContext.fillStyle = "#a9502b";
    colorContext.fillRect(0, 0, colorCanvas.width, colorCanvas.height);

    const heightCanvas = document.createElement("canvas");
    heightCanvas.width = 2048;
    heightCanvas.height = 1024;
    const heightContext = heightCanvas.getContext("2d");
    heightContext.fillStyle = "#808080";
    heightContext.fillRect(0, 0, heightCanvas.width, heightCanvas.height);

    const colorTexture = new THREE.CanvasTexture(colorCanvas);
    const heightTexture = new THREE.CanvasTexture(heightCanvas);
    colorTexture.colorSpace = THREE.SRGBColorSpace;
    colorTexture.anisotropy = heightTexture.anisotropy =
      renderer.capabilities.getMaxAnisotropy();

    const stitchTiles = (layer, zoom, canvas, texture) => {
      const count = 2 ** zoom;
      const tileSize = canvas.width / (2 * count);
      const context = canvas.getContext("2d");

      for (let row = 0; row < count; row += 1) {
        for (let column = 0; column < 2 * count; column += 1) {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => {
            context.drawImage(
              image,
              column * tileSize,
              row * tileSize,
              tileSize,
              tileSize,
            );
            texture.needsUpdate = true;
            if (layer === "viking") setTextureStatus("NASA");
          };
          image.src = LAYERS[layer].url
            .replace("{z}", zoom)
            .replace("{y}", row)
            .replace("{x}", column);
        }
      }
    };

    stitchTiles("viking", 3, colorCanvas, colorTexture);
    stitchTiles("mola", 2, heightCanvas, heightTexture);

    const group = new THREE.Group();
    const planetMaterial = new THREE.MeshStandardMaterial({
      map: colorTexture,
      bumpMap: heightTexture,
      bumpScale: 0.008,
      roughness: 1,
      metalness: 0,
    });
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, 192, 192),
      planetMaterial,
    );
    group.add(planet);
    group.rotation.x = -0.65;

    const sunlight = new THREE.DirectionalLight(0xffe6d3, 2.5);
    sunlight.position.set(-4, 1.5, 3);
    scene.add(
      group,
      sunlight,
      new THREE.AmbientLight(0xd8b9a2, 1.35),
    );

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let frame;
    const onPointerDown = (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onPointerMove = (event) => {
      if (dragging) {
        group.rotation.y += (event.clientX - lastX) * 0.006;
        group.rotation.x += (event.clientY - lastY) * 0.006;
        lastX = event.clientX;
        lastY = event.clientY;
      }
    };
    const onWheel = (event) => {
      event.preventDefault();
      camera.position.z = Math.min(
        6,
        Math.max(1.6, camera.position.z + event.deltaY * 0.002),
      );
    };
    const animate = () => {
      if (!dragging && rotationRef.current) group.rotation.y += 0.0015;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      colorTexture.dispose();
      heightTexture.dispose();
      planet.geometry.dispose();
      planetMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="globe-wrap">
      <div
        ref={ref}
        className="globe"
        aria-label="Interactive 3D globe of Mars"
      >
        <div className="globe-controls">
          <button
            className="globe-control"
            onClick={toggleRotation}
            aria-label={isRotating ? "Pause globe rotation" : "Resume globe rotation"}
            title={isRotating ? "Pause rotation" : "Resume rotation"}
          >
            {isRotating ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                <path d="M9 6v12m6-12v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                <path d="m9 6 10 6-10 6V6Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            className="globe-control"
            onClick={enterFullscreen}
            aria-label="View Mars globe fullscreen"
            title="View fullscreen"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <p className="globe-note">
        Drag in any direction to explore · scroll to zoom · NASA Mars surface imagery{" "}
        <Tag p={textureStatus} />
        {textureStatus === "Illustrative" && (
          <small> NASA tiles are unavailable; showing a placeholder.</small>
        )}
        {textureStatus === "NASA" && (
          <small>NASA Viking MDIM21 color mosaic · MOLA shaded relief</small>
        )}
      </p>
    </div>
  );
}

function MapGlobe() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) {
      console.error("Could not initialize the map globe canvas.");
      return undefined;
    }

    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 1024;
    textureCanvas.height = 512;
    const context = textureCanvas.getContext("2d");
    if (!context) {
      console.error("Could not initialize the Mars map texture canvas.");
      return undefined;
    }
    context.fillStyle = "#713e2e";
    context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
    let texturePixels = context.getImageData(
      0,
      0,
      textureCanvas.width,
      textureCanvas.height,
    );

    const drawSphere = () => {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(clientWidth * pixelRatio);
      canvas.height = Math.round(clientHeight * pixelRatio);
      const diameter = Math.round(
        Math.min(canvas.width, canvas.height) * 0.76,
      );
      const spherePixels = canvasContext.createImageData(diameter, diameter);
      const center = (diameter - 1) / 2;
      const light = [-0.45, 0.25, 1];
      const lightLength = Math.hypot(...light);
      light[0] /= lightLength;
      light[1] /= lightLength;
      light[2] /= lightLength;
      for (let y = 0; y < diameter; y += 1) {
        const ny = (center - y) / center;
        for (let x = 0; x < diameter; x += 1) {
          const nx = (x - center) / center;
          const distanceSquared = nx * nx + ny * ny;
          if (distanceSquared > 1) continue;
          const nz = Math.sqrt(1 - distanceSquared);
          const longitude = Math.atan2(nx, nz);
          const latitude = Math.asin(ny);
          const sourceX =
            ((longitude / (2 * Math.PI) + 0.5) * textureCanvas.width) %
            textureCanvas.width;
          const sourceY = (0.5 - latitude / Math.PI) * textureCanvas.height;
          const sourceIndex =
            (Math.floor(sourceY) * textureCanvas.width +
              Math.floor(sourceX)) *
            4;
          const targetIndex = (y * diameter + x) * 4;
          const illumination =
            0.18 +
            0.82 *
              Math.max(
                0,
                nx * light[0] + ny * light[1] + nz * light[2],
              );
          spherePixels.data[targetIndex] =
            texturePixels.data[sourceIndex] * illumination;
          spherePixels.data[targetIndex + 1] =
            texturePixels.data[sourceIndex + 1] * illumination;
          spherePixels.data[targetIndex + 2] =
            texturePixels.data[sourceIndex + 2] * illumination;
          spherePixels.data[targetIndex + 3] = 255;
        }
      }

      canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = diameter / 2;
      const halo = canvasContext.createRadialGradient(
        centerX,
        centerY,
        radius * 0.7,
        centerX,
        centerY,
        radius * 1.45,
      );
      halo.addColorStop(0, "rgb(96 153 239 / 14%)");
      halo.addColorStop(1, "rgb(96 153 239 / 0%)");
      canvasContext.fillStyle = halo;
      canvasContext.beginPath();
      canvasContext.arc(centerX, centerY, radius * 1.45, 0, Math.PI * 2);
      canvasContext.fill();
      canvasContext.putImageData(
        spherePixels,
        Math.round(centerX - radius),
        Math.round(centerY - radius),
      );
    };

    const tileCount = 2 ** 1;
    const tileSize = textureCanvas.width / (tileCount * 2);
    let completedTiles = 0;
    const finishTile = () => {
      completedTiles += 1;
      if (completedTiles === tileCount * tileCount * 2) {
        try {
          texturePixels = context.getImageData(
            0,
            0,
            textureCanvas.width,
            textureCanvas.height,
          );
        } catch (error) {
          console.error("Could not read the NASA Mars map texture.", error);
        }
        drawSphere();
      }
    };
    for (let row = 0; row < tileCount; row += 1) {
      for (let column = 0; column < tileCount * 2; column += 1) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          context.drawImage(
            image,
            column * tileSize,
            row * tileSize,
            tileSize,
            tileSize,
          );
          finishTile();
        };
        image.onerror = finishTile;
        image.src = LAYERS.viking.url
          .replace("{z}", "1")
          .replace("{y}", String(row))
          .replace("{x}", String(column));
      }
    }

    const resizeObserver = new ResizeObserver(drawSphere);
    resizeObserver.observe(canvas);
    drawSphere();
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="map-globe" aria-hidden="true" />;
}

function MapView({ mode, setMode }) {
  const mapElement = useRef(null);
  const mapFrame = useRef(null);
  const map = useRef(null);
  const tileLayer = useRef(null);
  const markers = useRef(L.layerGroup());
  const clickHandler = useRef(null);
  const [layer, setLayer] = useState("mola");
  const [waypoints, setWaypoints] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [era, setEra] = useState("All");
  const [pace, setPace] = useState(3);
  const [suitLife, setSuitLife] = useState(8);
  const [returnToStart, setReturnToStart] = useState(true);

  const focusPoint = useCallback((point) => {
    const zoom = Math.min(7, Math.max(4, map.current?.getZoom() ?? 1));
    mapElement.current?.setAttribute("aria-label", `Interactive map of Mars, zoom level ${zoom}`);
    map.current?.flyTo(point, zoom, { duration: 0.65 });
  }, []);

  useEffect(() => {
    clickHandler.current = (point) => {
      if (mode === "route") setWaypoints((current) => [...current, point]);
      focusPoint([point.lat, point.lng]);

      const candidates = mode === "geo" ? FEATURES : SITES;
      const nearest = candidates
        .map((location) => ({
          location,
          distance: hav(point, { lat: location.lat, lng: location.lon }),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      const isNamedLocation = mode !== "route" && nearest?.distance <= 250;
      const title =
        mode === "route"
          ? "Marswalk waypoint"
          : isNamedLocation
            ? nearest.location.name
            : "Mars surface coordinates";
      const detail =
        mode === "route"
          ? "Waypoint added to the illustrative Marswalk route."
          : isNamedLocation
            ? nearest.location.info
            : "No named feature here. Coordinates are approximate.";
      const content = document.createElement("div");
      const heading = document.createElement("strong");
      const coordinates = document.createElement("div");
      const description = document.createElement("p");
      heading.textContent = title;
      coordinates.textContent = `${point.lat.toFixed(2)}°, ${point.lng.toFixed(2)}°`;
      description.textContent = detail;
      content.append(heading, coordinates, description);
      L.popup()
        .setLatLng(point)
        .setContent(content)
        .openOn(map.current);
    };
  }, [focusPoint, mode]);

  useEffect(() => {
    const instance = L.map(mapElement.current, {
      crs: L.CRS.EPSG4326,
      center: [10, 40],
      zoom: 1,
      minZoom: 0.5,
      maxZoom: 7,
      zoomSnap: 0.25,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      worldCopyJump: false,
    });
      const updateGlobeBlend = () => {
        const zoom = instance.getZoom();
        const amount = Math.max(0, Math.min(1, (0.95 - zoom) / 0.45));
        const blend = amount * amount * (3 - 2 * amount);
        mapFrame.current?.style.setProperty("--globe-blend", blend.toFixed(3));
        mapElement.current?.setAttribute(
          "aria-label",
          blend > 0.5
            ? "Mars map transitioning to a full globe"
            : `Interactive map of Mars, zoom level ${zoom.toFixed(2)}`,
        );
      };
      instance.on("zoom zoomend", updateGlobeBlend);
      updateGlobeBlend();
    instance.on("click", (event) => clickHandler.current?.(event.latlng));
    instance.on("mousemove", (event) => setCursor(event.latlng));
    markers.current.addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const selectedLayer = LAYERS[layer];
    if (tileLayer.current) map.current.removeLayer(tileLayer.current);
    tileLayer.current = L.tileLayer(selectedLayer.url, {
      noWrap: true,
      maxNativeZoom: selectedLayer.zoom,
      maxZoom: 7,
      attribution: "NASA/JPL Mars Trek",
    }).addTo(map.current);
    tileLayer.current.on("tileerror", () => {
      if (layer === "viking") setLayer("mola");
    });
    tileLayer.current.bringToBack();
  }, [layer]);

  useEffect(() => {
    const group = markers.current;
    group.clearLayers();
    const addSite = (site, color) => {
      const marker = L.circleMarker([site.lat, site.lon], {
        radius: 7,
        color: "#fff",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.95,
      });
      marker.on("click", () => focusPoint([site.lat, site.lon]));
      marker
        .bindPopup(
          `<b>${site.name}</b><br>${site.type || ""} ${site.era || ""}<br>${site.info}<br><i>NASA</i>`,
        )
        .addTo(group);
    };

    if (mode === "map" || mode === "terrain") {
      SITES.forEach((site) => addSite(site, "#ff6a2b"));
    }
    if (mode === "geo") {
      FEATURES.filter((feature) => era === "All" || feature.era === era).forEach(
        (feature) => addSite(feature, "#ffb347"),
      );
    }
    if (mode === "route") {
      waypoints.forEach((point, index) =>
        L.circleMarker(point, {
          radius: 6,
          color: "#fff",
          fillColor: "#ff6a2b",
          fillOpacity: 1,
        })
          .bindTooltip(String(index + 1), { permanent: true, direction: "top" })
          .addTo(group),
      );
      L.polyline(waypoints, {
        color: "#ff6a2b",
        weight: 3,
        dashArray: "6",
      }).addTo(group);
    }
  }, [focusPoint, mode, era, waypoints]);

  const flyTo = (site) => focusPoint([site.lat, site.lon]);
  const distance = waypoints
    .slice(1)
    .reduce((total, point, index) => total + hav(waypoints[index], point), 0);
  const totalDistance = returnToStart ? 2 * distance : distance;
  const safePace = Math.max(0.5, pace);
  const hours = totalDistance / safePace;
  const withinSuitMargin = hours <= suitLife * 0.7;

  return (
    <section
      className="page map-section"
      id="explore"
      aria-labelledby="explore-title"
    >
      <div className="page-heading map-heading">
        <p className="eyebrow">INTERACTIVE MARS ATLAS</p>
        <h1 id="explore-title">Explore Mars</h1>
        <p className="muted">
          Click the map to zoom to a location; use the scroll wheel to adjust.
          Zoom out to blend the surface map into a full Mars globe.
        </p>
      </div>
      <div className="explorer-nav" role="group" aria-label="Mars explorer tools">
        {[
          ["map", "Landing sites"],
          ["terrain", "Terrain"],
          ["geo", "Geology"],
          ["route", "Marswalk"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={mode === key ? "active" : ""}
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="split">
      <div ref={mapFrame} className="map-frame">
        <div
          ref={mapElement}
          className="map"
          aria-label="Interactive map of Mars"
        />
        <MapGlobe />
      </div>
      <aside className="panel map-panel">
        {(mode === "map" || mode === "terrain") && (
          <>
            <h2>Landing sites <Tag p="NASA" /></h2>
            {SITES.map((site) => (
              <button
                key={site.name}
                className="row"
                onClick={() => flyTo(site)}
              >
                <span>{site.name}</span>
                <small>
                  {site.lat}°, {site.lon}°
                </small>
              </button>
            ))}
          </>
        )}
        {mode === "terrain" && (
          <>
            <h2>Map layer</h2>
            {Object.entries(LAYERS).map(([key, value]) => (
              <button
                key={key}
                className={`row ${layer === key ? "selected" : ""}`}
                onClick={() => setLayer(key)}
              >
                {value.name}
              </button>
            ))}
            <p className="muted">
              Cursor:{" "}
              {cursor
                ? `${cursor.lat.toFixed(2)}°, ${cursor.lng.toFixed(2)}°`
                : "move over map"}{" "}
              <Tag p="Derived" />
            </p>
          </>
        )}
        {mode === "geo" && (
          <>
            <h2>Geological features <Tag p="NASA" /></h2>
            <div className="chips">
              {["All", "Noachian", "Hesperian", "Amazonian"].map((period) => (
                <button
                  key={period}
                  className={`chip ${era === period ? "selected" : ""}`}
                  onClick={() => setEra(period)}
                >
                  {period}
                </button>
              ))}
            </div>
            {FEATURES.filter(
              (feature) => era === "All" || feature.era === era,
            ).map((feature) => (
              <button
                key={feature.name}
                className="row row-detail"
                onClick={() => flyTo(feature)}
              >
                <b>{feature.name}</b>
                <small>
                  {feature.type} · {feature.era}
                </small>
                <small>{feature.info}</small>
              </button>
            ))}
          </>
        )}
        {mode === "route" && (
          <>
            <h2>Marswalk planner</h2>
            <p className="muted">Click the map to add route waypoints.</p>
            <label>
              Walking pace (km/h) <Tag p="Illustrative" />
              <input
                type="number"
                min="0.5"
                max="6"
                step="0.5"
                value={pace}
                onChange={(event) =>
                  setPace(Math.max(0.5, Number(event.target.value) || 0.5))
                }
              />
            </label>
            <label>
              Suit life (hours) <Tag p="Illustrative" />
              <input
                type="number"
                min="1"
                max="12"
                value={suitLife}
                onChange={(event) =>
                  setSuitLife(Math.max(1, Number(event.target.value) || 1))
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={returnToStart}
                onChange={(event) => setReturnToStart(event.target.checked)}
              />
              Return to start (out and back)
            </label>
            <div className="stat">Waypoints: {waypoints.length}</div>
            <div className="stat">
              Distance: {totalDistance.toFixed(1)} km <Tag p="Derived" />
            </div>
            <div className="stat">
              EVA time: {hours.toFixed(1)} h <Tag p="Derived" />
            </div>
            <div
              className={`stat ${
                waypoints.length > 1
                  ? withinSuitMargin
                    ? "good"
                    : "bad"
                  : ""
              }`}
            >
              {waypoints.length < 2
                ? "Add 2+ waypoints"
                : withinSuitMargin
                  ? "Within 70% of suit life"
                  : "Exceeds 70% suit-life margin"}{" "}
              <Tag p="Illustrative" />
            </div>
            <p className="muted">
              Straight-line legs; slope and hazards are not included. Real
              planning requires high-resolution terrain data.
            </p>
            <div className="chips">
              <button
                className="btn"
                onClick={() => setWaypoints((points) => points.slice(0, -1))}
                disabled={!waypoints.length}
              >
                Undo
              </button>
              <button
                className="btn secondary"
                onClick={() => setWaypoints([])}
                disabled={!waypoints.length}
              >
                Clear
              </button>
            </div>
          </>
        )}
      </aside>
      </div>
    </section>
  );
}

function Safety() {
  const [sols, setSols] = useState(500);
  const [shielding, setShielding] = useState(0.7);
  const [transitDays, setTransitDays] = useState(180);
  const surfaceDose = 0.67 * sols * shielding;
  const cruiseDose = 1.84 * transitDays * 2;
  const totalDose = surfaceDose + cruiseDose;

  return (
    <section className="page" id="safety">
      <div className="page-heading">
        <p className="eyebrow">MISSION RISK</p>
        <h1>Astronaut safety</h1>
        <p className="muted">
          Explore how mission duration and shielding affect an illustrative
          radiation estimate.
        </p>
      </div>
      <div className="grid">
        <div className="card">
          <h2>Mission radiation estimate</h2>
          <label>
            Surface stay (sols) <Tag p="Illustrative" />
            <input
              type="range"
              min="1"
              max="700"
              value={sols}
              onChange={(event) => setSols(Number(event.target.value))}
            />
            <b>{sols} sols</b>
          </label>
          <label>
            One-way transit (days) <Tag p="Illustrative" />
            <input
              type="range"
              min="100"
              max="300"
              value={transitDays}
              onChange={(event) => setTransitDays(Number(event.target.value))}
            />
            <b>{transitDays} days</b>
          </label>
          <label>
            Habitat shielding <Tag p="Illustrative" />
            <select
              value={shielding}
              onChange={(event) => setShielding(Number(event.target.value))}
            >
              <option value="1">None</option>
              <option value="0.7">Regolith cover (×0.7)</option>
              <option value="0.5">Heavy shielding (×0.5)</option>
            </select>
          </label>
          <div className="stat">
            Surface dose: {surfaceDose.toFixed(0)} mSv <Tag p="Derived" />
          </div>
          <div className="stat">
            Round-trip cruise dose: {cruiseDose.toFixed(0)} mSv{" "}
            <Tag p="Derived" />
          </div>
          <div className={`stat ${totalDose < 1000 ? "good" : "bad"}`}>
            Total: {totalDose.toFixed(0)} mSv vs 1,000 mSv reference guideline
          </div>
          <p className="muted">
            Base rates are based on published NASA measurements. Shielding
            factors and durations are assumptions; shielding applies to
            surface dose only. This is not medical advice or a mission design
            tool.
          </p>
        </div>
        <div className="card">
          <h2>Environment reference</h2>
          <div className="table-scroll">
            <table>
              <tbody>
                {FACTS.map((fact) => (
                  <tr key={fact[0]}>
                    <td>{fact[0]}</td>
                    <td>{fact[1]}</td>
                    <td>
                      <Tag p={fact[2]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutMars({ go }) {
  const quickFacts = [
    ["4th", "planet from the Sun"],
    ["687", "Earth days in a Martian year"],
    ["24 h 39 m", "length of one sol"],
    ["2", "small moons: Phobos and Deimos"],
    ["3,389.5 km", "mean radius"],
    ["3.71 m/s²", "surface gravity"],
    ["−63 °C", "mean surface temperature"],
    ["~95%", "of the atmosphere is carbon dioxide"],
  ];

  const milestones = [
    ["1976", "Viking 1 and Viking 2", "NASA's first successful Mars landers."],
    [
      "1997",
      "Pathfinder and Sojourner",
      "A lander and the first wheeled rover explored Ares Vallis.",
    ],
    [
      "2004",
      "Spirit and Opportunity",
      "Twin rovers began exploring the Martian surface.",
    ],
    [
      "2012",
      "Curiosity",
      "The rover landed in Gale Crater to study whether Mars could have supported microbial life.",
    ],
    [
      "2021",
      "Perseverance and Ingenuity",
      "The rover began exploring Jezero Crater; Ingenuity demonstrated powered flight on another planet.",
    ],
  ];

  return (
    <section className="page about-page" id="about">
      <header className="page-heading about-heading">
        <p className="eyebrow">A NEIGHBORING WORLD</p>
        <h1>Meet Mars.</h1>
        <p className="about-lede">
          The red planet is a cold, rocky world with ancient river valleys,
          immense volcanoes, and a thin atmosphere. It is also one of the most
          explored places beyond Earth.
        </p>
      </header>

      <div className="grid facts-grid about-facts">
        {quickFacts.map(([value, label]) => (
          <article className="card fact-card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
            <Tag p="NASA" />
          </article>
        ))}
      </div>

      <div className="about-section-heading">
        <p className="eyebrow">THE PLANET ITSELF</p>
        <h2>A world of extremes</h2>
      </div>
      <div className="about-story-grid">
        <article className="card about-story">
          <span className="about-index">01 / LANDSCAPE</span>
          <h3>Ancient terrain</h3>
          <p>
            Mars holds the largest volcano known in the Solar System, Olympus
            Mons, and the vast canyon system Valles Marineris. Its cratered
            highlands and dried-up channels preserve clues to a wetter past.
          </p>
          <button className="text-link" onClick={() => go("explore", "geo")}>
            Explore Martian geology <span aria-hidden="true">→</span>
          </button>
        </article>
        <article className="card about-story">
          <span className="about-index">02 / AIR &amp; WEATHER</span>
          <h3>A thin, dusty atmosphere</h3>
          <p>
            The atmosphere is mostly carbon dioxide and far thinner than
            Earth&apos;s. Temperatures are generally cold, and winds can lift
            fine dust into storms that sometimes spread across the planet.
          </p>
          <button className="text-link" onClick={() => go("safety")}>
            See the environment guide <span aria-hidden="true">→</span>
          </button>
        </article>
        <article className="card about-story">
          <span className="about-index">03 / EXPLORATION</span>
          <h3>Robots lead the way</h3>
          <p>
            Orbiters, landers, and rovers study Mars from above and on the
            ground. Their discoveries help scientists understand how the
            planet changed and where to look for signs of ancient habitability.
          </p>
          <button className="text-link" onClick={() => go("science")}>
            Browse Mars imagery <span aria-hidden="true">→</span>
          </button>
        </article>
      </div>

      <section
        className="mission-history"
        aria-labelledby="mission-history-title"
      >
        <div className="about-section-heading">
          <p className="eyebrow">A GROWING EXPLORATION STORY</p>
          <h2 id="mission-history-title">Milestones on Mars</h2>
        </div>
        <div className="mission-timeline">
          {milestones.map(([year, mission, detail]) => (
            <article className="timeline-entry" key={year}>
              <span className="timeline-year">{year}</span>
              <span className="timeline-dot" aria-hidden="true" />
              <div>
                <h3>{mission}</h3>
                <p>{detail}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="about-source">
          Mission milestones and planetary facts: NASA. Mars is a dynamic
          world—new discoveries continue to refine our understanding.
        </p>
        <button
          className="btn about-map-button"
          onClick={() => go("explore", "map")}
        >
          Find the landing sites <span aria-hidden="true">↗</span>
        </button>
      </section>

      <section className="moon-section" aria-labelledby="mars-moons-title">
        <div className="about-section-heading">
          <p className="eyebrow">TWO TINY COMPANIONS</p>
          <h2 id="mars-moons-title">Meet the moons</h2>
        </div>
        <div className="moon-grid">
          <article className="card moon-card">
            <span className="moon-orbit phobos-orbit" aria-hidden="true">
              <span />
            </span>
            <div>
              <span className="about-index">INNER MOON</span>
              <h3>Phobos</h3>
              <p>
                The larger and closer of Mars&apos;s two moons, Phobos orbits
                the planet in less time than a Martian sol.
              </p>
            </div>
          </article>
          <article className="card moon-card">
            <span className="moon-orbit deimos-orbit" aria-hidden="true">
              <span />
            </span>
            <div>
              <span className="about-index">OUTER MOON</span>
              <h3>Deimos</h3>
              <p>
                Smaller and farther out than Phobos, Deimos is a dark,
                irregular moon that takes a little over one Martian day to
                orbit Mars.
              </p>
            </div>
          </article>
        </div>
        <p className="moon-image-credit">
          Surface imagery: NASA/JPL-Caltech/University of Arizona (Phobos
          PIA10367; Deimos PIA11826).
        </p>
      </section>
    </section>
  );
}

function Science() {
  const [query, setQuery] = useState("perseverance");
  const [searchQuery, setSearchQuery] = useState("perseverance");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [favoriteState, setFavoriteState] = useState(() => {
    try {
      const saved = window.localStorage.getItem("marscope:nasa-image-favorites");
      if (!saved) return { favorites: [], status: "" };
      const parsed = JSON.parse(saved);
      if (
        !Array.isArray(parsed) ||
        parsed.some(
          (image) =>
            !image ||
            typeof image.id !== "string" ||
            typeof image.src !== "string" ||
            typeof image.title !== "string" ||
            typeof image.description !== "string" ||
            typeof image.mission !== "string" ||
            typeof image.date !== "string" ||
            typeof image.credit !== "string" ||
            typeof image.nasaId !== "string" ||
            !Array.isArray(image.keywords) ||
            image.keywords.some((keyword) => typeof keyword !== "string"),
        )
      ) {
        throw new Error("Saved image favorites have an invalid format.");
      }
      return { favorites: parsed, status: "" };
    } catch (error) {
      console.error("Could not load saved NASA image favorites.", error);
      return {
        favorites: [],
        status: "Saved favorites could not be loaded in this browser.",
      };
    }
  });
  const favorites = favoriteState.favorites;
  const favoriteStatus = favoriteState.status;
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isViewerClosing, setIsViewerClosing] = useState(false);
  const imageTrigger = useRef(null);
  const viewerCloseButton = useRef(null);
  const viewerCloseTimer = useRef(null);

  const closeImageViewer = useCallback(() => {
    if (!selectedImage || isViewerClosing) return;
    setIsViewerClosing(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 240;
    viewerCloseTimer.current = window.setTimeout(() => {
      viewerCloseTimer.current = null;
      setSelectedImage(null);
      setIsViewerClosing(false);
    }, delay);
  }, [isViewerClosing, selectedImage]);

  const toggleFavorite = (image) => {
    const updatedFavorites = favorites.some(
      (favorite) => favorite.id === image.id,
    );
    const nextFavorites = updatedFavorites
      ? favorites.filter((favorite) => favorite.id !== image.id)
      : [image, ...favorites];
    try {
      window.localStorage.setItem(
        "marscope:nasa-image-favorites",
        JSON.stringify(nextFavorites),
      );
      setFavoriteState({ favorites: nextFavorites, status: "" });
    } catch (error) {
      console.error("Could not save NASA image favorites.", error);
      setFavoriteState({
        favorites: nextFavorites,
        status: "Could not save favorites in this browser.",
      });
    }
  };

  const images = items.flatMap((item) => {
    const data = item.data?.[0];
    const image = item.links?.find((link) => link.render === "image");
    if (!data || !image) return [];
    const keywords = Array.isArray(data.keywords)
      ? data.keywords.filter((keyword) => typeof keyword === "string")
      : [];
    const created = data.date_created ? new Date(data.date_created) : null;
    return [
      {
        id: data.nasa_id || image.href,
        src: image.href,
        title: data.title || "NASA image",
        description:
          data.description || "From NASA's public image collection.",
        mission:
          keywords.find((keyword) =>
            /perseverance|curiosity|viking|pathfinder|spirit|opportunity|phoenix|insight|ingenuity|mars 2020|mars exploration rover|mars reconnaissance orbiter|mars odyssey/i.test(
              keyword,
            ),
          ) || "Not specified by NASA",
        date:
          created && !Number.isNaN(created.getTime())
            ? created.toLocaleDateString()
            : "Not provided",
        credit: data.photographer || data.secondary_creator || "NASA",
        nasaId: data.nasa_id || "Not provided",
        keywords: keywords.slice(0, 4),
      },
    ];
  });
  const visibleImages = favoritesOnly ? favorites : images;

  const search = (searchTerm = query) => {
    setQuery(searchTerm);
    setSearchQuery(searchTerm);
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadImages = async () => {
      setStatus("Searching NASA Image Library…");
      try {
        const response = await fetch(
          `https://images-api.nasa.gov/search?media_type=image&q=${encodeURIComponent(`Mars ${searchQuery}`)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`NASA Image Library returned ${response.status}`);
        }
        const result = await response.json();
        const results = result.collection.items.slice(0, 18);
        setItems(results);
        setStatus(results.length ? "" : "No results found. Try another search.");
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("NASA Image Library search failed.", error);
        setItems([]);
        setStatus("Could not reach NASA Image Library. Check your connection.");
      }
    };
    loadImages();
    return () => controller.abort();
  }, [searchQuery]);

  useEffect(() => {
    if (!selectedImage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    viewerCloseButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      imageTrigger.current?.focus();
    };
  }, [selectedImage]);

  useEffect(
    () => () => {
      if (viewerCloseTimer.current) {
        window.clearTimeout(viewerCloseTimer.current);
      }
    },
    [],
  );

  return (
    <section className="page" id="science">
      <div className="page-heading">
        <p className="eyebrow">NASA IMAGE LIBRARY</p>
        <h1>Science discovery</h1>
        <p className="muted">
          Search Mars imagery from NASA&apos;s public image collection.
        </p>
      </div>
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <input
          aria-label="Search NASA images"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Mars images…"
        />
        <button className="btn" type="submit">
          Search NASA
        </button>
      </form>
      <div className="chips">
        {["Jezero", "Curiosity", "Olympus Mons", "Ingenuity"].map((term) => (
          <button
            key={term}
            className="chip"
            onClick={() => search(term)}
          >
            {term}
          </button>
        ))}
      </div>
      <p className="muted search-status" role="status">
        {status}
      </p>
      <div className="gallery-toolbar" role="group" aria-label="Filter NASA images">
        <button
          className={`chip${favoritesOnly ? "" : " selected"}`}
          type="button"
          aria-pressed={!favoritesOnly}
          onClick={() => setFavoritesOnly(false)}
        >
          All images
        </button>
        <button
          className={`chip${favoritesOnly ? " selected" : ""}`}
          type="button"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(true)}
        >
          Favorites ({favorites.length})
        </button>
      </div>
      <p className="muted favorite-status" role="status">
        {favoriteStatus ||
          (favoritesOnly && !visibleImages.length
            ? "No saved images yet. Select the star on an image to save it."
            : "")}
      </p>
      <div className="gallery">
        {visibleImages.map((image) => {
          const isFavorite = favorites.some(
            (favorite) => favorite.id === image.id,
          );
          return (
            <article key={image.id} className="card image-card">
              <button
                className="image-card-preview"
                type="button"
                aria-label={`Open image: ${image.title}`}
                onClick={(event) => {
                  imageTrigger.current = event.currentTarget;
                  setSelectedImage(image);
                }}
              >
                <img loading="lazy" src={image.src} alt="" />
                <span>{image.title}</span>
              </button>
              <button
                className="image-favorite"
                type="button"
                aria-label={`${isFavorite ? "Remove" : "Add"} ${image.title} ${
                  isFavorite ? "from" : "to"
                } favorites`}
                aria-pressed={isFavorite}
                onClick={() => toggleFavorite(image)}
              >
                {isFavorite ? "★" : "☆"}
              </button>
            </article>
          );
        })}
      </div>
      {selectedImage && (
        <div
          className={`image-lightbox${isViewerClosing ? " closing" : ""}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeImageViewer();
          }}
        >
          <div
            className="image-lightbox-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-viewer-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeImageViewer();
              if (event.key === "Tab") {
                event.preventDefault();
                viewerCloseButton.current?.focus();
              }
            }}
          >
            <button
              ref={viewerCloseButton}
              className="image-lightbox-close"
              type="button"
              aria-label="Close image viewer"
              onClick={closeImageViewer}
            >
              ×
            </button>
            <img
              className="image-lightbox-photo"
              src={selectedImage.src}
              alt={selectedImage.title}
            />
            <div className="image-lightbox-caption">
              <p className="eyebrow">NASA IMAGE LIBRARY</p>
              <h2 id="image-viewer-title">{selectedImage.title}</h2>
              <p>{selectedImage.description}</p>
              <dl className="image-lightbox-metadata">
                <div>
                  <dt>Mission / program</dt>
                  <dd>{selectedImage.mission}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{selectedImage.date}</dd>
                </div>
                <div>
                  <dt>Credit</dt>
                  <dd>{selectedImage.credit}</dd>
                </div>
                <div>
                  <dt>NASA ID</dt>
                  <dd>{selectedImage.nasaId}</dd>
                </div>
                <div className="image-lightbox-keywords">
                  <dt>NASA keywords</dt>
                  <dd>
                    {selectedImage.keywords.length
                      ? selectedImage.keywords.join(", ")
                      : "Not provided"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Assistant({ go }) {
  const [messages, setMessages] = useState([
    {
      me: false,
      text: "Ask about Mars gravity, radiation, landing sites, geology, or routes. I answer from the reference data bundled in this app. I am a keyword assistant, not a generative AI.",
    },
  ]);
  const [value, setValue] = useState("");

  const ask = (text) => {
    const question = text.trim();
    if (!question) return;
    const normalized = question.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    KB.forEach((entry) => {
      const score = entry.keywords.filter((keyword) =>
        normalized.includes(keyword),
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    });

    setMessages((current) => [
      ...current,
      { me: true, text: question },
      bestMatch
        ? {
            me: false,
            text: bestMatch.answer,
            provenance: bestMatch.provenance,
            destination: bestMatch.destination,
          }
        : {
            me: false,
            text: "I do not have verified data on that. Try gravity, radiation, atmosphere, sol, route, Jezero, volcano, canyon, Hellas, terrain, or images.",
          },
    ]);
    setValue("");
  };

  return (
    <section className="page assistant-page" id="assistant">
      <div className="page-heading">
        <p className="eyebrow">REFERENCE ASSISTANT</p>
        <h1>Mission assistant</h1>
        <p className="muted">
          Ask questions about Mars using the bundled reference data.
        </p>
      </div>
      <div className="chat" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={`${index}-${message.text}`}
            className={`message ${message.me ? "mine" : ""}`}
          >
            {message.text}
            {message.provenance && <Tag p={message.provenance} />}
            {message.destination && (
              <button
                className="chip"
                onClick={() => go(message.destination)}
              >
                Open section →
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="chips">
        {[
          "Mars gravity",
          "Radiation dose",
          "Plan a route",
          "Tallest volcano",
          "Why Jezero?",
        ].map((suggestion) => (
          <button
            key={suggestion}
            className="chip"
            onClick={() => ask(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          ask(value);
        }}
      >
        <input
          aria-label="Ask the MARSCOPE assistant"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask MARSCOPE…"
        />
        <button className="btn" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}

function Intro({ exiting, onExitStart, onEnter }) {
  useEffect(() => {
    if (exiting) return undefined;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      onExitStart,
      reducedMotion ? 20 : 4900,
    );
    return () => window.clearTimeout(timeout);
  }, [exiting, onExitStart]);

  useEffect(() => {
    if (!exiting) return undefined;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(onEnter, reducedMotion ? 20 : 950);
    return () => window.clearTimeout(timeout);
  }, [exiting, onEnter]);

  return (
    <main
      className={`intro-screen ${exiting ? "is-exiting" : ""}`}
      aria-labelledby="intro-title"
    >
      <div className="intro-stars" aria-hidden="true" />
      <div className="shooting-stars" aria-hidden="true">
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
      </div>
      <header className="intro-header">
        <div className="intro-wordmark">
          MARSCOPE <span>MISSION BRIEFING</span>
        </div>
        <div className="intro-signal">
          <span className="signal-dot" />
          SIGNAL ACQUIRED
        </div>
      </header>

      <div className="intro-content">
        <section className="intro-copy">
          <p className="intro-kicker">
            <span>DEEP SPACE NETWORK</span>
            <span>·</span>
            <span>MISSION 01</span>
          </p>
          <h1 id="intro-title">
            THE RED
            <br />
            <span>PLANET.</span>
          </h1>
          <p className="intro-description">
            A new world, waiting to be explored. Begin your journey across the
            surface, science, and stories of Mars.
          </p>
          <div className="intro-actions">
            <button
              className="intro-launch"
              onClick={onExitStart}
              disabled={exiting}
            >
              Enter mission control <span aria-hidden="true">↗</span>
            </button>
            <span className="intro-duration">INTERACTIVE MARS FIELD GUIDE</span>
          </div>
        </section>

        <section className="intro-visual" aria-label="Rotating Mars globe">
          <div className="intro-orbit intro-orbit-one" aria-hidden="true" />
          <div className="intro-orbit intro-orbit-two" aria-hidden="true" />
          <Globe />
          <div className="intro-coordinate intro-coordinate-top" aria-hidden="true">
            18° 26′ N<br />
            77° 27′ E
          </div>
          <div className="intro-coordinate intro-coordinate-bottom" aria-hidden="true">
            MARS<br />
            360° / 01
          </div>
        </section>
      </div>

      <footer className="intro-footer">
        <div className="intro-progress">
          <span>ESTABLISHING ORBITAL CONNECTION</span>
          <div className="intro-progress-track">
            <span
              onAnimationEnd={(event) => {
                if (
                  !exiting &&
                  event.animationName === "progress-sweep"
                ) {
                  onExitStart();
                }
              }}
            />
          </div>
        </div>
        <button
          className="intro-skip"
          onClick={onExitStart}
          disabled={exiting}
        >
          Skip intro <span aria-hidden="true">→</span>
        </button>
      </footer>
    </main>
  );
}

export default function App() {
  const [introPhase, setIntroPhase] = useState("intro");
  const [mapMode, setMapMode] = useState("map");
  const [activeSection, setActiveSection] = useState("overview");
  const introComplete = introPhase === "complete";
  const beginIntroExit = useCallback(() => setIntroPhase("exiting"), []);
  const finishIntro = useCallback(() => setIntroPhase("complete"), []);

  const navigateTo = (destination, selectedMode) => {
    const mapModes = ["map", "terrain", "geo", "route"];
    const mode = selectedMode || (mapModes.includes(destination) && destination);
    if (mode) setMapMode(mode);

    const section =
      destination === "explore" || mapModes.includes(destination)
        ? "explore"
        : destination;
    document.getElementById(section)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    if (!introComplete) return undefined;
    const sections = [
      "overview",
      "about",
      "explore",
      "safety",
      "science",
      "assistant",
    ]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const updateActiveSection = () => {
      const threshold = window.innerHeight * 0.3;
      let current = sections[0];
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= threshold) {
          current = section;
        }
      });
      if (current) setActiveSection(current.id);
    };
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    updateActiveSection();
    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [introComplete]);

  useEffect(() => {
    if (
      !introComplete ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return undefined;
    }

    const elements = document.querySelectorAll(
      "#overview .hero-copy, #overview .section-heading, #overview .fact-card, #overview .explore-banner, .page-heading, .about-story, .timeline-entry, .moon-card, #safety .card, .search-bar, .image-card, #assistant .chat",
    );
    elements.forEach((element) => element.classList.add("reveal-ready"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("reveal-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -35px 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [introComplete]);

  return (
    <>
      {introPhase !== "complete" && (
        <Intro
          key="intro"
          exiting={introPhase === "exiting"}
          onExitStart={beginIntroExit}
          onEnter={finishIntro}
        />
      )}
      {introPhase !== "intro" && (
    <div className="app" key="site">
      <div className="shooting-stars" aria-hidden="true">
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
      </div>
      <header className="site-header">
        <a className="brand" href="#overview" aria-label="MARSCOPE home">
          MARSCOPE <span>FIELD GUIDE</span>
        </a>
        <nav aria-label="Main navigation">
          {TABS.map(([key, label]) => (
            <a
              key={key}
              className={activeSection === key ? "active" : ""}
              aria-current={activeSection === key ? "location" : undefined}
              href={`#${key}`}
              onClick={() => setActiveSection(key)}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main>
          <section className="page overview-page" id="overview">
            <div className="hero">
              <div className="hero-copy">
                <p className="eyebrow">FIELD NOTES FROM THE RED PLANET</p>
                <h1>
                  A field guide
                  <br />
                  to <span>Mars.</span>
                </h1>
                <p className="hero-description">
                  Explore the surface, understand the terrain, and prepare for
                  the realities of life on another world.
                </p>
                <div className="chips">
                  <button
                    className="btn"
                    onClick={() => navigateTo("explore", "map")}
                  >
                    Explore the map <span aria-hidden="true">↗</span>
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => navigateTo("explore", "route")}
                  >
                    Plan a Marswalk
                  </button>
                </div>
                <p className="muted provenance-note">
                  <Tag p="NASA" /> NASA / USGS source data{" "}
                  <Tag p="Derived" /> calculated{" "}
                  <Tag p="Illustrative" /> assumptions
                </p>
              </div>
              <Globe />
            </div>
            <div className="section-heading">
              <div>
                <p className="eyebrow">AT A GLANCE</p>
                <h2>Mars, in context</h2>
              </div>
              <span className="muted">A few numbers to start your journey</span>
            </div>
            <div className="grid facts-grid">
              {FACTS.slice(0, 4).map((fact) => (
                <article className="card fact-card" key={fact[0]}>
                  <span>{fact[0]}</span>
                  <strong>{fact[1]}</strong>
                  <Tag p={fact[2]} />
                </article>
              ))}
            </div>
            <div className="explore-banner">
              <div>
                <p className="eyebrow">YOUR NEXT STOP</p>
                <h2>Every journey starts somewhere.</h2>
                <p className="muted">
                  Discover the places, conditions, and science shaping the next
                  era of exploration.
                </p>
              </div>
              <div className="chips">
                <button
                  className="btn"
                  onClick={() => navigateTo("about")}
                >
                  Get to know Mars <span aria-hidden="true">↗</span>
                </button>
                <button
                  className="btn secondary"
                  onClick={() => navigateTo("science")}
                >
                  Browse Mars imagery
                </button>
              </div>
            </div>
          </section>
          <AboutMars go={navigateTo} />
          <MapView mode={mapMode} setMode={setMapMode} />
          <Safety />
          <Science />
          <Assistant go={navigateTo} />
      </main>
      <footer>
        <span>MARSCOPE · AN EXPLORER&apos;S FIELD GUIDE</span>
        <span>Informational estimates · Not for operational mission planning</span>
        <button
          className="footer-replay"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "auto" });
            setIntroPhase("intro");
          }}
        >
          Replay intro
        </button>
      </footer>
    </div>
      )}
    </>
  );
}
