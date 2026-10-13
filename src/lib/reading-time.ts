const WORDS_PER_MINUTE = 220;

export function readingTimeMinutes(wordCount: number): number {
	return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}
