//@ts-ignore
import mammoth from 'mammoth/mammoth.browser';
import * as XLSX from 'xlsx';
//@ts-ignore
import * as pdfjsLib from "pdfjs-dist";

// 配置PDF.js worker
//@ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

/**
 * 读取文件为文本内容
 */
export async function readFileTextAsync(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            resolve(e.target?.result as string);
        };
        reader.onerror = function (e) {
            reject(e);
        };
        reader.readAsText(file);
    });
}

/**
 * 读取文件为ArrayBuffer
 */
export async function readFileBufferAsync(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 读取文件为DataURL（用于图片）
 */
export async function readFileDataUrlAsync(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
}

/**
 * 读取DOCX文件内容
 */
export async function readDocxFile(file: File): Promise<string> {
    const arrayBuffer = await readFileBufferAsync(file);
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/**
 * 读取PDF文件内容
 */
export async function readPdfFile(file: File): Promise<string> {
    const arrayBuffer = await readFileBufferAsync(file);
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
}

/**
 * 读取Excel文件内容
 */
export async function readExcelFile(file: File): Promise<string> {
    const arrayBuffer = await readFileBufferAsync(file);
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    let result = '';
    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        result += `Sheet: ${sheetName}\n`;
        //@ts-ignore
        sheetData.forEach((row: any[]) => {
            result += row.join(', ') + '\n';
        });
        result += '\n';
    });
    return result;
}

/**
 * 根据文件类型自动选择合适的读取方法
 */
export async function readFile(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    switch (extension) {
        case 'docx':
            return await readDocxFile(file);
        case 'pdf':
            return await readPdfFile(file);
        case 'xlsx':
        case 'xls':
            return await readExcelFile(file);
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'bmp':
        case 'webp':
            return await readFileDataUrlAsync(file);
        default:
            return await readFileTextAsync(file);
    }
}