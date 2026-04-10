/**
 * Computes a SHA-256 hash of a video file using the Web Crypto API.
 * Used as a stable key for deduplicating video analyses.
 */
export const computeVideoHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
