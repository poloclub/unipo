import { describe, it, expect } from 'vitest';
import {
	dapoStepToResponses,
	type DapoStepFile,
} from './adapters';

describe('dapoStepToResponses', () => {
	it('maps basic fields', () => {
		const file: DapoStepFile = {
			step: 0,
			prompts: [
				{
					prompt: 'Solve 2+2',
					responses: [
						{
							id: 'step0_sample0',
							reward: 0.5,
							advantage: 1.2,
							response_text: 'T',
							response_length: 3,
							tokens: {
								ids: [1, 2, 3],
								strings: ['a', 'b', 'c'],
								log_probs: [-0.1, -0.2, -0.3],
								ref_log_probs: [-0.2, -0.3, -0.4],
								advantages: [1.2, 1.2, 1.2],
								returns: [0, 0, 0],
								token_kl: [0.1, 0.1, 0.1],
							},
						},
					],
				},
			],
		};
		const responses = dapoStepToResponses(file);
		expect(responses).toHaveLength(1);
		expect(responses[0].id).toBe('step0_sample0');
		expect(responses[0].reward).toBe(0.5);
		expect(responses[0].advantage).toBe(1.2);
		expect(responses[0].tokens?.ids).toEqual([1, 2, 3]);
		expect(responses[0].tokens?.strings).toEqual(['a', 'b', 'c']);
	});

	it('advantage null -> undefined', () => {
		const file: DapoStepFile = {
			step: 0,
			prompts: [
				{
					prompt: '',
					responses: [
						{
							id: 'x',
							reward: 0,
							advantage: null,
							response_text: '',
							response_length: 0,
							tokens: {
								ids: [],
								strings: [],
								log_probs: [],
								ref_log_probs: [],
								advantages: [],
								returns: [],
								token_kl: [],
							},
						},
					],
				},
			],
		};
		const responses = dapoStepToResponses(file);
		expect(responses[0].advantage).toBeUndefined();
	});

	it('reward null -> 0', () => {
		const file: DapoStepFile = {
			step: 0,
			prompts: [
				{
					prompt: '',
					responses: [
						{
							id: 'x',
							reward: null,
							advantage: 0,
							response_text: '',
							response_length: 0,
							tokens: {
								ids: [],
								strings: [],
								log_probs: [],
								ref_log_probs: [],
								advantages: [],
								returns: [],
								token_kl: [],
							},
						},
					],
				},
			],
		};
		const responses = dapoStepToResponses(file);
		expect(responses[0].reward).toBe(0);
	});
});
