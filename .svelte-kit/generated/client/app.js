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
	() => import('./nodes/19')
];

export const server_loads = [0];

export const dictionary = {
		"/(editorial)": [10,[3]],
		"/(editorial)/about": [11,[3]],
		"/(app)/annotate": [4,[2]],
		"/(editorial)/blog": [12,[3]],
		"/(editorial)/blog/[slug]": [13,[3]],
		"/(editorial)/catalog": [14,[3]],
		"/(editorial)/contribute": [15,[3]],
		"/(editorial)/contribute/georef": [16,[3]],
		"/(app)/contribute/label": [5,[2]],
		"/contribute/review": [19],
		"/(app)/contribute/trace": [6,[2]],
		"/(app)/create": [7,[2]],
		"/(app)/image": [8,[2]],
		"/(editorial)/login": [17,[3]],
		"/(editorial)/profile": [~18,[3]],
		"/(app)/view": [9,[2]]
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