// Language state management with localStorage persistence

import { derived } from 'svelte/store';
import { createPersistedStore } from '$lib/core/persistence';

export type Language = 'en' | 'vi';

const STORAGE_KEY = 'vma-trip-language-v1';

function createLanguageStore() {
	const store = createPersistedStore({
		key: STORAGE_KEY,
		defaultValue: 'en' as Language
	});

	return {
		subscribe: store.subscribe,
		setLanguage: (lang: Language) => {
			store.set(lang);
		},
		toggleLanguage: () => {
			store.update((current) => (current === 'en' ? 'vi' : 'en'));
		}
	};
}

export const currentLanguage = createLanguageStore();
