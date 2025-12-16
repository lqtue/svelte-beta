import { derived } from 'svelte/store';
import { currentLanguage } from '../stores/languageState';
import { en } from './en';
import { vi } from './vi';

export const translations = {
	en,
	vi
};

// Derived store that returns current translations
export const t = derived(currentLanguage, ($lang) => translations[$lang]);

export { en, vi };
export type { TranslationKeys } from './en';
