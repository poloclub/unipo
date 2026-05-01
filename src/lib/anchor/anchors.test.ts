// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
	registerAnchor,
	getAnchor,
	anchorCount,
	_clearAnchorsForTest
} from './anchors.svelte';

describe('registerAnchor', () => {
	beforeEach(() => {
		_clearAnchorsForTest();
	});

	it('registers and looks up by id', () => {
		const el = document.createElement('div');
		registerAnchor(el, 'a1');
		expect(getAnchor('a1')).toBe(el);
		expect(anchorCount()).toBe(1);
	});

	it('removes on destroy()', () => {
		const el = document.createElement('div');
		const action = registerAnchor(el, 'a2');
		expect(anchorCount()).toBe(1);
		action.destroy();
		expect(getAnchor('a2')).toBeNull();
		expect(anchorCount()).toBe(0);
	});

	it('update() changes id', () => {
		const el = document.createElement('div');
		const action = registerAnchor(el, 'old');
		action.update('new');
		expect(getAnchor('old')).toBeNull();
		expect(getAnchor('new')).toBe(el);
	});

	it('update() with same id is a no-op', () => {
		const el = document.createElement('div');
		const action = registerAnchor(el, 'same');
		action.update('same');
		expect(getAnchor('same')).toBe(el);
		expect(anchorCount()).toBe(1);
	});

	it('registering a different element with the same id overwrites (edge case)', () => {
		const a = document.createElement('div');
		const b = document.createElement('span');
		registerAnchor(a, 'shared');
		registerAnchor(b, 'shared');
		expect(getAnchor('shared')).toBe(b);
		expect(anchorCount()).toBe(1);
	});

	it("destroying another element's action does not touch the registry", () => {
		const a = document.createElement('div');
		const b = document.createElement('span');
		const actionA = registerAnchor(a, 'target');
		registerAnchor(b, 'target'); // b overwrites
		actionA.destroy(); // a's destroy — already replaced by b, so no-op
		expect(getAnchor('target')).toBe(b);
	});

	it('empty id is a no-op', () => {
		const el = document.createElement('div');
		const action = registerAnchor(el, '');
		expect(anchorCount()).toBe(0);
		action.destroy();
		expect(anchorCount()).toBe(0);
	});

	it('starting with empty id then updating to a valid id registers it', () => {
		const el = document.createElement('div');
		const action = registerAnchor(el, '');
		expect(anchorCount()).toBe(0);
		action.update('later');
		expect(getAnchor('later')).toBe(el);
		action.destroy();
		expect(getAnchor('later')).toBeNull();
	});
});
