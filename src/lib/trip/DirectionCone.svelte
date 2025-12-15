<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type Map from 'ol/Map';
	import type Feature from 'ol/Feature';
	import type { Coordinate } from 'ol/coordinate';
	import VectorSource from 'ol/source/Vector';
	import VectorImageLayer from 'ol/layer/VectorImage';
	import Polygon from 'ol/geom/Polygon';
	import FeatureClass from 'ol/Feature';
	import Style from 'ol/style/Style';
	import Fill from 'ol/style/Fill';
	import Stroke from 'ol/style/Stroke';

	export let map: Map | null;
	export let position: Feature<import('ol/geom/Point').default> | null;
	export let heading: number = 0; // Compass heading in degrees (0-360)
	export let fieldOfView: number = 60; // Cone width in degrees
	export let radius: number = 200; // Cone length in meters (increased for visibility)

	let directionLayer: VectorImageLayer<VectorSource> | null = null;
	let directionSource: VectorSource | null = null;
	let coneFeature: Feature<Polygon> | null = null;

	function createConeGeometry(
		center: Coordinate,
		headingDeg: number,
		radiusMeters: number,
		fovDeg: number
	): Polygon {
		// EPSG:3857 uses meters as units, so we can use radiusMeters directly
		const radiusMapUnits = radiusMeters;

		// Convert heading to radians (0 = North, clockwise)
		// Note: Standard math has 0 = East, counter-clockwise
		// So we need to convert: mathAngle = 90 - heading
		const headingRad = ((90 - headingDeg) * Math.PI) / 180;
		const halfFovRad = ((fovDeg / 2) * Math.PI) / 180;

		// Create cone coordinates
		const coords: Coordinate[] = [center];

		// Start and end angles
		const startAngle = headingRad - halfFovRad;
		const endAngle = headingRad + halfFovRad;

		// Generate points along the arc
		const steps = 20;
		for (let i = 0; i <= steps; i++) {
			const angle = startAngle + (i / steps) * (endAngle - startAngle);
			const x = center[0] + radiusMapUnits * Math.cos(angle);
			const y = center[1] + radiusMapUnits * Math.sin(angle);
			coords.push([x, y]);
		}

		// Close the polygon
		coords.push(center);

		return new Polygon([coords]);
	}

	function updateCone() {
		if (!position || !map) {
			console.log('[DirectionCone] Cannot update: position or map missing', { position: !!position, map: !!map });
			return;
		}

		const positionGeom = position.getGeometry();
		if (!positionGeom) {
			console.log('[DirectionCone] Cannot update: position geometry missing');
			return;
		}

		const center = positionGeom.getCoordinates();
		console.log('[DirectionCone] Updating cone:', {
			center,
			heading,
			radius,
			fieldOfView,
			hasFeature: !!coneFeature,
			hasSource: !!directionSource
		});

		if (!coneFeature) {
			// Create feature if it doesn't exist
			const geometry = createConeGeometry(center, heading, radius, fieldOfView);
			coneFeature = new FeatureClass({
				geometry
			});
			coneFeature.setId('direction-cone');
			directionSource?.addFeature(coneFeature);
			console.log('[DirectionCone] Created new cone feature');
		} else {
			// Update existing feature
			const geometry = createConeGeometry(center, heading, radius, fieldOfView);
			coneFeature.setGeometry(geometry);
			console.log('[DirectionCone] Updated cone geometry');
		}
	}

	function createDirectionStyle(): Style {
		return new Style({
			fill: new Fill({
				color: 'rgba(37, 99, 235, 0.3)' // #2563eb with increased opacity
			}),
			stroke: new Stroke({
				color: 'rgba(37, 99, 235, 0.8)',
				width: 3
			})
		});
	}

	onMount(() => {
		console.log('[DirectionCone] onMount called', { hasMap: !!map });
		if (!map) {
			return;
		}

		// Initialize direction layer
		directionSource = new VectorSource();
		directionLayer = new VectorImageLayer({
			source: directionSource,
			zIndex: 24, // Between position marker (25) and track (20)
			style: createDirectionStyle()
		});

		map.addLayer(directionLayer);
		console.log('[DirectionCone] Layer added to map', { zIndex: 24 });

		// Initial update
		updateCone();
	});

	onDestroy(() => {
		if (map && directionLayer) {
			map.removeLayer(directionLayer);
		}
	});

	// Reactive updates when position or heading changes
	$: if (map && position && heading !== undefined) {
		console.log('[DirectionCone] Reactive update triggered', {
			hasMap: !!map,
			hasPosition: !!position,
			heading,
			hasDirectionSource: !!directionSource
		});
		updateCone();
	}
</script>

<!-- This component has no template - it only manages the OpenLayers layer -->
