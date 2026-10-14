import { describe, expect, it } from 'vitest';
import { localizeServerError } from '$lib/serverErrors';

describe('localizeServerError', () => {
	it('translates known German server errors for the English UI', () => {
		expect(localizeServerError('Der letzte Admin kann nicht gelöscht werden', 'en')).toBe('The last admin cannot be deleted');
		expect(localizeServerError('Benutzername bereits vergeben', 'en')).toBe('Username already taken');
	});

	it('leaves German UI, unknown messages and empty values alone', () => {
		expect(localizeServerError('Nicht gefunden', 'de')).toBe('Nicht gefunden');
		expect(localizeServerError('duplicate', 'en')).toBe('duplicate');
		expect(localizeServerError(undefined, 'en')).toBeUndefined();
		expect(localizeServerError('', 'en')).toBeUndefined();
	});
});
