/**
 * Formats a text string by truncating it to a specified maximum length and appending an ellipsis if necessary.
 * 
 * @param text The input text string to format. Can be undefined or null.
 * @param maxLength The maximum length of the string before it gets truncated. Defaults to 20.
 * @returns The formatted string, or an empty string if the input is falsy.
 */
export function truncateText(text: string | undefined | null, maxLength: number = 20): string {
    if (!text) return '';
    if (text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
    }
    return text;
}
