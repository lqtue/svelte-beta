import { writable, derived } from 'svelte/store';

export type Language = 'en' | 'vi';

const STORAGE_KEY = 'vma-trip-language-v1';

function createLanguageStore() {
	// Load from localStorage or default to English
	const initialLanguage = (() => {
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === 'vi' || stored === 'en') {
				return stored as Language;
			}
		}
		return 'en' as Language;
	})();

	const { subscribe, set } = writable<Language>(initialLanguage);

	return {
		subscribe,
		setLanguage: (lang: Language) => {
			if (typeof window !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, lang);
			}
			set(lang);
		},
		toggleLanguage: () => {
			if (typeof window !== 'undefined') {
				const current = localStorage.getItem(STORAGE_KEY) || 'en';
				const newLang = current === 'en' ? 'vi' : 'en';
				localStorage.setItem(STORAGE_KEY, newLang);
				set(newLang);
			}
		}
	};
}

export const currentLanguage = createLanguageStore();
