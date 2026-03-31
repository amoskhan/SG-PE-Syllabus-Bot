import React, { useState } from 'react';
import { supabase } from '../../services/db/supabaseClient';

interface PdfUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PdfUploaderModal: React.FC<PdfUploaderModalProps> = ({ isOpen, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', text: string }>({ type: 'idle', text: '' });

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setStatus({ type: 'idle', text: '' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus({ type: 'error', text: 'You must be logged in to upload PDFs.' });
        setIsUploading(false);
        return;
      }

      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      
      setStatus({ type: 'success', text: data.message || 'PDF processed and saved to database!' });
      setFile(null);
    } catch (err: any) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 m-4">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span>📚</span> Syllabus RAG Database
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Upload an academic PDF or PE Syllabus document. It will be vectorized and added to the AI's permanent memory.
          </p>
          
          <div className="mb-4">
            <input 
              type="file" 
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-300 transition-all cursor-pointer border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          {status.text && (
            <div className={`p-3 rounded-lg text-sm mb-4 ${status.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 border border-green-200 dark:border-green-800' : 'bg-red-50 text-red-700 dark:bg-red-900/30 border border-red-200 dark:border-red-800'}`}>
              {status.text}
            </div>
          )}

          <button 
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex justify-center items-center gap-2 shadow-sm"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Processing PDF...
              </>
            ) : 'Upload & Vectorize'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfUploaderModal;
