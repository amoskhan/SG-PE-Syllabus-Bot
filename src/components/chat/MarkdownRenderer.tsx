import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

// A simplified markdown renderer to avoid heavy dependencies while keeping the output nice.
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Process the content to handle bolding, lists, and basic headers.
  // We split by newlines to handle block elements.

  const lines = content.split('\n');

  const formattedElements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let inList = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith('### ')) {
      if (inList) {
        formattedElements.push(<ul key={`list-${index}`} className="list-disc ml-6 mb-4 space-y-1">{currentList}</ul>);
        currentList = [];
        inList = false;
      }
      formattedElements.push(<h3 key={index} className="text-lg font-bold text-slate-800 dark:text-white mt-4 mb-2">{formatInline(trimmed.substring(4))}</h3>);
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        formattedElements.push(<ul key={`list-${index}`} className="list-disc ml-6 mb-4 space-y-1">{currentList}</ul>);
        currentList = [];
        inList = false;
      }
      formattedElements.push(<h2 key={index} className="text-xl font-bold text-slate-800 dark:text-white mt-5 mb-3">{formatInline(trimmed.substring(3))}</h2>);
    }
    // List Items
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      currentList.push(<li key={index} className="text-slate-700 dark:text-slate-300">{formatInline(trimmed.substring(2))}</li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      // Ordered list handling simplified (rendering as bullet for consistency in this simple parser, or separate block)
      // Let's treat numbered lists as just text lines with bold numbers for simplicity to avoid complex state
      if (inList) {
        formattedElements.push(<ul key={`list-${index}`} className="list-disc ml-6 mb-4 space-y-1">{currentList}</ul>);
        currentList = [];
        inList = false;
      }
      formattedElements.push(<div key={index} className="mb-1 text-slate-700 dark:text-slate-300">{formatInline(trimmed)}</div>);
    }
    // Empty lines
    else if (trimmed === '') {
      if (inList) {
        formattedElements.push(<ul key={`list-${index}`} className="list-disc ml-6 mb-4 space-y-1">{currentList}</ul>);
        currentList = [];
        inList = false;
      }
      formattedElements.push(<div key={index} className="h-2"></div>);
    }
    // Standard Paragraphs
    else {
      if (inList) {
        formattedElements.push(<ul key={`list-${index}`} className="list-disc ml-6 mb-4 space-y-1">{currentList}</ul>);
        currentList = [];
        inList = false;
      }
      formattedElements.push(<p key={index} className="mb-2 text-slate-700 dark:text-slate-300 leading-relaxed">{formatInline(trimmed)}</p>);
    }
  });

  // Flush remaining list
  if (inList) {
    formattedElements.push(<ul key="list-end" className="list-disc ml-6 mb-4 space-y-1">{currentList}</ul>);
  }

  return <div className="text-sm md:text-base">{formattedElements}</div>;
};

// Helper to handle **bold** and *italic*
const formatInline = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    // Simple link detection
    if (part.match(/\[.*?\]\(.*?\)/)) {
      // Very basic link parser, generally Gemini returns plain URLs or markdown links
      // For safety in this regex-lite version, we return text. 
      // Real implementation would use a robust parser.
      return <span key={i}>{part}</span>;
    }
    return part;
  });
};

export default MarkdownRenderer;