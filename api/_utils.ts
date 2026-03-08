const FALLBACK_ORIGIN = 'https://sg-pe-syllabus.vercel.app';

export function getAllowedOrigin(origin: string): string {
    const allowed = process.env.ALLOWED_ORIGIN || FALLBACK_ORIGIN;
    if (
        origin === allowed ||
        /^https:\/\/sg-pe-syllabus.*\.vercel\.app$/.test(origin) ||
        /^http:\/\/localhost(:\d+)?$/.test(origin)
    ) {
        return origin;
    }
    return allowed;
}
