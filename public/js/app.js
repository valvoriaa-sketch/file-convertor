/**
 * ConvertCraft - Core Application Controller
 * Handles drag-and-drop, state management, preview grid, and conversion flows.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Application State ---
  const state = {
    fileList: [],
    settings: {
      targetFormat: 'pdf', // 'pdf' | 'jpeg' | 'png' | 'webp' | 'bmp'
      quality: 0.9,        // 0.1 to 1.0
      pdfOrientation: 'portrait', // 'portrait' | 'landscape'
      pdfMargin: 'none'           // 'none' | 'small' | 'large'
    },
    isProcessing: false
  };

  // --- DOM Elements ---
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const imageGrid = document.getElementById('image-grid');
  const emptyQueueMsg = document.getElementById('empty-queue-msg');
  const queueCountBadge = document.getElementById('queue-count-badge');
  const queueTotalSize = document.getElementById('queue-total-size');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const addMoreBtn = document.getElementById('add-more-btn');
  const convertBtn = document.getElementById('convert-btn');

  // Toolbar elements
  const formatPills = document.querySelectorAll('.format-pill-btn');
  const pdfOptionsGroup = document.getElementById('pdf-options-group');
  const imageOptionsGroup = document.getElementById('image-options-group');
  const qualitySlider = document.getElementById('quality-slider');
  const qualityBadge = document.getElementById('quality-badge');
  const orientationBtns = document.querySelectorAll('[data-orientation]');
  const marginBtns = document.querySelectorAll('[data-margin]');

  // --- Initialize UI Helpers & Page Configuration ---
  if (window.UIHelpers) {
    window.UIHelpers.initMobileNav();
    window.UIHelpers.initDropdowns();
    window.UIHelpers.initFaqAccordions();

    const config = window.UIHelpers.getPageConfig();
    if (config.targetFormat) {
      state.settings.targetFormat = config.targetFormat === 'jpg' ? 'jpeg' : config.targetFormat;
    }
  }

  // Sync initial toolbar state with configured target format
  applyFormatSelection(state.settings.targetFormat);

  // Setup Drag-and-Drop Reorder on Image Grid
  if (window.UIHelpers && imageGrid) {
    window.UIHelpers.setupDragAndDropReorder(imageGrid, (newOrderIds) => {
      // Reorder state.fileList based on newOrderIds
      const reordered = [];
      newOrderIds.forEach((id) => {
        const item = state.fileList.find((f) => f.id === id);
        if (item) reordered.push(item);
      });
      state.fileList = reordered;
      updateCardOrderBadges();
    });
  }

  // --- Dropzone & File Input Handlers ---
  if (dropzone && fileInput) {
    // Click on dropzone triggers hidden file input
    dropzone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
        fileInput.click();
      }
    });

    // Drag-over styling
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'dragend'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-active');

      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFilesSelected(dt.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(e.target.files);
        fileInput.value = ''; // Reset input to allow selecting same file again
      }
    });
  }

  // Paste from clipboard support (Ctrl+V / Cmd+V)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    const pastedFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      handleFilesSelected(pastedFiles);
      if (window.UIHelpers) {
        window.UIHelpers.showToast('Clipboard Image', `Imported ${pastedFiles.length} image(s) from clipboard.`, 'info');
      }
    }
  });

  // --- File Selection & Validation ---
  function handleFilesSelected(files) {
    const validFiles = [];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'];

    Array.from(files).forEach((file) => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isImageMime = file.type.startsWith('image/');
      const isValidExt = validExtensions.includes(ext);

      if (isImageMime || isValidExt) {
        validFiles.push(file);
      }
    });

    if (validFiles.length === 0) {
      if (window.UIHelpers) {
        window.UIHelpers.showToast('Invalid File', 'Please select valid image files (JPG, PNG, WEBP, GIF, BMP).', 'warning');
      }
      return;
    }

    validFiles.forEach((file) => {
      const item = {
        id: 'img_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
        file: file,
        name: file.name,
        size: file.size,
        type: file.type || 'image/jpeg',
        previewUrl: URL.createObjectURL(file),
        rotation: 0
      };
      state.fileList.push(item);
    });

    renderImageGrid();
    updateQueueSummary();

    if (window.UIHelpers) {
      window.UIHelpers.showToast('Files Added', `Added ${validFiles.length} file(s) to the conversion queue.`, 'success');
    }

    // Scroll smoothly to queue if user added items
    const queueSection = document.getElementById('queue-section');
    if (queueSection) {
      queueSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // --- Render Image Grid Cards ---
  function renderImageGrid() {
    if (!imageGrid) return;
    imageGrid.innerHTML = '';

    if (state.fileList.length === 0) {
      if (emptyQueueMsg) emptyQueueMsg.style.display = 'block';
      if (convertBtn) convertBtn.disabled = true;
      return;
    }

    if (emptyQueueMsg) emptyQueueMsg.style.display = 'none';
    if (convertBtn) convertBtn.disabled = false;

    state.fileList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.dataset.id = item.id;
      card.draggable = true;

      const formattedSize = window.UIHelpers ? window.UIHelpers.formatBytes(item.size) : `${Math.round(item.size / 1024)} KB`;

      card.innerHTML = `
        <div class="card-top-bar">
          <span class="drag-handle" title="Drag to reorder page / file sequence">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
          </span>
          <span class="card-order-badge" id="order-${item.id}">#${index + 1}</span>
        </div>
        <div class="card-preview-box">
          <img class="preview-img" src="${item.previewUrl}" alt="${item.name}" style="transform: rotate(${item.rotation}deg);" />
        </div>
        <div class="card-info">
          <div class="card-filename" title="${item.name}">${item.name}</div>
          <div class="card-meta">
            <span>${formattedSize}</span>
            <span class="rotation-label">${item.rotation ? `${item.rotation}°` : 'Original'}</span>
          </div>
        </div>
        <div class="card-actions">
          <div class="action-btn-group">
            <button type="button" class="icon-btn btn-rotate-left" title="Rotate 90° Left" aria-label="Rotate left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2v6h6"></path><path d="M2.66 15.57a10 10 0 1 0 .57-8.38L2.5 8"></path></svg>
            </button>
            <button type="button" class="icon-btn btn-rotate-right" title="Rotate 90° Right" aria-label="Rotate right">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"></path><path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"></path></svg>
            </button>
          </div>
          <button type="button" class="icon-btn btn-delete" title="Remove File" aria-label="Remove file">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      `;

      // Event handlers for item actions
      const rotateLeftBtn = card.querySelector('.btn-rotate-left');
      const rotateRightBtn = card.querySelector('.btn-rotate-right');
      const deleteBtn = card.querySelector('.btn-delete');
      const previewImg = card.querySelector('.preview-img');
      const rotationLabel = card.querySelector('.rotation-label');

      rotateLeftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.rotation = ((item.rotation - 90) % 360 + 360) % 360;
        previewImg.style.transform = `rotate(${item.rotation}deg)`;
        rotationLabel.textContent = item.rotation ? `${item.rotation}°` : 'Original';
      });

      rotateRightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.rotation = (item.rotation + 90) % 360;
        previewImg.style.transform = `rotate(${item.rotation}deg)`;
        rotationLabel.textContent = item.rotation ? `${item.rotation}°` : 'Original';
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(item.id);
      });

      imageGrid.appendChild(card);
    });
  }

  // Update order badges (#1, #2, etc.) after reordering
  function updateCardOrderBadges() {
    state.fileList.forEach((item, index) => {
      const badge = document.getElementById(`order-${item.id}`);
      if (badge) badge.textContent = `#${index + 1}`;
    });
  }

  // Remove single file
  function removeFile(id) {
    const index = state.fileList.findIndex((item) => item.id === id);
    if (index !== -1) {
      URL.revokeObjectURL(state.fileList[index].previewUrl);
      state.fileList.splice(index, 1);
      renderImageGrid();
      updateQueueSummary();
    }
  }

  // Clear all files
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (state.fileList.length === 0) return;
      state.fileList.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      state.fileList = [];
      renderImageGrid();
      updateQueueSummary();
      if (window.UIHelpers) {
        window.UIHelpers.showToast('Queue Cleared', 'All images have been removed from the queue.', 'info');
      }
    });
  }

  // Add more files button triggers file input
  if (addMoreBtn && fileInput) {
    addMoreBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // Update file counter and total size badge
  function updateQueueSummary() {
    const count = state.fileList.length;
    const totalBytes = state.fileList.reduce((acc, curr) => acc + curr.size, 0);

    if (queueCountBadge) {
      queueCountBadge.textContent = `${count} ${count === 1 ? 'file' : 'files'}`;
    }

    if (queueTotalSize) {
      queueTotalSize.textContent = count > 0 && window.UIHelpers ? `(${window.UIHelpers.formatBytes(totalBytes)} total)` : '';
    }

    if (convertBtn) {
      convertBtn.disabled = count === 0 || state.isProcessing;
    }
  }

  // --- Toolbar & Format Selection Controls ---
  formatPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const target = pill.dataset.format;
      applyFormatSelection(target);
    });
  });

  function applyFormatSelection(targetFormat) {
    const normalized = targetFormat === 'jpg' ? 'jpeg' : targetFormat.toLowerCase();
    state.settings.targetFormat = normalized;

    formatPills.forEach((p) => {
      const pFmt = (p.dataset.format === 'jpg' ? 'jpeg' : p.dataset.format).toLowerCase();
      p.classList.toggle('active', pFmt === normalized);
    });

    // Toggle conditional options
    if (normalized === 'pdf') {
      if (pdfOptionsGroup) pdfOptionsGroup.style.display = 'flex';
      if (imageOptionsGroup) imageOptionsGroup.style.display = 'none';
      if (convertBtn) {
        convertBtn.querySelector('.btn-cta-text').textContent = 'Convert & Download PDF';
      }
    } else {
      if (pdfOptionsGroup) pdfOptionsGroup.style.display = 'none';
      if (imageOptionsGroup) imageOptionsGroup.style.display = 'flex';

      // Hide or show quality slider based on whether format is lossy
      const qualityRow = document.getElementById('quality-slider-row');
      if (qualityRow) {
        qualityRow.style.display = (normalized === 'png' || normalized === 'bmp') ? 'none' : 'flex';
      }

      if (convertBtn) {
        const ext = normalized === 'jpeg' ? 'JPG' : normalized.toUpperCase();
        convertBtn.querySelector('.btn-cta-text').textContent = `Convert & Download ${ext}`;
      }
    }
  }

  // Quality Range Slider
  if (qualitySlider && qualityBadge) {
    qualitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.settings.quality = val / 100;
      qualityBadge.textContent = `${val}%`;
    });
  }

  // PDF Orientation Segmented Buttons
  orientationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      orientationBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.pdfOrientation = btn.dataset.orientation;
    });
  });

  // PDF Margins Segmented Buttons
  marginBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      marginBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.pdfMargin = btn.dataset.margin;
    });
  });

  // --- Main Conversion Flow Execution ---
  if (convertBtn) {
    convertBtn.addEventListener('click', async () => {
      if (state.fileList.length === 0 || state.isProcessing) return;

      const engine = window.ConverterEngine;
      if (!engine) {
        if (window.UIHelpers) {
          window.UIHelpers.showToast('Error', 'Conversion engine not loaded. Please refresh the page.', 'error');
        }
        return;
      }

      state.isProcessing = true;
      convertBtn.disabled = true;

      const progressModal = window.UIHelpers
        ? window.UIHelpers.showProgressModal('Processing Assets...', 'Preparing images...')
        : null;

      try {
        const fmt = state.settings.targetFormat;
        const total = state.fileList.length;

        if (fmt === 'pdf') {
          // Compile multi-page PDF locally
          const pdfBlob = await engine.compilePdf(
            state.fileList,
            {
              orientation: state.settings.pdfOrientation,
              margin: state.settings.pdfMargin
            },
            (percent, status) => {
              if (progressModal) progressModal.update(percent, status);
            }
          );

          const filename = `convertcraft_${Date.now()}.pdf`;
          engine.triggerDownload(pdfBlob, filename);

          if (window.UIHelpers) {
            window.UIHelpers.showToast('Success!', `Downloaded ${filename} (${window.UIHelpers.formatBytes(pdfBlob.size)})`, 'success');
          }
        } else {
          // Image Format Conversions (JPG, PNG, WEBP, BMP)
          const extMap = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', bmp: 'bmp' };
          const ext = extMap[fmt] || fmt;

          if (total === 1) {
            // Single image: direct download without zip
            if (progressModal) progressModal.update(30, 'Converting image in browser...');
            const item = state.fileList[0];
            const convertedBlob = await engine.convertSingleImage(
              item.file,
              item.rotation,
              fmt,
              state.settings.quality
            );

            if (progressModal) progressModal.update(100, 'Done!');
            const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
            const filename = `${baseName}_converted.${ext}`;
            engine.triggerDownload(convertedBlob, filename);

            if (window.UIHelpers) {
              window.UIHelpers.showToast('Success!', `Downloaded ${filename} (${window.UIHelpers.formatBytes(convertedBlob.size)})`, 'success');
            }
          } else {
            // Multiple images: convert each and bundle into a ZIP
            const convertedFiles = [];

            for (let i = 0; i < total; i++) {
              const item = state.fileList[i];
              const pct = Math.round(((i + 1) / total) * 85);
              if (progressModal) {
                progressModal.update(pct, `Converting image ${i + 1} of ${total}...`);
              }

              const blob = await engine.convertSingleImage(
                item.file,
                item.rotation,
                fmt,
                state.settings.quality
              );

              const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
              convertedFiles.push({
                blob: blob,
                filename: `${baseName}_converted.${ext}`
              });
            }

            // Create ZIP archive
            const zipBlob = await engine.createZipArchive(convertedFiles, (pct, status) => {
              if (progressModal) progressModal.update(pct, status);
            });

            const zipName = `convertcraft_batch_${ext}_${Date.now()}.zip`;
            engine.triggerDownload(zipBlob, zipName);

            if (window.UIHelpers) {
              window.UIHelpers.showToast('Success!', `Downloaded ${total} converted images in ${zipName}`, 'success');
            }
          }
        }
      } catch (err) {
        console.error('[Conversion Error]:', err);
        if (window.UIHelpers) {
          window.UIHelpers.showToast('Conversion Failed', err.message || 'An unexpected error occurred during conversion.', 'error');
        }
      } finally {
        if (progressModal) progressModal.close();
        state.isProcessing = false;
        if (convertBtn) convertBtn.disabled = false;
      }
    });
  }
});
