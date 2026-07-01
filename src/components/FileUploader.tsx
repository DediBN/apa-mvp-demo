import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './FileUploader.css';

interface FileUploaderProps {
  onTextExtracted: (text: string, filename: string) => void;
  disabled?: boolean;
}

export default function FileUploader({ onTextExtracted, disabled }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'txt') {
        const text = await file.text();
        onTextExtracted(text, file.name);

      } else if (ext === 'pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
        }
        onTextExtracted(text.trim(), file.name);

      } else if (ext === 'docx') {
        const mammoth = await import('mammoth');
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        onTextExtracted(result.value.trim(), file.name);

      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        let text = '';
        workbook.SheetNames.forEach(name => {
          const sheet = workbook.Sheets[name];
          text += `[Sheet: ${name}]\n`;
          text += XLSX.utils.sheet_to_csv(sheet) + '\n\n';
        });
        onTextExtracted(text.trim(), file.name);

      } else {
        setError('Unsupported file type. Use PDF, DOCX, TXT, or Excel.');
      }
    } catch (e) {
      setError('Failed to extract text from file.');
      console.error(e);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className={`file-uploader${disabled ? ' file-uploader--disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.xlsx,.xls,.csv"
        onChange={handleChange}
        disabled={disabled || loading}
        className="file-uploader__input"
        id="file-upload"
      />
      <label htmlFor="file-upload" className={`file-uploader__btn${loading ? ' file-uploader__btn--loading' : ''}`}>
        {loading ? '⏳ Reading…' : '📎 Upload file'}
      </label>
      <span className="file-uploader__hint">PDF · DOCX · TXT · Excel</span>
      {error && <span className="file-uploader__error">{error}</span>}
    </div>
  );
}
