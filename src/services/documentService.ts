/**
 * Extracts raw text from a DOCX file.
 * @param file The DOCX file object
 * @returns A promise resolving to the raw text content
 */
export const parseDocument = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                if (!arrayBuffer) {
                    reject(new Error("Failed to read file"));
                    return;
                }

                // Access mammoth from global window object (loaded via CDN)
                const mammoth = (window as any).mammoth;
                if (!mammoth) {
                    throw new Error("Mammoth library not loaded. Please check your internet connection.");
                }

                const result = await mammoth.extractRawText({ arrayBuffer });
                resolve(result.value); // The raw text
            } catch (error) {
                console.error("Mammoth parsing error:", error);
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
