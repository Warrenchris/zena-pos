// Ambient module declarations for packages without type definitions in this project.
// These keep the TS build from failing while we add proper types incrementally.
declare module 'react-chartjs-2' {
	import { ComponentType } from 'react';
	export const Line: ComponentType<any>;
	export const Bar: ComponentType<any>;
	export const Doughnut: ComponentType<any>;
	const _default: { Line: ComponentType<any>; Bar: ComponentType<any>; Doughnut: ComponentType<any> };
	export default _default;
}
declare module '@heroicons/react/outline';
declare module '@heroicons/react/24/outline';
declare module '@heroicons/react/*';
declare module 'chart.js/auto';

// Allow importing SVG or other assets without type errors (if used)
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';

export {};
