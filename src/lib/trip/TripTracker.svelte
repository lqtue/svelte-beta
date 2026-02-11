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
	import { Zoom, ScaleLine, Rotate } from 'ol/control';
	import { defaults as defaultControls } from 'ol/control/defaults';
	import { defaults as defaultInteractions } from 'ol/interaction/defaults';
	import DragRotate from 'ol/interaction/DragRotate';
	import { platformModifierKeyOnly } from 'ol/events/condition';
	import { fromLonLat, toLonLat } from 'ol/proj';
	import type { FeatureLike } from 'ol/Feature';
	import type { Coordinate } from 'ol/coordinate';
	import type Layer from 'ol/layer/Layer';
	import LayerGroup from 'ol/layer/Group';
	import { WarpedMapLayer } from '@allmaps/openlayers';
	import 'ol/ol.css';

	import { INITIAL_CENTER } from '$lib/viewer/constants';
	import type { MapListItem, ViewMode } from '$lib/viewer/types';
	import { createMapStore } from '$lib/stores/mapStore';
	import { createLayerStore } from '$lib/stores/layerStore';
	import { initUrlSync } from '$lib/stores/urlStore';
	import { getSupabaseContext } from '$lib/supabase/context';
	import { fetchMaps } from '$lib/supabase/maps';
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
	import { registerServiceWorker } from './serviceWorker';
	import {
		cacheMapCatalog,
		getCachedMapCatalog,
		cacheAnnotation,
		getCachedAnnotation
	} from './mapCache';

	// Props
	export let initialMapId: string | null = null;
	export let initialCity: string | null = null;

	const { supabase } = getSupabaseContext();

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

	// Central stores — shared with Studio
	const mapStore = createMapStore();
	const layerStore = createLayerStore();
	let urlTeardown: (() => void) | null = null;
	let suppressViewSync = false;

	// Reactive aliases (read from stores)
	$: selectedMapId = $mapStore.activeMapId;
	$: mapOpacityStore = $layerStore.overlayOpacity;
	$: viewModeStore = $layerStore.viewMode;
	$: sideRatioStore = $layerStore.sideRatio;
	$: lensRadiusStore = $layerStore.lensRadius;

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
	let loadingCity: string | null = null;

	// Map hint state
	let showMapHint = false;

	// Search state
	let searchOpen = false;

	// View controls state — local copies synced from stores
	// (local vars needed because view mode decorations read them synchronously)
	let mapOpacity = 0.8;
	let viewMode: ViewMode = 'overlay';
	let sideRatio = 0.5;
	let lensRadius = 150;

	// Keep local copies in sync with stores
	$: mapOpacity = mapOpacityStore;
	$: viewMode = viewModeStore;
	$: sideRatio = sideRatioStore;
	$: lensRadius = lensRadiusStore;

	// DOM elements for view mode decorations
	let dividerXEl: HTMLDivElement;
	let dividerYEl: HTMLDivElement;
	let dividerHandleXEl: HTMLDivElement;
	let dividerHandleYEl: HTMLDivElement;
	let lensEl: HTMLDivElement;
	let lensHandleEl: HTMLDivElement;

	// Drag state for dividers/lens
	let dragging = { sideX: false, sideY: false, lensR: false };

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
				enableRotation: true
			}),
			interactions: defaultInteractions().extend([
				new DragRotate({
					condition: platformModifierKeyOnly
				})
			]),
			controls: defaultControls({ attribution: false, rotate: false, zoom: false }).extend([
				new Zoom(),
				new Rotate(),
				new ScaleLine()
			])
		});

		// Attach warped layer
		const warped = warpedLayer as unknown as { setMap?: (map: unknown) => void };
		warped.setMap?.(map);

		// Listen for map resize to update view mode decorations
		map.on('change:size', () => {
			refreshDecorations();
		});

		// Async initialization
		(async () => {
			// Register service worker for caching map tiles
			registerServiceWorker().then((registration) => {
				if (registration) {
					console.log('[TripTracker] Service worker registered for map caching');
				}
			});

			// Load map catalog
			await loadMapCatalog();

			// If initial city provided, set the filter and zoom to it
			if (initialCity) {
				filterCity = initialCity;
				geocodeAndZoomToCity(initialCity);
			}

			// If initial map ID provided, load it directly (skip welcome)
			if (initialMapId) {
				loadMapOverlay(initialMapId);
			} else if (initialCity) {
				// City filter set and zoomed, skip welcome dialog
			} else {
				// Show welcome dialog on every load
				showWelcome = true;
			}

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

		// OL View → mapStore on moveend
		map.on('moveend', () => {
			if (suppressViewSync || !map) return;
			const view = map.getView();
			const center = view.getCenter();
			if (!center) return;
			const [lng, lat] = toLonLat(center);
			suppressViewSync = true;
			mapStore.setView({ lng, lat, zoom: view.getZoom() ?? 16, rotation: view.getRotation() });
			requestAnimationFrame(() => { suppressViewSync = false; });
		});

		// URL ↔ store sync
		urlTeardown = initUrlSync({ mapStore, layerStore });

		// Start orientation tracking
		startOrientationTracking((orientation) => {
			console.log('[TripTracker] Orientation update:', orientation);
			deviceHeading = orientation.alpha;
		});

		return () => {
			urlTeardown?.();
			if (watchId !== null) {
				stopTracking(watchId);
			}
			stopOrientationTracking();
			map?.dispose();
		};
	});

	async function loadMapCatalog() {
		try {
			// Try to load from cache first
			const cached = await getCachedMapCatalog();
			if (cached) {
				mapList = cached;
				console.log('[TripTracker] Loaded map catalog from cache');
				return;
			}

			const items = await fetchMaps(supabase);
			mapList = items;

			// Cache the catalog for future use
			await cacheMapCatalog(items);
			console.log('[TripTracker] Cached map catalog');
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

			mapStore.setActiveMap(mapId);
		} catch (err) {
			console.error('Failed to load map overlay:', err);
			error = 'Could not load historical map';
			mapStore.setActiveMap(null);
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
		mapStore.setActiveMap(null);
	}

	// View mode functions
	function getWarpedCanvas(): HTMLCanvasElement | null {
		return warpedLayer?.getCanvas() ?? null;
	}

	function updateClipMask() {
		const canvas = getWarpedCanvas();
		if (!canvas || !map) return;
		const size = map.getSize();
		if (!size) return;
		const [w, h] = size;
		if (viewMode === 'overlay') {
			canvas.style.clipPath = '';
		} else if (viewMode === 'side-x') {
			const x = w * sideRatio;
			canvas.style.clipPath = `polygon(${x}px 0, ${w}px 0, ${w}px ${h}px, ${x}px ${h}px)`;
		} else if (viewMode === 'side-y') {
			const y = h * sideRatio;
			canvas.style.clipPath = `polygon(0 ${y}px, ${w}px ${y}px, ${w}px ${h}px, 0 ${h}px)`;
		} else if (viewMode === 'spy') {
			const r = lensRadius;
			canvas.style.clipPath = `circle(${r}px at ${w / 2}px ${h / 2}px)`;
		}
	}

	function updateDividersAndHandles() {
		if (!map) return;
		const size = map.getSize();
		if (!size) return;
		const [w, h] = size;
		const showX = viewMode === 'side-x';
		const showY = viewMode === 'side-y';
		if (dividerXEl) {
			dividerXEl.style.display = showX ? 'block' : 'none';
			if (showX) {
				const x = w * sideRatio;
				dividerXEl.style.left = `${x}px`;
				dividerXEl.style.height = `${h}px`;
			}
		}
		if (dividerHandleXEl) {
			dividerHandleXEl.style.display = showX ? 'block' : 'none';
			if (showX) {
				const x = w * sideRatio - 8;
				dividerHandleXEl.style.left = `${x}px`;
				dividerHandleXEl.style.top = `${h / 2 - 8}px`;
			}
		}
		if (dividerYEl) {
			dividerYEl.style.display = showY ? 'block' : 'none';
			if (showY) {
				const y = h * sideRatio;
				dividerYEl.style.top = `${y}px`;
				dividerYEl.style.width = `${w}px`;
			}
		}
		if (dividerHandleYEl) {
			dividerHandleYEl.style.display = showY ? 'block' : 'none';
			if (showY) {
				const y = h * sideRatio - 8;
				dividerHandleYEl.style.left = `${w / 2 - 8}px`;
				dividerHandleYEl.style.top = `${y}px`;
			}
		}
	}

	function updateLens() {
		if (!map) return;
		const size = map.getSize();
		if (!size) return;
		const [w, h] = size;
		const show = viewMode === 'spy';
		if (lensEl) {
			lensEl.style.display = show ? 'block' : 'none';
			if (show) {
				const diameter = Math.max(20, lensRadius * 2);
				lensEl.style.width = `${diameter}px`;
				lensEl.style.height = `${diameter}px`;
				lensEl.style.left = `${w / 2 - lensRadius}px`;
				lensEl.style.top = `${h / 2 - lensRadius}px`;
			}
		}
		if (lensHandleEl) {
			lensHandleEl.style.display = show ? 'block' : 'none';
			if (show) {
				lensHandleEl.style.left = `${w / 2 + lensRadius - 8}px`;
				lensHandleEl.style.top = `${h / 2 - 8}px`;
			}
		}
	}

	function refreshDecorations() {
		updateClipMask();
		updateDividersAndHandles();
		updateLens();
	}

	function setViewMode(next: ViewMode) {
		layerStore.setViewMode(next);
		refreshDecorations();
	}

	function handleViewModeChange(event: CustomEvent<{ viewMode: ViewMode }>) {
		setViewMode(event.detail.viewMode);
	}

	function handlePointerDrag(event: PointerEvent) {
		if (!map) return;
		if (!dragging.sideX && !dragging.sideY && !dragging.lensR) return;
		const rect = mapContainer.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const size = map.getSize();
		if (!size) return;
		const [w, h] = size;
		if (dragging.sideX) {
			layerStore.setSideRatio(Math.max(0.1, Math.min(0.9, x / w)));
			refreshDecorations();
		} else if (dragging.sideY) {
			layerStore.setSideRatio(Math.max(0.1, Math.min(0.9, y / h)));
			refreshDecorations();
		} else if (dragging.lensR) {
			const cx = w / 2;
			const cy = h / 2;
			const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
			layerStore.setLensRadius(Math.max(50, Math.min(Math.min(w, h) / 2 - 20, dist)));
			refreshDecorations();
		}
	}

	function handlePointerUp() {
		dragging = { sideX: false, sideY: false, lensR: false };
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
		layerStore.setOverlayOpacity(event.detail.opacity);
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

	async function geocodeAndZoomToCity(city: string): Promise<void> {
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

		// Set loading state
		loadingCity = city;

		// Set city filter
		filterCity = city;

		// Geocode the city and zoom to it
		await geocodeAndZoomToCity(city);

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
				await loadMapOverlay(earliestMap.id);
			}
		}

		// Close dialog and clear loading state
		showWelcome = false;
		loadingCity = null;

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

	// Reactive: Apply view mode changes
	$: if (map && selectedMapId) {
		const _viewMode = viewMode;
		const _sideRatio = sideRatio;
		const _lensRadius = lensRadius;
		refreshDecorations();
	}
</script>

<svelte:window on:pointermove={handlePointerDrag} on:pointerup={handlePointerUp} />

<div class="trip-container">
	<div bind:this={mapContainer} class="map"></div>

	<!-- View mode dividers and handles -->
	<div bind:this={dividerXEl} class="divider divider-x"></div>
	<div
		bind:this={dividerHandleXEl}
		class="divider-handle divider-handle-x"
		on:pointerdown={() => { dragging.sideX = true; }}
		role="slider"
		aria-label="Adjust horizontal split"
		aria-valuenow={Math.round(sideRatio * 100)}
		tabindex="0"
	></div>
	<div bind:this={dividerYEl} class="divider divider-y"></div>
	<div
		bind:this={dividerHandleYEl}
		class="divider-handle divider-handle-y"
		on:pointerdown={() => { dragging.sideY = true; }}
		role="slider"
		aria-label="Adjust vertical split"
		aria-valuenow={Math.round(sideRatio * 100)}
		tabindex="0"
	></div>
	<div bind:this={lensEl} class="lens"></div>
	<div
		bind:this={lensHandleEl}
		class="lens-handle"
		on:pointerdown={() => { dragging.lensR = true; }}
		role="slider"
		aria-label="Adjust lens size"
		aria-valuenow={lensRadius}
		tabindex="0"
	></div>

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
		{loadingCity}
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
			{viewMode}
			on:opacityChange={handleOpacityChange}
			on:viewModeChange={handleViewModeChange}
		/>
	{/if}

	<MobileControls
		isTracking={trackingState === 'active'}
		{error}
		opacity={mapOpacity}
		{viewMode}
		hasMapSelected={!!selectedMapId}
		searchOpen={searchOpen}
		on:startTracking={handleStartTracking}
		on:stopTracking={handleStopTracking}
		on:opacityChange={handleOpacityChange}
		on:viewModeChange={handleViewModeChange}
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

	/* View mode dividers */
	.divider {
		position: absolute;
		background: #d4af37;
		pointer-events: none;
		z-index: 50;
		display: none;
	}

	.divider-x {
		width: 3px;
		top: 0;
		box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
	}

	.divider-y {
		height: 3px;
		left: 0;
		box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
	}

	.divider-handle {
		position: absolute;
		width: 16px;
		height: 16px;
		background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
		border: 2px solid #f4e8d8;
		border-radius: 50%;
		cursor: ew-resize;
		z-index: 51;
		display: none;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		transition: transform 0.15s ease;
	}

	.divider-handle:hover {
		transform: scale(1.2);
	}

	.divider-handle-y {
		cursor: ns-resize;
	}

	/* Spyglass lens */
	.lens {
		position: absolute;
		border: 3px solid #d4af37;
		border-radius: 50%;
		pointer-events: none;
		z-index: 50;
		display: none;
		box-shadow:
			0 0 0 2px rgba(244, 232, 216, 0.5),
			0 4px 16px rgba(0, 0, 0, 0.3),
			inset 0 0 20px rgba(212, 175, 55, 0.1);
	}

	.lens-handle {
		position: absolute;
		width: 16px;
		height: 16px;
		background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
		border: 2px solid #f4e8d8;
		border-radius: 50%;
		cursor: nwse-resize;
		z-index: 51;
		display: none;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		transition: transform 0.15s ease;
	}

	.lens-handle:hover {
		transform: scale(1.2);
	}
</style>
