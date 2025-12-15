<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Map from 'ol/Map';
	import View from 'ol/View';
	import TileLayer from 'ol/layer/Tile';
	import XYZ from 'ol/source/XYZ';
	import VectorSource from 'ol/source/Vector';
	import VectorImageLayer from 'ol/layer/VectorImage';
	import Feature from 'ol/Feature';
	import LineString from 'ol/geom/LineString';
	import Point from 'ol/geom/Point';
	import Style from 'ol/style/Style';
	import Stroke from 'ol/style/Stroke';
	import Fill from 'ol/style/Fill';
	import CircleStyle from 'ol/style/Circle';
	import { Zoom, ScaleLine } from 'ol/control';
	import { defaults as defaultControls } from 'ol/control/defaults';
	import { fromLonLat, toLonLat } from 'ol/proj';
	import type { FeatureLike } from 'ol/Feature';
	import type { Coordinate } from 'ol/coordinate';
	import type Layer from 'ol/layer/Layer';
	import LayerGroup from 'ol/layer/Group';
	import { WarpedMapLayer } from '@allmaps/openlayers';
	import 'ol/ol.css';

	import { DATASET_URL, INITIAL_CENTER } from '$lib/viewer/constants';
	import type { MapListItem } from '$lib/viewer/types';
	import { startTracking, stopTracking, formatError } from './geolocation';
	import type { TrackingState } from './types';
	import MapSelector from './MapSelector.svelte';
	import DirectionCone from './DirectionCone.svelte';
	import ViewControls from './ViewControls.svelte';
	import LocationButton from './LocationButton.svelte';
	import LocationSearch from './LocationSearch.svelte';
	import CityFilterDialog from './CityFilterDialog.svelte';
	import WelcomeDialog from './WelcomeDialog.svelte';
	import MapCollectionHint from './MapCollectionHint.svelte';
	import MobileControls from './MobileControls.svelte';
	import { createTripStateStore } from './stores/tripState';
	import { createTimelineStateStore } from './stores/timelineState';
	import { setTripContext } from './context/tripContext';
	import { fetchMultipleBounds } from './mapBounds';
	import { startOrientationTracking, stopOrientationTracking } from './orientation';

	let mapContainer: HTMLDivElement;
	let map: Map | null = null;
	let warpedLayer: WarpedMapLayer | null = null;
	let trackLayer: VectorImageLayer<VectorSource> | null = null;
	let trackSource: VectorSource | null = null;
	let positionLayer: VectorImageLayer<VectorSource> | null = null;
	let positionSource: VectorSource | null = null;
	let swipePosition: number = 0.5; // For split mode (0-1)

	let trackingState: TrackingState = 'inactive';
	let watchId: number | null = null;
	let currentTrack: Feature<LineString> | null = null;
	let currentPosition: Feature<Point> | null = null;
	let coordinates: Coordinate[] = [];
	let autoFollow = true;
	let error: string | null = null;

	let selectedMapId: string | null = null;
	let mapList: MapListItem[] = [];
	let loadingMap = false;
	let filterCity: string | null = null;

	// New state for trip mode enhancements
	const tripState = createTripStateStore();
	const timelineState = createTimelineStateStore();
	setTripContext({ preferences: tripState, timeline: timelineState });

	let deviceHeading = 0;
	let showCityDialog = false;
	let pendingCity: string | null = null;
	let pendingLocation: { lat: number; lon: number } | null = null;

	// Welcome dialog state
	let showWelcome = false;

	// Map hint state
	let showMapHint = false;

	// Search state
	let searchOpen = false;

	// View controls state
	let mapOpacity = 0.8;

	// Extract unique cities from map types
	$: cities = Array.from(new Set(mapList.map((m) => m.type).filter(Boolean))).sort();

	// Track visualization style
	function createTrackStyle(feature: FeatureLike): Style {
		return new Style({
			stroke: new Stroke({
				color: '#ea580c',
				width: 4,
				lineCap: 'round',
				lineJoin: 'round'
			})
		});
	}

	// User position marker style
	function createPositionStyle(feature: FeatureLike): Style {
		return new Style({
			image: new CircleStyle({
				radius: 8,
				fill: new Fill({ color: '#ffffff' }),
				stroke: new Stroke({
					color: '#ea580c',
					width: 3
				})
			})
		});
	}


	onMount(() => {
		// Initialize basemap - Google Hybrid (satellite with labels)
		const basemapLayer = new TileLayer({
			source: new XYZ({
				urls: [
					'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
					'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
					'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
					'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
				],
				attributions: 'Tiles © Google',
				maxZoom: 22,
				crossOrigin: 'anonymous'
			}),
			zIndex: 0
		});

		// Initialize warped layer for historical maps
		warpedLayer = new WarpedMapLayer();
		warpedLayer.setZIndex(10);

		// Initialize track layer
		trackSource = new VectorSource();
		trackLayer = new VectorImageLayer({
			source: trackSource,
			zIndex: 20,
			style: createTrackStyle
		});

		// Initialize position marker layer
		positionSource = new VectorSource();
		positionLayer = new VectorImageLayer({
			source: positionSource,
			zIndex: 25,
			style: createPositionStyle
		});

		// Create map
		const lastKnownPos = $tripState.lastKnownPosition;
		map = new Map({
			target: mapContainer,
			layers: [basemapLayer, trackLayer, positionLayer],
			view: new View({
				center: lastKnownPos
					? fromLonLat([lastKnownPos.lon, lastKnownPos.lat])
					: INITIAL_CENTER,
				zoom: 16,
				enableRotation: false
			}),
			controls: defaultControls({ attribution: false, rotate: false, zoom: false }).extend([
				new Zoom(),
				new ScaleLine()
			])
		});

		// Attach warped layer
		const warped = warpedLayer as unknown as { setMap?: (map: unknown) => void };
		warped.setMap?.(map);

		// Async initialization
		(async () => {
			// Load map catalog
			await loadMapCatalog();

			// Show welcome dialog on every load
			showWelcome = true;

			// Fetch map bounds in background
			const mapIds = mapList.map((m) => m.id);
			fetchMultipleBounds(mapIds, 5).then((boundsMap) => {
				// Update mapList with bounds
				mapList = mapList.map((map) => {
					const bounds = boundsMap.get(map.id);
					return bounds ? { ...map, bounds } : map;
				});
			});
		})();

		// Start orientation tracking
		startOrientationTracking((orientation) => {
			console.log('[TripTracker] Orientation update:', orientation);
			deviceHeading = orientation.alpha;
		});

		return () => {
			if (watchId !== null) {
				stopTracking(watchId);
			}
			stopOrientationTracking();
			map?.dispose();
		};
	});

	async function loadMapCatalog() {
		try {
			const response = await fetch(DATASET_URL);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const text = await response.text();

			const lines = text.trim().split(/\r?\n/);
			const header = lines.shift()?.split(',').map((h) => h.trim().toLowerCase()) || [];

			const items: MapListItem[] = [];
			for (const line of lines) {
				if (!line.trim()) continue;

				const cells: string[] = [];
				const matches = line.matchAll(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g);
				for (const match of matches) {
					cells.push(match[1].replace(/^"|"$/g, '').trim());
				}

				const row: Record<string, string> = {};
				header.forEach((key, i) => {
					row[key] = cells[i] || '';
				});

				const idKey = header.find((h) => h === 'id');
				const nameKey = header.find((h) => h === 'name');
				const typeKey = header.find((h) => h === 'type');

				if (!idKey || !nameKey || !row[idKey] || !row[nameKey]) continue;

				const year = parseInt(row['year'], 10);

				const item: MapListItem = {
					id: row[idKey],
					name: row[nameKey],
					type: (typeKey && row[typeKey]) || '',
					summary: row['summary'] || undefined,
					description:
						row['description'] || row['details'] || row['detail'] || undefined,
					thumbnail: row['thumbnail'] || row['image'] || undefined,
					isFeatured: row['featured'] === 'TRUE' || row['is_featured'] === 'TRUE',
					year: isNaN(year) ? undefined : year
				};

				items.push(item);
			}

			mapList = items;
		} catch (err) {
			console.error('Failed to load map catalog:', err);
			mapList = [];
		}
	}

	async function loadMapOverlay(mapId: string) {
		if (!map || !warpedLayer) return;

		loadingMap = true;
		try {
			// Clear existing overlay
			warpedLayer.clear();

			// Load new overlay
			const annotationUrl = `https://annotations.allmaps.org/images/${mapId}`;
			await warpedLayer.addGeoreferenceAnnotationByUrl(annotationUrl);

			// Apply opacity and view mode to warped map layers
			applyWarpedLayerSettings();

			selectedMapId = mapId;
		} catch (err) {
			console.error('Failed to load map overlay:', err);
			error = 'Could not load historical map';
			selectedMapId = null;
		} finally {
			loadingMap = false;
		}
	}

	function applyWarpedLayerSettings() {
		if (!map || !warpedLayer) {
			console.log('[TripTracker] No map or warped layer available');
			return;
		}

		// Try setting opacity directly on WarpedMapLayer
		const warpedLayerObj = warpedLayer as any;
		if (warpedLayerObj.setOpacity) {
			console.log(`[TripTracker] Setting opacity directly on WarpedMapLayer to ${mapOpacity}`);
			warpedLayerObj.setOpacity(mapOpacity);
		}

		// Also iterate through all map layers to find warped image layers
		const allLayers = map.getLayers().getArray();
		console.log(`[TripTracker] Total map layers: ${allLayers.length}`);

		let appliedCount = 0;

		allLayers.forEach((layer: any, index: number) => {
			const zIndex = layer.getZIndex();
			const layerType = layer.constructor.name;

			console.log(`[TripTracker] Layer ${index}: type=${layerType}, zIndex=${zIndex}`);

			// Skip our known layers (basemap=0, track=20, position=25)
			// Warped layers should be anything else, likely between 5-15
			if (zIndex !== 0 && zIndex !== 20 && zIndex !== 25 && zIndex !== undefined) {
				console.log(`[TripTracker] Applying opacity ${mapOpacity} to layer ${index} (${layerType})`);

				// Set opacity
				if (layer.setOpacity) {
					layer.setOpacity(mapOpacity);
				}

				appliedCount++;
			}
		});

		console.log(`[TripTracker] Applied opacity to ${appliedCount} warped layers`);
		map.render();
	}

	function clearMapOverlay() {
		if (warpedLayer) {
			warpedLayer.clear();
		}
		selectedMapId = null;
	}

	async function handlePositionUpdate(position: GeolocationPosition) {
		const { longitude, latitude } = position.coords;
		const coord = fromLonLat([longitude, latitude]);

		// Save last known position
		tripState.setLastKnownPosition({ lat: latitude, lon: longitude });

		// Add to coordinates array
		coordinates = [...coordinates, coord];

		// Update or create LineString feature
		if (!currentTrack) {
			currentTrack = new Feature({
				geometry: new LineString(coordinates)
			});
			currentTrack.setId('current-track');
			trackSource?.addFeature(currentTrack);
		} else {
			const geometry = currentTrack.getGeometry();
			if (geometry) {
				geometry.setCoordinates(coordinates);
			}
		}

		// Update or create position marker
		if (!currentPosition) {
			currentPosition = new Feature({
				geometry: new Point(coord)
			});
			currentPosition.setId('current-position');
			positionSource?.addFeature(currentPosition);
		} else {
			const geometry = currentPosition.getGeometry();
			if (geometry) {
				geometry.setCoordinates(coord);
			}
		}

		// Auto-follow user
		if (autoFollow && map) {
			map.getView().animate({
				center: coord,
				duration: 300
			});
		}
	}

	function handleMapSelect(event: CustomEvent<{ mapId: string | null }>) {
		const mapId = event.detail.mapId;
		if (mapId) {
			loadMapOverlay(mapId);
		} else {
			clearMapOverlay();
		}
	}

	function handleZoomToMap(event: CustomEvent<{ mapId: string; bounds?: number[] }>) {
		const { bounds } = event.detail;

		if (!map || !bounds || bounds.length !== 4) {
			console.warn('[TripTracker] Cannot zoom: missing map or bounds');
			return;
		}

		// bounds is [minLon, minLat, maxLon, maxLat]
		const [minLon, minLat, maxLon, maxLat] = bounds;

		// Convert bounds to map coordinates
		const bottomLeft = fromLonLat([minLon, minLat]);
		const topRight = fromLonLat([maxLon, maxLat]);

		// Create extent from bounds
		const extent = [bottomLeft[0], bottomLeft[1], topRight[0], topRight[1]];

		// Fit the map view to the extent
		map.getView().fit(extent, {
			padding: [50, 50, 50, 50],
			duration: 1000
		});

		console.log('[TripTracker] Zoomed to map bounds:', bounds);
	}

	function handleOpacityChange(event: CustomEvent<{ opacity: number }>) {
		mapOpacity = event.detail.opacity;
		console.log('[TripTracker] Opacity changed to:', mapOpacity);
	}

	function handleStartTracking() {
		if (trackingState !== 'inactive') return;

		// Reset state
		coordinates = [];
		currentTrack = null;
		currentPosition = null;
		trackSource?.clear();
		positionSource?.clear();
		error = null;

		// Start watching position
		watchId = startTracking({
			onPosition: handlePositionUpdate,
			onError: (err) => {
				error = formatError(err);
				trackingState = 'inactive';
				if (watchId !== null) {
					stopTracking(watchId);
					watchId = null;
				}
			}
		});

		if (watchId !== null) {
			trackingState = 'active';
		}
	}

	function handleStopTracking() {
		if (watchId !== null) {
			stopTracking(watchId);
			watchId = null;
		}
		trackingState = 'inactive';
		error = null;
	}

	function handleLocationSearch(event: CustomEvent<{ lat: number; lon: number; name: string; address: any }>) {
		if (!map) return;

		const { lat, lon, name, address } = event.detail;
		console.log('[TripTracker] Searching location:', name, lat, lon, address);

		// Try to extract city from address
		const city = address?.city || address?.town || address?.village || address?.municipality;

		if (city) {
			// Check if we have maps for this city
			const cityMaps = mapList.filter((m) =>
				m.type && m.type.toLowerCase() === city.toLowerCase()
			);

			if (cityMaps.length > 0) {
				// Store pending location and show dialog
				pendingCity = city;
				pendingLocation = { lat, lon };
				showCityDialog = true;
				return;
			}
		}

		// No city filter available, just navigate to location
		navigateToLocation(lat, lon);
	}

	function navigateToLocation(lat: number, lon: number) {
		if (!map) return;

		// Convert to map coordinates
		const coord = fromLonLat([lon, lat]);

		// Animate to the location
		map.getView().animate({
			center: coord,
			zoom: 16,
			duration: 1000
		});
	}

	function handleCityFilterConfirm(event: CustomEvent<{ filter: boolean }>) {
		showCityDialog = false;

		if (event.detail.filter && pendingCity) {
			// Apply city filter
			filterCity = pendingCity;
			console.log('[TripTracker] Filtering maps by city:', pendingCity);
		} else {
			// Clear any existing filter
			filterCity = null;
		}

		// Navigate to the location
		if (pendingLocation) {
			navigateToLocation(pendingLocation.lat, pendingLocation.lon);
		}

		// Clear pending values
		pendingCity = null;
		pendingLocation = null;
	}

	async function handleWelcomeSelect(event: CustomEvent<{ city: string }>) {
		const city = event.detail.city;
		console.log('[TripTracker] Selected starting city:', city);

		// Set city filter
		filterCity = city;

		// Geocode the city and zoom to it
		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?` +
					new URLSearchParams({
						q: city,
						format: 'json',
						limit: '1'
					})
			);

			if (response.ok) {
				const results = await response.json();
				if (results.length > 0) {
					const { lat, lon } = results[0];
					console.log('[TripTracker] Zooming to city:', city, lat, lon);

					// Zoom to city
					if (map) {
						const coord = fromLonLat([parseFloat(lon), parseFloat(lat)]);
						map.getView().animate({
							center: coord,
							zoom: 14,
							duration: 1000
						});
					}
				}
			}
		} catch (err) {
			console.error('[TripTracker] Failed to geocode city:', err);
		}

		// Find maps for this city
		const cityMaps = mapList.filter((m) =>
			m.type && m.type.toLowerCase() === city.toLowerCase()
		);

		if (cityMaps.length > 0) {
			// Find the earliest map (lowest year)
			const earliestMap = cityMaps.reduce((earliest, current) => {
				if (!current.year) return earliest;
				if (!earliest.year) return current;
				return current.year < earliest.year ? current : earliest;
			}, cityMaps[0]);

			if (earliestMap) {
				console.log('[TripTracker] Loading earliest map:', earliestMap.name, earliestMap.year);
				loadMapOverlay(earliestMap.id);
			}
		}

		// Close dialog
		showWelcome = false;

		// Show map hint if not seen before
		if (!$tripState.hasSeenMapHint) {
			setTimeout(() => {
				showMapHint = true;
			}, 800);
		}
	}

	function handleWelcomeSkip() {
		console.log('[TripTracker] Skipped welcome');
		showWelcome = false;

		// Show map hint if not seen before
		if (!$tripState.hasSeenMapHint) {
			setTimeout(() => {
				showMapHint = true;
			}, 800);
		}
	}

	function handleMapHintDismiss() {
		showMapHint = false;
		tripState.setHasSeenMapHint(true);
	}

	// Reactive: Apply opacity changes
	$: if (map && selectedMapId) {
		const _opacity = mapOpacity;
		applyWarpedLayerSettings();
	}
</script>

<div class="trip-container">
	<div bind:this={mapContainer} class="map"></div>

	<LocationButton
		isTracking={trackingState === 'active'}
		{error}
		on:start={handleStartTracking}
		on:stop={handleStopTracking}
	/>

	<LocationSearch isOpen={searchOpen} on:select={handleLocationSearch} />

	<DirectionCone {map} position={currentPosition} heading={deviceHeading} />

	<MapSelector
		maps={mapList}
		selected={selectedMapId}
		loading={loadingMap}
		{filterCity}
		on:select={handleMapSelect}
		on:zoom={handleZoomToMap}
	/>

	<CityFilterDialog
		cityName={pendingCity || ''}
		isOpen={showCityDialog}
		on:confirm={handleCityFilterConfirm}
	/>

	<WelcomeDialog
		isOpen={showWelcome}
		{cities}
		on:select={handleWelcomeSelect}
		on:skip={handleWelcomeSkip}
	/>

	<MapCollectionHint
		isVisible={showMapHint}
		on:dismiss={handleMapHintDismiss}
	/>

	{#if selectedMapId}
		<ViewControls
			opacity={mapOpacity}
			on:opacityChange={handleOpacityChange}
		/>
	{/if}

	<MobileControls
		isTracking={trackingState === 'active'}
		{error}
		opacity={mapOpacity}
		hasMapSelected={!!selectedMapId}
		searchOpen={searchOpen}
		on:startTracking={handleStartTracking}
		on:stopTracking={handleStopTracking}
		on:opacityChange={handleOpacityChange}
		on:toggleSearch={() => searchOpen = !searchOpen}
		on:locationSelect={handleLocationSearch}
	/>
</div>

<style>
	.trip-container {
		position: relative;
		width: 100%;
		height: 100vh;
		overflow: hidden;
	}

	.map {
		width: 100%;
		height: 100%;
	}
</style>
