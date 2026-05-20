const WPM = 220;

export function readingTimeMinutes(text: string): number {
	const words = text
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/[#>*_~\-]/g, ' ')
		.split(/\s+/)
		.filter(Boolean).length;
	return Math.max(1, Math.round(words / WPM));
}
