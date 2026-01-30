declare module 'mammoth' {
    export interface MammothResult {
        value: string;
        messages: any[];
    }

    export interface MammothOptions {
        arrayBuffer: ArrayBuffer;
    }

    export function extractRawText(input: MammothOptions): Promise<MammothResult>;
}
