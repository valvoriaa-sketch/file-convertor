/**
 * ConvertCraft - Image & PDF Conversion Engine
 * Performs 100% client-side conversions via HTML5 Canvas, jsPDF, and JSZip.
 * Includes server fallback processing for resilience.
 */

const ConverterEngine = (() => {

  /**
   * Load an image file into an HTMLImageElement
   * @param {File|Blob} file 
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image file. File may be corrupted or an unsupported format.'));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Pure JavaScript 24-bit Windows Bitmap (.bmp) Encoder
   * Converts Canvas ImageData to an uncompressed BMP Blob.
   * @param {ImageData} imageData 
   * @returns {Blob}
   */
  function encodeBmp(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // Each row in a BMP must be padded to a multiple of 4 bytes
    const rowPadding = (4 - ((width * 3) % 4)) % 4;
    const rowSize = width * 3 + rowPadding;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize; // 14 bytes BITMAPFILEHEADER + 40 bytes BITMAPINFOHEADER

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // --- BITMAPFILEHEADER (14 bytes) ---
    view.setUint16(0, 0x4D42, false); // "BM" signature (Little Endian)
    view.setUint32(2, fileSize, true);  // Total file size
    view.setUint16(6, 0, true);         // Reserved
    view.setUint16(8, 0, true);         // Reserved
    view.setUint32(10, 54, true);       // Offset to pixel array

    // --- BITMAPINFOHEADER (40 bytes) ---
    view.setUint32(14, 40, true);       // DIB Header size (40 bytes)
    view.setInt32(18, width, true);     // Width
    view.setInt32(22, height, true);    // Height (positive = bottom-to-top)
    view.setUint16(26, 1, true);        // Color planes (must be 1)
    view.setUint16(28, 24, true);       // Bits per pixel (24-bit RGB)
    view.setUint32(30, 0, true);        // Compression (0 = none)
    view.setUint32(34, pixelArraySize, true); // Image size
    view.setInt32(38, 2835, true);      // Horizontal resolution (~72 DPI)
    view.setInt32(42, 2835, true);      // Vertical resolution (~72 DPI)
    view.setUint32(46, 0, true);        // Colors in palette
    view.setUint32(50, 0, true);        // Important colors

    // --- Pixel Array (BGR, bottom row first) ---
    let pos = 54;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        view.setUint8(pos++, b); // Blue
        view.setUint8(pos++, g); // Green
        view.setUint8(pos++, r); // Red
      }
      for (let p = 0; p < rowPadding; p++) {
        view.setUint8(pos++, 0);
      }
    }

    return new Blob([buffer], { type: 'image/bmp' });
  }

  /**
   * Render image to HTML5 Canvas with rotation and background fill
   * @param {HTMLImageElement} img 
   * @param {number} rotation Degrees (0, 90, 180, 270)
   * @param {string} targetFormat Target MIME type or format name
   * @returns {HTMLCanvasElement}
   */
  function renderToCanvas(img, rotation = 0, targetFormat = 'jpeg') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const normRotation = ((rotation % 360) + 360) % 360;
    const isQuarterTurn = normRotation === 90 || normRotation === 270;

    // Set canvas dimensions swapping width and height if rotated by 90 or 270 degrees
    canvas.width = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
    canvas.height = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

    // Fill white background for JPEG / BMP to avoid black transparency artifacts
    const fmt = targetFormat.toLowerCase();
    if (fmt === 'jpg' || fmt === 'jpeg' || fmt === 'image/jpeg' || fmt === 'bmp' || fmt === 'image/bmp') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Apply rotation transforms
    ctx.save();
    if (normRotation === 90) {
      ctx.translate(canvas.width, 0);
      ctx.rotate((90 * Math.PI) / 180);
    } else if (normRotation === 180) {
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate((180 * Math.PI) / 180);
    } else if (normRotation === 270) {
      ctx.translate(0, canvas.height);
      ctx.rotate((270 * Math.PI) / 180);
    }

    ctx.drawImage(img, 0, 0);
    ctx.restore();

    return canvas;
  }

  /**
   * Convert canvas to Blob based on format
   * @param {HTMLCanvasElement} canvas 
   * @param {string} targetFormat 
   * @param {number} quality 0.1 - 1.0
   * @returns {Promise<Blob>}
   */
  function canvasToBlob(canvas, targetFormat = 'jpeg', quality = 0.9) {
    return new Promise((resolve, reject) => {
      const fmt = targetFormat.toLowerCase().replace('image/', '');

      if (fmt === 'bmp') {
        try {
          const ctx = canvas.getContext('2d');
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const bmpBlob = encodeBmp(imageData);
          return resolve(bmpBlob);
        } catch (e) {
          return reject(e);
        }
      }

      let mimeType = 'image/jpeg';
      if (fmt === 'png') mimeType = 'image/png';
      else if (fmt === 'webp') mimeType = 'image/webp';
      else if (fmt === 'jpg' || fmt === 'jpeg') mimeType = 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error(`Failed to encode canvas to ${mimeType}`));
          }
        },
        mimeType,
        quality
      );
    });
  }

  /**
   * Convert a single image file to a destination format Blob
   * @param {File} file 
   * @param {number} rotation 
   * @param {string} targetFormat 
   * @param {number} quality 
   * @returns {Promise<Blob>}
   */
  async function convertSingleImage(file, rotation, targetFormat, quality) {
    try {
      const img = await loadImage(file);
      const canvas = renderToCanvas(img, rotation, targetFormat);
      return await canvasToBlob(canvas, targetFormat, quality);
    } catch (clientErr) {
      console.warn('[Converter] Client conversion failed, attempting server fallback...', clientErr);
      return await convertFallback(file, targetFormat, quality);
    }
  }

  /**
   * Multi-Page PDF Compiler using jsPDF
   * @param {Array<{file: File, rotation: number}>} items 
   * @param {Object} options { orientation: 'portrait'|'landscape', margin: 'none'|'small'|'large' }
   * @param {Function} onProgress (percent, statusText) => void
   * @returns {Promise<Blob>}
   */
  async function compilePdf(items, options = {}, onProgress = () => {}) {
    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
      throw new Error('jsPDF library failed to load from CDN. Please check your internet connection.');
    }

    const orientation = options.orientation === 'landscape' ? 'landscape' : 'portrait';
    const isLandscape = orientation === 'landscape';

    // Standard A4 dimensions in millimeters
    const pageWidth = isLandscape ? 297 : 210;
    const pageHeight = isLandscape ? 210 : 297;

    // Margin mapping in mm
    let margin = 0;
    if (options.margin === 'small') margin = 10;
    else if (options.margin === 'large') margin = 20;

    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    const doc = new jsPDFClass({
      orientation: isLandscape ? 'l' : 'p',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const total = items.length;

    for (let i = 0; i < total; i++) {
      const item = items[i];
      const percent = Math.round(((i + 1) / total) * 90);
      onProgress(percent, `Rendering PDF page ${i + 1} of ${total}...`);

      const img = await loadImage(item.file);
      const canvas = renderToCanvas(img, item.rotation || 0, 'jpeg');
      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      const imgW = canvas.width;
      const imgH = canvas.height;
      const imgRatio = imgW / imgH;
      const printRatio = printableWidth / printableHeight;

      let destW, destH;
      if (imgRatio > printRatio) {
        destW = printableWidth;
        destH = printableWidth / imgRatio;
      } else {
        destH = printableHeight;
        destW = printableHeight * imgRatio;
      }

      // Center image in the printable bounds
      const posX = margin + (printableWidth - destW) / 2;
      const posY = margin + (printableHeight - destH) / 2;

      if (i > 0) {
        doc.addPage([pageWidth, pageHeight], orientation);
      }

      doc.addImage(imgDataUrl, 'JPEG', posX, posY, destW, destH, undefined, 'FAST');
    }

    onProgress(98, 'Finalizing PDF document...');
    const pdfBlob = doc.output('blob');
    onProgress(100, 'PDF generation complete!');
    return pdfBlob;
  }

  /**
   * Bundle multiple files into a single ZIP archive using JSZip
   * @param {Array<{blob: Blob, filename: string}>} filesList 
   * @param {Function} onProgress (percent, statusText) => void
   * @returns {Promise<Blob>}
   */
  async function createZipArchive(filesList, onProgress = () => {}) {
    if (!window.JSZip) {
      throw new Error('JSZip library failed to load from CDN. Please check your internet connection.');
    }

    const zip = new window.JSZip();
    const usedNames = new Set();

    filesList.forEach((item, index) => {
      let name = item.filename;
      if (usedNames.has(name)) {
        const dotIndex = name.lastIndexOf('.');
        const base = dotIndex !== -1 ? name.substring(0, dotIndex) : name;
        const ext = dotIndex !== -1 ? name.substring(dotIndex) : '';
        name = `${base}_(${index + 1})${ext}`;
      }
      usedNames.add(name);
      zip.file(name, item.blob);
    });

    onProgress(90, 'Compressing files into ZIP archive...');

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      },
      (metadata) => {
        const p = Math.min(99, Math.round(90 + (metadata.percent / 10)));
        onProgress(p, `Archiving: ${Math.round(metadata.percent)}% complete...`);
      }
    );

    onProgress(100, 'ZIP archive ready!');
    return zipBlob;
  }

  /**
   * Fallback to Express backend /api/convert-fallback
   * @param {File} file 
   * @param {string} targetFormat 
   * @param {number} quality 
   * @returns {Promise<Blob>}
   */
  async function convertFallback(file, targetFormat, quality) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('targetFormat', targetFormat);
    formData.append('quality', Math.round(quality * 100));

    const response = await fetch('/api/convert-fallback', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Server fallback failed with status ${response.status}`);
    }

    return await response.blob();
  }

  /**
   * Trigger automatic file download in browser
   * @param {Blob} blob 
   * @param {string} filename 
   */
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return {
    loadImage,
    renderToCanvas,
    canvasToBlob,
    convertSingleImage,
    compilePdf,
    createZipArchive,
    convertFallback,
    triggerDownload
  };
})();

// Export to window
window.ConverterEngine = ConverterEngine;
