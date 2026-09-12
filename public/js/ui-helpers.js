/**
 * ConvertCraft - UI Helpers & Interface Utilities
 * Handles toasts, modals, mobile drawer, dropdowns, and drag-and-drop reordering.
 */

// --- Format Bytes Utility ---
function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// --- Toast Notification System ---
function getOrCreateToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Display an interactive toast message
 * @param {string} title
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration
 */
function showToast(title, message, type = 'info', duration = 4000) {
  const container = getOrCreateToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // SVG Icons based on type
  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  };

  toast.innerHTML = `
    ${icons[type] || icons.info}
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" aria-label="Close notification">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const removeToast = () => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 250);
  };

  closeBtn.addEventListener('click', removeToast);

  let timer = setTimeout(removeToast, duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => {
    timer = setTimeout(removeToast, 2000);
  });

  container.appendChild(toast);
}

// --- HTML Escaping Helper ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Progress Modal Controller ---
let currentProgressModal = null;

function showProgressModal(title = 'Converting Assets...', initialStatus = 'Preparing images...') {
  hideProgressModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'active-progress-modal';

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="progress-spinner-wrap">
        <div class="spinner-circle"></div>
      </div>
      <h3 class="modal-title" id="modal-title-text">${escapeHtml(title)}</h3>
      <p class="modal-status-text" id="modal-status-text">${escapeHtml(initialStatus)}</p>
      <div class="progress-track">
        <div class="progress-bar" id="modal-progress-bar" style="width: 0%"></div>
      </div>
      <div class="modal-percentage" id="modal-percentage-text">0%</div>
    </div>
  `;

  document.body.appendChild(overlay);
  currentProgressModal = overlay;

  return {
    update: (percent, statusText) => {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      const pBar = overlay.querySelector('#modal-progress-bar');
      const pText = overlay.querySelector('#modal-percentage-text');
      const sText = overlay.querySelector('#modal-status-text');

      if (pBar) pBar.style.width = `${p}%`;
      if (pText) pText.textContent = `${p}%`;
      if (sText && statusText) sText.textContent = statusText;
    },
    close: hideProgressModal
  };
}

function hideProgressModal() {
  if (currentProgressModal && currentProgressModal.parentNode) {
    currentProgressModal.classList.remove('active');
    setTimeout(() => {
      if (currentProgressModal && currentProgressModal.parentNode) {
        currentProgressModal.parentNode.removeChild(currentProgressModal);
      }
      currentProgressModal = null;
    }, 200);
  }
}

// --- Navigation & Dropdown Management ---
function initMobileNav() {
  const hamburger = document.querySelector('.hamburger-btn');
  const drawer = document.querySelector('.mobile-drawer');
  const overlay = document.querySelector('.drawer-overlay');
  const closeBtn = document.querySelector('.mobile-drawer-close');

  if (!hamburger || !drawer || !overlay) return;

  const openDrawer = () => {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  };

  hamburger.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // Close when pressing Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });
}

function initDropdowns() {
  const dropdowns = document.querySelectorAll('.nav-dropdown');

  dropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector('.dropdown-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      dropdowns.forEach((d) => d.classList.remove('open'));
      if (!isOpen) dropdown.classList.add('open');
    });
  });

  // Click outside to close
  document.addEventListener('click', () => {
    dropdowns.forEach((d) => d.classList.remove('open'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdowns.forEach((d) => d.classList.remove('open'));
    }
  });
}

// --- FAQ Accordion Logic ---
function initFaqAccordions() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const questionBtn = item.querySelector('.faq-question');
    if (!questionBtn) return;

    questionBtn.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      // Collapse other items
      faqItems.forEach((i) => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

// --- Drag-and-Drop Reordering for Image Grid Cards ---
function setupDragAndDropReorder(containerEl, onReorderCallback) {
  let draggedEl = null;

  containerEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.image-card');
    if (!card) return;
    draggedEl = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });

  containerEl.addEventListener('dragend', (e) => {
    const card = e.target.closest('.image-card');
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.image-card').forEach((c) => c.classList.remove('drag-over'));
    draggedEl = null;

    // Collect new order IDs and fire callback
    if (typeof onReorderCallback === 'function') {
      const currentCards = Array.from(containerEl.querySelectorAll('.image-card'));
      const newOrder = currentCards.map((c) => c.dataset.id);
      onReorderCallback(newOrder);
    }
  });

  containerEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetCard = e.target.closest('.image-card');
    if (targetCard && targetCard !== draggedEl) {
      document.querySelectorAll('.image-card').forEach((c) => c.classList.remove('drag-over'));
      targetCard.classList.add('drag-over');
    }
  });

  containerEl.addEventListener('dragleave', (e) => {
    const targetCard = e.target.closest('.image-card');
    if (targetCard && !targetCard.contains(e.relatedTarget)) {
      targetCard.classList.remove('drag-over');
    }
  });

  containerEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetCard = e.target.closest('.image-card');
    if (targetCard && draggedEl && targetCard !== draggedEl) {
      targetCard.classList.remove('drag-over');

      // Determine insert position (before or after)
      const rect = targetCard.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        containerEl.insertBefore(draggedEl, targetCard);
      } else {
        containerEl.insertBefore(draggedEl, targetCard.nextSibling);
      }
    }
  });
}

// --- Page Configuration Reader ---
function getPageConfig() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetParam = urlParams.get('target');
  const bodyTarget = document.body.dataset.targetFormat;

  return {
    targetFormat: (targetParam || bodyTarget || 'pdf').toLowerCase()
  };
}

// Export to window
window.UIHelpers = {
  formatBytes,
  showToast,
  showProgressModal,
  hideProgressModal,
  initMobileNav,
  initDropdowns,
  initFaqAccordions,
  setupDragAndDropReorder,
  getPageConfig
};
