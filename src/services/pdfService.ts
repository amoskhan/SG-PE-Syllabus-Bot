import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export const generatePDF = async (elementId: string, fileName: string = 'analysis-report'): Promise<void> => {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id ${elementId} not found`);
        return;
    }

    try {
        // Add a temporary class for PDF styling (e.g. force white background)
        element.classList.add('pdf-export-mode');

        const canvas = await html2canvas(element, {
            scale: 2, // Higher resolution
            useCORS: true, // Handle cross-origin images
            logging: false,
            backgroundColor: '#ffffff'
        });

        element.classList.remove('pdf-export-mode');

        const imgData = canvas.toDataURL('image/png');

        // A4 dimensions in mm
        const pdfWidth = 210;
        const pdfHeight = 297;
        const imgProps = canvas;

        // Calculate PDF page height based on canvas ratio
        const imgWidth = pdfWidth;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        const pdf = new jsPDF('p', 'mm', 'a4');

        // If image is taller than a page, we might need multi-page logic, 
        // but for single chat bubbles, usually single page or auto-scaled is fine for now.
        // Let's implement simple multi-page auto-split if needed, or just shrink to fit?
        // Shrink to fit is safer for now, or just letting it overflow (which cuts off).
        // Let's do a simple "Fit width, let height expand" but jsPDF needs manual paging.
        // For MVP, if it fits on one page, great. If not, it scales down or cuts off.

        // Better approach: If height > A4, add new pages.
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        pdf.save(`${fileName}.pdf`);

    } catch (error) {
        console.error('PDF Generation failed:', error);
        alert('Failed to generate PDF. See console.');
    }
};
