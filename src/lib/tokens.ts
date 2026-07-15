export const CONFIRM_TOKEN_TTL_SECONDS = 48 * 60 * 60;

const TOKEN_VERSION = 2;
const TOKEN_AAD = new TextEncoder().encode('portfolio-blog:subscription-token:v2');
const IV_BYTES = 12;

export type OneClickAction = 'en' | 'uk' | 'all';

export type TokenCapability =
	| { purpose: 'confirm' }
	| { purpose: 'manage' }
	| { purpose: 'oneclick'; action: OneClickAction };

const EXPIRY_MS: Record<TokenCapability['purpose'], number> = {
	confirm: CONFIRM_TOKEN_TTL_SECONDS * 1000,
	manage: 10 * 365 * 24 * 60 * 60 * 1000, // ~10 years
	oneclick: 90 * 24 * 60 * 60 * 1000,
};

interface TokenClaims {
	v: typeof TOKEN_VERSION;
	purpose: TokenCapability['purpose'];
	email: string;
	expiresAt: number;
	action?: OneClickAction;
}

function b64urlEncode(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
	const padded = input.replaceAll('-', '+').replaceAll('_', '/');
	const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
	const s = atob(padded + pad);
	const bytes = new Uint8Array(new ArrayBuffer(s.length));
	for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
	return bytes;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return new Uint8Array(sig);
}

async function tokenEncryptionKey(secret: string): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`portfolio-blog:subscription-token-key:v2:${secret}`),
	);
	return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt',
	]);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

function isOneClickAction(value: unknown): value is OneClickAction {
	return value === 'en' || value === 'uk' || value === 'all';
}

function capabilityMatches(claims: TokenClaims, expected: TokenCapability): boolean {
	if (claims.purpose !== expected.purpose) return false;
	if (expected.purpose === 'oneclick') return claims.action === expected.action;
	return claims.action === undefined;
}

function parseClaims(value: unknown): TokenClaims | null {
	if (!value || typeof value !== 'object') return null;
	const claims = value as Record<string, unknown>;
	if (
		claims.v !== TOKEN_VERSION ||
		(claims.purpose !== 'confirm' &&
			claims.purpose !== 'manage' &&
			claims.purpose !== 'oneclick') ||
		typeof claims.email !== 'string' ||
		claims.email.length === 0 ||
		typeof claims.expiresAt !== 'number' ||
		!Number.isFinite(claims.expiresAt)
	) {
		return null;
	}

	if (claims.purpose === 'oneclick') {
		const action = claims.action;
		if (!isOneClickAction(action)) return null;
		return {
			v: TOKEN_VERSION,
			purpose: claims.purpose,
			email: claims.email,
			expiresAt: claims.expiresAt,
			action,
		};
	}
	if (claims.action !== undefined) return null;
	return {
		v: TOKEN_VERSION,
		purpose: claims.purpose,
		email: claims.email,
		expiresAt: claims.expiresAt,
	};
}

/**
 * Issues a stateless, authenticated and encrypted bearer capability. Unlike
 * the deployed v1 format, the resulting URL-safe token does not expose the
 * subscriber address in base64-encoded plaintext.
 */
export async function issueToken(
	secret: string,
	email: string,
	capability: TokenCapability,
	now = Date.now(),
): Promise<string> {
	const claims: TokenClaims = {
		v: TOKEN_VERSION,
		purpose: capability.purpose,
		email,
		expiresAt: now + EXPIRY_MS[capability.purpose],
		...(capability.purpose === 'oneclick' ? { action: capability.action } : {}),
	};
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: TOKEN_AAD },
		await tokenEncryptionKey(secret),
		new TextEncoder().encode(JSON.stringify(claims)),
	);
	return `v2.${b64urlEncode(iv)}.${b64urlEncode(new Uint8Array(ciphertext))}`;
}

async function verifyV2Token(
	secret: string,
	token: string,
	capability: TokenCapability,
	now: number,
): Promise<{ email: string } | null> {
	const [version, ivEncoded, ciphertextEncoded, extra] = token.split('.');
	if (version !== 'v2' || !ivEncoded || !ciphertextEncoded || extra !== undefined) return null;

	try {
		const iv = b64urlDecode(ivEncoded);
		if (iv.byteLength !== IV_BYTES) return null;
		const plaintext = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv, additionalData: TOKEN_AAD },
			await tokenEncryptionKey(secret),
			b64urlDecode(ciphertextEncoded),
		);
		const claims = parseClaims(JSON.parse(new TextDecoder().decode(plaintext)));
		if (!claims || claims.expiresAt < now || !capabilityMatches(claims, capability)) return null;
		return { email: claims.email };
	} catch {
		return null;
	}
}

async function verifyLegacyToken(
	secret: string,
	token: string,
	purpose: 'confirm' | 'unsubscribe',
	now: number,
): Promise<{ email: string } | null> {
	const [payloadEncoded, sigEncoded, extra] = token.split('.');
	if (!payloadEncoded || !sigEncoded || extra !== undefined) return null;
	let payloadStr: string;
	try {
		payloadStr = new TextDecoder().decode(b64urlDecode(payloadEncoded));
	} catch {
		return null;
	}

	const cleaned = payloadStr.endsWith(':') ? payloadStr.slice(0, -1) : payloadStr;
	const parts = cleaned.split(':');
	if (parts.length !== 3) return null;
	const [tokenPurpose, email, expiresAtStr] = parts;
	if (tokenPurpose !== purpose || !email) return null;
	const expiresAt = Number(expiresAtStr);
	if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

	const expected = await hmac(secret, `${tokenPurpose}:${email}:${expiresAt}`);
	let actual: Uint8Array;
	try {
		actual = b64urlDecode(sigEncoded);
	} catch {
		return null;
	}
	return timingSafeEqual(expected, actual) ? { email } : null;
}

/**
 * Verifies only the requested capability. Legacy confirmation links remain
 * cryptographically readable so a stored v2 intent fingerprint can decide
 * whether they are current; an unstored legacy pending link is rejected by D1.
 */
export async function verifyToken(
	secret: string,
	token: string,
	capability: TokenCapability,
	now = Date.now(),
): Promise<{ email: string } | null> {
	const current = await verifyV2Token(secret, token, capability, now);
	if (current) return current;
	return capability.purpose === 'confirm' ? verifyLegacyToken(secret, token, 'confirm', now) : null;
}

/**
 * Preference-center compatibility only. New manage links use a v2 `manage`
 * capability; deployed body links signed with the old `unsubscribe` purpose
 * continue to work. Legacy tokens are never accepted for RFC 8058 one-click.
 */
export async function verifyManageToken(
	secret: string,
	token: string,
	now = Date.now(),
): Promise<{ email: string } | null> {
	return (
		(await verifyV2Token(secret, token, { purpose: 'manage' }, now)) ??
		(await verifyLegacyToken(secret, token, 'unsubscribe', now))
	);
}

export async function hashIp(secret: string, ip: string): Promise<string> {
	const sig = await hmac(secret, `ip:${ip}`);
	return b64urlEncode(sig);
}

export async function hashEmail(secret: string, email: string): Promise<string> {
	const sig = await hmac(secret, `email-rate-limit:${email}`);
	return b64urlEncode(sig);
}

/**
 * Returns a non-reversible identifier for one issued confirmation link. The
 * HMAC is domain-separated from token encryption and abuse-limit hashes so the
 * database never needs to retain the bearer token itself.
 */
export async function hashConfirmationToken(secret: string, token: string): Promise<string> {
	const sig = await hmac(secret, `confirm-intent:${token}`);
	return b64urlEncode(sig);
}
