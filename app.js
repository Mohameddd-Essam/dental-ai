/**
 * Oral Diagnostics AI — app.js
 * Handles: file selection, drag-and-drop, preview,
 *          API call to FastAPI /predict, count-up animation,
 *          SVG ring progress, toast notifications.
 */

/* ══════════════════════════════════════════
   Constants & element references
══════════════════════════════════════════ */
const API_URL = 'http://127.0.0.1:8000/predict';

const dropzone       = document.getElementById('dropzone');
const dropzoneInner  = document.getElementById('dropzoneInner');
const fileInput      = document.getElementById('fileInput');
const previewImg     = document.getElementById('previewImg');
const previewOverlay = document.getElementById('previewOverlay');
const changeBtn      = document.getElementById('changeBtn');

const analyzeBtn     = document.getElementById('analyzeBtn');
const analyzeBtnText = document.getElementById('analyzeBtnText');
const clearBtn       = document.getElementById('clearBtn');

const confidenceValue = document.getElementById('confidenceValue');
const ringFill        = document.getElementById('ringFill');
const diseaseName     = document.getElementById('diseaseName');
const diseaseCard     = document.getElementById('diseaseCard');

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const toast = document.getElementById('toast');

/* Ring geometry */
const RING_CIRCUMFERENCE = 515.2; // 2 * π * 82

/* State */
let currentFile  = null;
let toastTimeout = null;
let animFrame    = null;
let scanLineEl   = null;

/* ══════════════════════════════════════════
   Inject SVG gradient definition
══════════════════════════════════════════ */
(function injectSVGDefs() {
  const svg = document.querySelector('.confidence-ring');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#2dd4bf"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  `;
  svg.prepend(defs);
})();

/* ══════════════════════════════════════════
   Dropzone — click to open file dialog
══════════════════════════════════════════ */
dropzone.addEventListener('click', (e) => {
  if (e.target === changeBtn) return;
  fileInput.click();
});

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

changeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    handleFile(fileInput.files[0]);
  }
});

/* ══════════════════════════════════════════
   Drag & Drop
══════════════════════════════════════════ */
dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', (e) => {
  if (!dropzone.contains(e.relatedTarget)) {
    dropzone.classList.remove('drag-over');
  }
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    handleFile(file);
  } else {
    showToast('Please drop a valid image file.', 'error');
  }
});

/* ══════════════════════════════════════════
   File handler — show preview
══════════════════════════════════════════ */
function handleFile(file) {
  currentFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewImg.classList.remove('hidden');
    previewOverlay.classList.remove('hidden');
    dropzoneInner.style.opacity = '0';
    dropzoneInner.style.pointerEvents = 'none';
  };
  reader.readAsDataURL(file);

  analyzeBtn.disabled = false;
  clearBtn.disabled   = false;

  // Reset results
  resetResults();
}

/* ══════════════════════════════════════════
   Clear button
══════════════════════════════════════════ */
clearBtn.addEventListener('click', () => {
  clearAll();
});

function clearAll() {
  currentFile = null;
  fileInput.value = '';

  previewImg.src = '';
  previewImg.classList.add('hidden');
  previewOverlay.classList.add('hidden');
  dropzoneInner.style.opacity = '1';
  dropzoneInner.style.pointerEvents = '';

  analyzeBtn.disabled = true;
  clearBtn.disabled   = true;

  removeScanLine();
  resetResults();
  setStatus('ready');
}

/* ══════════════════════════════════════════
   Reset result panel to zero state
══════════════════════════════════════════ */
function resetResults() {
  cancelAnimationFrame(animFrame);

  // Number display
  setConfidenceDisplay(0.0);

  // Ring
  ringFill.style.strokeDashoffset = RING_CIRCUMFERENCE;

  // Disease name
  diseaseName.textContent = '—';
  diseaseName.classList.remove('has-result');
  diseaseCard.classList.remove('has-result');
}

/* ══════════════════════════════════════════
   Analyze button — send to FastAPI
══════════════════════════════════════════ */
analyzeBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  await runPrediction();
});

