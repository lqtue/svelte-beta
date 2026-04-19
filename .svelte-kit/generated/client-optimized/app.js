export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20')
];

export const server_loads = [0];

export const dictionary = {
		"/(editorial)": [11,[3]],
		"/(editorial)/about": [12,[3]],
		"/(app)/annotate": [4,[2]],
		"/(editorial)/blog": [13,[3]],
		"/(editorial)/blog/[slug]": [14,[3]],
		"/(editorial)/catalog": [15,[3]],
		"/(editorial)/contribute": [16,[3]],
		"/(app)/contribute/digitalize": [5,[2]],
		"/(editorial)/contribute/georef": [17,[3]],
		"/(app)/contribute/label": [6,[2]],
		"/contribute/review": [20],
		"/(app)/contribute/trace": [7,[2]],
		"/(app)/create": [8,[2]],
		"/(app)/image": [9,[2]],
		"/(editorial)/login": [18,[3]],
		"/(editorial)/profile": [~19,[3]],
		"/(app)/view": [10,[2]]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';