export interface EmailTemplateVariableSpec {
	required: readonly string[];
	allowed: readonly string[];
}

const CONFIRM_VARIABLES = {
	required: ['confirmUrl', 'privacyUrl'],
	allowed: ['confirmUrl', 'privacyUrl'],
} as const satisfies EmailTemplateVariableSpec;

const WELCOME_VARIABLES = {
	required: ['manageUrl', 'privacyUrl'],
	allowed: ['manageUrl', 'privacyUrl'],
} as const satisfies EmailTemplateVariableSpec;

/**
 * Runtime variables supported by each bundled template. Templates not listed
 * here may still be edited, but remain static and cannot contain placeholders.
 */
export const EMAIL_TEMPLATE_VARIABLES = {
	'confirm-en': CONFIRM_VARIABLES,
	'confirm-uk': CONFIRM_VARIABLES,
	'welcome-en': WELCOME_VARIABLES,
	'welcome-uk': WELCOME_VARIABLES,
} as const satisfies Record<string, EmailTemplateVariableSpec>;

const PLACEHOLDER_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const VARIABLE_NAME_RE = /^\w+$/;

export function getEmailTemplateVariableSpec(slug: string): EmailTemplateVariableSpec | undefined {
	return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATE_VARIABLES, slug)
		? EMAIL_TEMPLATE_VARIABLES[slug as keyof typeof EMAIL_TEMPLATE_VARIABLES]
		: undefined;
}

export function extractEmailTemplateVariables(value: string): string[] {
	const variables = new Set<string>();
	for (const match of value.matchAll(PLACEHOLDER_RE)) {
		const variable = match[1].trim();
		if (VARIABLE_NAME_RE.test(variable)) variables.add(variable);
	}
	return [...variables];
}

function hasUnsupportedPlaceholderSyntax(value: string): boolean {
	if (value.includes('{{{') || value.includes('}}}')) return true;
	for (const match of value.matchAll(PLACEHOLDER_RE)) {
		if (!VARIABLE_NAME_RE.test(match[1].trim())) return true;
	}
	const withoutPlaceholders = value.replace(PLACEHOLDER_RE, '');
	return withoutPlaceholders.includes('{{') || withoutPlaceholders.includes('}}');
}

function formatVariables(variables: readonly string[]): string {
	return variables.map((variable) => `{{${variable}}}`).join(', ');
}

export function validateEmailTemplateVariables(
	slug: string,
	parts: { html: string; text: string },
): string[] {
	const spec = getEmailTemplateVariableSpec(slug);
	const errors: string[] = [];

	for (const [part, value] of [
		['html', parts.html],
		['text', parts.text],
	] as const) {
		if (hasUnsupportedPlaceholderSyntax(value)) {
			errors.push(`${part} contains unsupported placeholder syntax`);
		}

		const variables = extractEmailTemplateVariables(value);
		if (!spec) {
			if (variables.length > 0) {
				errors.push(
					`${part} contains placeholders, but template "${slug}" has no registered variables`,
				);
			}
			continue;
		}

		const unknown = variables.filter((variable) => !spec.allowed.includes(variable));
		if (unknown.length > 0) {
			errors.push(`${part} contains unknown variables: ${formatVariables(unknown)}`);
		}

		const missing = spec.required.filter((variable) => !variables.includes(variable));
		if (missing.length > 0) {
			errors.push(`${part} is missing required variables: ${formatVariables(missing)}`);
		}
	}

	return errors;
}

export function renderEmailTemplate(
	slug: string,
	parts: { html: string; text: string },
	variables: Record<string, string>,
): { html: string; text: string } {
	const spec = getEmailTemplateVariableSpec(slug);
	if (!spec) throw new Error(`Email template "${slug}" has no runtime variable contract`);

	const templateErrors = validateEmailTemplateVariables(slug, parts);
	if (templateErrors.length > 0) {
		throw new Error(`Invalid email template "${slug}": ${templateErrors.join('; ')}`);
	}

	const unknownValues = Object.keys(variables).filter(
		(variable) => !spec.allowed.includes(variable),
	);
	if (unknownValues.length > 0) {
		throw new Error(
			`Unsupported values for email template "${slug}": ${formatVariables(unknownValues)}`,
		);
	}

	const usedVariables = [
		...new Set([
			...extractEmailTemplateVariables(parts.html),
			...extractEmailTemplateVariables(parts.text),
		]),
	];
	const missingValues = usedVariables.filter(
		(variable) => !Object.prototype.hasOwnProperty.call(variables, variable),
	);
	if (missingValues.length > 0) {
		throw new Error(
			`Missing values for email template "${slug}": ${formatVariables(missingValues)}`,
		);
	}

	const renderPart = (value: string): string =>
		value.replace(PLACEHOLDER_RE, (_match, expression: string) => variables[expression.trim()]);

	return { html: renderPart(parts.html), text: renderPart(parts.text) };
}