async function runPrediction() {
  // UI: loading state
  setLoading(true);
  setStatus('loading', 'Analyzing…');
  addScanLine();

  const formData = new FormData();
  formData.append('file', currentFile);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const confidenceVal = parseFloat(data.confidence) || 0;
    const diseaseLabel  = data.disease || 'Unknown';

    handleResult(diseaseLabel, confidenceVal);
    setStatus('ready', 'Done');
    showToast(`Detected: ${diseaseLabel} (${confidenceVal.toFixed(1)}%)`, 'success');

  } catch (err) {
    console.error('[Oral Diagnostics AI]', err);
    setStatus('error', 'Error');
    showToast(err.message || 'Connection failed. Is the server running?', 'error');
  } finally {
    setLoading(false);
    removeScanLine();
  }
}

/* ══════════════════════════════════════════
   Handle successful prediction result
══════════════════════════════════════════ */
function handleResult(disease, confidence) {
  const confidenceVal = parseFloat(confidence) || 0;
  const diseaseLabel  = disease || 'Unknown';

  // Show disease name
  diseaseName.textContent = diseaseLabel;
  diseaseName.classList.add('has-result');
  diseaseCard.classList.add('has-result');

  // Animate confidence number from 0 → target
  animateConfidence(0, confidenceVal, 1800);
}

/* ══════════════════════════════════════════
   Count-up animation + ring fill
══════════════════════════════════════════ */
function animateConfidence(from, to, duration) {
  cancelAnimationFrame(animFrame);

  const startTime = performance.now();
  const delta = to - from;

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + delta * eased;

    setConfidenceDisplay(current);
    updateRing(current);

    if (progress < 1) {
      animFrame = requestAnimationFrame(step);
    }
  }

  animFrame = requestAnimationFrame(step);
}

function setConfidenceDisplay(value) {
  // Keep only the number text, preserving the % span child
  const percentSpan = confidenceValue.querySelector('.confidence-percent');
  confidenceValue.textContent = value.toFixed(1);
  confidenceValue.appendChild(percentSpan);
}

function updateRing(percent) {
  const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
  ringFill.style.strokeDashoffset = offset;
}

/* ══════════════════════════════════════════
   Scan line animation on image during loading
══════════════════════════════════════════ */
function addScanLine() {
  if (scanLineEl) return;
  scanLineEl = document.createElement('div');
  scanLineEl.className = 'scan-line';
  dropzone.appendChild(scanLineEl);
}

function removeScanLine() {
  if (scanLineEl) {
    scanLineEl.remove();
    scanLineEl = null;
  }
}

/* ══════════════════════════════════════════
   Loading state helpers
══════════════════════════════════════════ */
function setLoading(isLoading) {
  if (isLoading) {
    analyzeBtn.classList.add('loading');
    analyzeBtn.disabled = true;
    clearBtn.disabled   = true;

    // Replace button content with spinner
    analyzeBtnText.textContent = 'Analyzing…';
    let spinner = analyzeBtn.querySelector('.spinner');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.className = 'spinner';
      analyzeBtn.insertBefore(spinner, analyzeBtnText);
    }
    // Hide the SVG icon
    const icon = analyzeBtn.querySelector('svg');
    if (icon) icon.style.display = 'none';

  } else {
    analyzeBtn.classList.remove('loading');
    analyzeBtn.disabled = false;
    clearBtn.disabled   = false;

    analyzeBtnText.textContent = 'Analyze';
    const spinner = analyzeBtn.querySelector('.spinner');
    if (spinner) spinner.remove();
    const icon = analyzeBtn.querySelector('svg');
    if (icon) icon.style.display = '';
  }
}

/* ══════════════════════════════════════════
   Status indicator
══════════════════════════════════════════ */
function setStatus(state, label) {
  statusDot.className = 'status-dot';
  switch (state) {
    case 'loading':
      statusDot.classList.add('loading');
      statusText.textContent = label || 'Analyzing…';
      break;
    case 'error':
      statusDot.classList.add('error');
      statusText.textContent = label || 'Error';
      break;
    default:
      statusText.textContent = label || 'Ready';
  }
}

/* ══════════════════════════════════════════
   Toast notification
══════════════════════════════════════════ */
function showToast(message, type = 'default') {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className   = `toast ${type} show`;

  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 4200);
}
