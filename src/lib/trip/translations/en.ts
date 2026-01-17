export const en = {
	// Welcome Dialog
	welcome: {
		title: 'Welcome to Historical Maps',
		message: 'Choose your starting city to explore historical maps from different eras.',
		skipButton: 'Skip for Now',
		cityIcon: '📍'
	},

	// Map Selector
	mapSelector: {
		consultingAtlas: 'Consulting Atlas...',
		mapCollection: 'Map Collection',
		allRegions: 'All Regions',
		searchPlaceholder: 'Search by year or name',
		zoomButton: '🔍 Zoom to Map',
		anno: 'Anno',
		noMapsFound: '⊘ No maps discovered in this region',
		buttonOrnament: '⧉'
	},

	// Location Button
	location: {
		tracking: 'Tracking',
		myLocation: 'My Location'
	},

	// Map Collection Hint
	mapHint: {
		icon: '👆',
		title: 'Explore Historical Maps',
		description: 'Click here to browse our collection of vintage maps',
		button: 'Got it!'
	},

	// City Filter Dialog
	cityFilter: {
		icon: '🗺️',
		title: 'Filter Map Collection?',
		message: 'Would you like to filter the map collection to show only maps from',
		noShowAll: 'No, Show All',
		yesFilter: 'Yes, Filter'
	},

	// City Names
	cities: {
		hanoi: 'Hanoi',
		hue: 'Hue',
		hochiminh: 'Ho Chi Minh City',
		danang: 'Da Nang',
		haiphong: 'Hai Phong',
		cantho: 'Can Tho',
		nhatrang: 'Nha Trang',
		dalat: 'Da Lat',
		vungtau: 'Vung Tau',
		quinhon: 'Quy Nhon'
	},

	// Search
	search: {
		search: 'Search',
		searchLocation: 'Search location',
		searchPlaceholder: 'Enter location...',
		searching: 'Searching...'
	},

	// View Controls
	viewControls: {
		overlayOpacity: 'Overlay Opacity',
		opacity: 'Opacity',
		viewMode: 'View Mode',
		overlay: 'Overlay',
		sideX: 'Side X',
		sideY: 'Side Y',
		spyglass: 'Spyglass'
	},

	// Loading messages
	loading: {
		preparingMap: 'Preparing your map...',
		loadingCity: 'Loading',
		findingMaps: 'Finding historical maps...',
		almostReady: 'Almost ready!'
	},

	// Common
	common: {
		loading: 'Loading...',
		error: 'Error',
		close: 'Close',
		cancel: 'Cancel',
		confirm: 'Confirm',
		save: 'Save'
	}
};

export type TranslationKeys = typeof en;
