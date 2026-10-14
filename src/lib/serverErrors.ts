// The API still answers some admin and validation errors in German. This maps the known ones to English for the UI so a
// red error message follows the interface language. Unknown messages and German UI pass through unchanged.
const EN: Record<string, string> = {
	'Nicht gefunden': 'Not found',
	'Fehlende Felder': 'Missing fields',
	'Name erforderlich': 'Name required',
	'Einheit erforderlich': 'Unit required',
	'Benutzername erforderlich': 'Username required',
	'Benutzername bereits vergeben': 'Username already taken',
	'Ungültige Rolle': 'Invalid role',
	'Ungültige URL': 'Invalid URL',
	'URL nicht erlaubt': 'URL not allowed',
	'Ungültige Einstellungen': 'Invalid settings',
	'Ungültige Einstellungsrevision': 'Invalid settings revision',
	'Du kannst dich nicht selbst löschen': 'You cannot delete yourself',
	'Du kannst deine eigene Rolle nicht ändern': 'You cannot change your own role',
	'Der ursprüngliche Admin-Account kann nicht gelöscht werden': 'The original admin account cannot be deleted',
	'Der letzte Admin kann nicht gelöscht werden': 'The last admin cannot be deleted',
	'Der letzte Admin kann nicht degradiert werden': 'The last admin cannot be demoted',
	'Bootstrap-Admin kann nicht degradiert werden': 'The bootstrap admin cannot be demoted',
	'Aktuelles Passwort falsch': 'Current password is wrong',
	'Neues Passwort darf nicht mit dem aktuellen übereinstimmen': 'The new password must differ from the current one',
	'Passwort zu kurz (min. 8 Zeichen)': 'Password too short (min. 8 characters)',
	'Passwort benötigt mind. einen Großbuchstaben': 'Password needs at least one uppercase letter',
	'Passwort benötigt mind. eine Zahl': 'Password needs at least one number',
	'defaultMl muss positive Ganzzahl sein': 'defaultMl must be a positive integer',
	'caffeineMg muss nicht-negative Ganzzahl sein': 'caffeineMg must be a non-negative integer'
};

export function localizeServerError(message: string | null | undefined, lang: string): string | undefined {
	if (!message) return undefined;
	return lang === 'en' ? (EN[message] ?? message) : message;
}
