document.addEventListener('DOMContentLoaded', function () {
  const addWantedLengthButton    = document.getElementById('add-wanted-length');
  const addMeasuredLengthButton  = document.getElementById('add-measured-length');
  const wantedLengthsContainer   = document.getElementById('wanted-lengths-container');
  const measuredLengthsContainer = document.getElementById('measured-lengths-container');
  const resultsDisplay           = document.getElementById('results');
  const resultsHeader            = document.getElementById('results-header');
  const startCameraBtn           = document.getElementById('start-camera-btn');
  const closeCameraBtn           = document.getElementById('close-camera-btn');
  const closeCameraModalBtn      = document.getElementById('close-camera-modal-btn');
  const cameraModal              = document.getElementById('camera-modal');
  const cameraStatus             = document.getElementById('camera-status');
  const scanResult               = document.getElementById('scan-result');
  const cameraSelectWrapper      = document.getElementById('camera-select-wrapper');
  const cameraSelect             = document.getElementById('camera-select');
  const bladeWidthInput          = document.getElementById('blade-width');
  const unitPriceInput           = document.getElementById('stock-unit-price');
  const suggestionsSection       = document.getElementById('suggestions-section');
  const suggestionsContainer     = document.getElementById('suggestions-container');
  const exportPdfBtn             = document.getElementById('export-pdf-btn');

  // Warn about missing elements but don't abort – core functionality still works
  const required = {
    addWantedLengthButton, addMeasuredLengthButton, wantedLengthsContainer,
    measuredLengthsContainer, resultsDisplay, bladeWidthInput, unitPriceInput
  };
  for (const [name, el] of Object.entries(required)) {
    if (!el) { console.error(`Manglende kjerne-element: #${name}`); return; }
  }
  // Optional elements – warn but continue
  const optional = {
    startCameraBtn, closeCameraBtn, closeCameraModalBtn,
    cameraModal, cameraStatus, scanResult, cameraSelectWrapper, cameraSelect,
    suggestionsSection, suggestionsContainer, exportPdfBtn, resultsHeader
  };
  for (const [name, el] of Object.entries(optional)) {
    if (!el) { console.warn(`Valgfritt element mangler: #${name}`); }
  }

  let scannedBarcodes = [];
  let mediaStream = null;
  let scanLoop = null;
  let barcodeDetector = null;
  let lastScanned = null;
  let lastCutData = null;   // Store last results for PDF export
  let debounceTimer = null;

  addWantedLengthButton.addEventListener('click', () => addInputGroup('wanted'));
  addMeasuredLengthButton.addEventListener('click', () => addInputGroup('measured'));
  if (startCameraBtn) startCameraBtn.addEventListener('click', initializeCamera);
  if (closeCameraBtn) closeCameraBtn.addEventListener('click', closeCamera);
  if (closeCameraModalBtn) closeCameraModalBtn.addEventListener('click', closeCamera);

  // FIXED: also listen to unitPriceInput changes
  wantedLengthsContainer.addEventListener('input', debouncedSend);
  measuredLengthsContainer.addEventListener('input', debouncedSend);
  bladeWidthInput.addEventListener('input', debouncedSend);
  unitPriceInput.addEventListener('input', debouncedSend);

  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPdf);

  // Debounce to avoid too many API calls while typing
  function debouncedSend() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendDataToBackend, 400);
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  function setStatus(text, ok) {
    cameraStatus.textContent = text;
    cameraStatus.style.backgroundColor = ok ? '#e8f5e9' : '#ffebee';
    cameraStatus.style.color = ok ? '#2e7d32' : '#c62828';
  }

  async function startStream(constraints) {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (scanLoop) { cancelAnimationFrame(scanLoop); scanLoop = null; }

    const video = document.getElementById('camera-video');
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    video.srcObject = mediaStream;
    await video.play();
    setStatus('Kamera aktivt – rett mot strekkoden', true);
    scheduleScan(video);
  }

  function scheduleScan(video) {
    const canvas = document.getElementById('scan-canvas');
    const ctx = canvas.getContext('2d');

    async function tick() {
      if (!mediaStream) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          if (!barcodeDetector) return;
          const results = await barcodeDetector.detect(canvas);
          if (results.length > 0) {
            const code = results[0].rawValue;
            if (code !== lastScanned) { lastScanned = code; handleBarcodeResult(code); }
          }
        } catch (e) { /* silent */ }
      }
      scanLoop = requestAnimationFrame(tick);
    }
    scanLoop = requestAnimationFrame(tick);
  }

  async function initializeCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Feil: Nettleseren støtter ikke kamera. Bruk Chrome/Edge over HTTPS.', false);
      cameraModal.classList.add('active');
      return;
    }
    if (!('BarcodeDetector' in window)) {
      setStatus('Feil: BarcodeDetector støttes ikke i denne nettleseren. Bruk Chrome/Edge på Android.', false);
      cameraModal.classList.add('active');
      return;
    }

    barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
    cameraModal.classList.add('active');
    scanResult.textContent = '';
    lastScanned = null;
    setStatus('Initialiserer kamera...', true);

    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' } }, audio: false
      }).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      tempStream.getTracks().forEach(t => t.stop());

      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');

      if (devices.length > 1) {
        cameraSelect.innerHTML = '';
        devices.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Kamera ${d.deviceId.substring(0, 8)}`;
          cameraSelect.appendChild(opt);
        });
        const rear = devices.find(d => /back|bak|rear|environment/i.test(d.label));
        cameraSelect.value = rear ? rear.deviceId : devices[0].deviceId;
        cameraSelectWrapper.style.display = 'block';
        cameraSelect.onchange = () =>
          startStream({ deviceId: { exact: cameraSelect.value } }).catch(err =>
            setStatus('Feil ved kamerabytte: ' + err.message, false));
        await startStream({ deviceId: { exact: cameraSelect.value } });
      } else {
        cameraSelectWrapper.style.display = 'none';
        await startStream({ facingMode: { exact: 'environment' } });
      }
    } catch (err) {
      setStatus('Feil: ' + (err.message || err), false);
    }
  }

  function closeCamera() {
    if (scanLoop) { cancelAnimationFrame(scanLoop); scanLoop = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    const video = document.getElementById('camera-video');
    if (video) video.srcObject = null;
    cameraModal.classList.remove('active');
    cameraSelectWrapper.style.display = 'none';
    cameraStatus.textContent = '';
    scanResult.textContent = '';
    lastScanned = null;
  }

  function handleBarcodeResult(barcode) {
    fetch('/parse_barcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode })
    })
    .then(r => r.json())
    .then(parsed => {
      if (!parsed.valid) {
        scanResult.textContent = '❌ Ugyldig strekkode: ' + barcode + ' – ' + (parsed.error || 'ukjent format');
        scanResult.style.backgroundColor = '#ffebee';
        scanResult.style.color = '#c62828';
        return;
      }
      const entry = {
        barcode: parsed.barcode,
        length: parsed.length_cm,
        producer: parsed.producer || '',
        timestamp: new Date().toLocaleTimeString('nb-NO'),
        date: new Date().toLocaleDateString('nb-NO')
      };
      scanResult.textContent = `✓ Skannet: ${entry.length.toFixed(1)} cm`;
      scanResult.style.backgroundColor = '#c8e6c9';
      scanResult.style.color = '#2e7d32';
      scannedBarcodes.push(entry);
      addScannedBarcodeToMeasured(entry);
      sendDataToBackend();
      setTimeout(() => closeCamera(), 2000);
    })
    .catch(err => {
      scanResult.textContent = '❌ Feil ved kommunikasjon med server';
      scanResult.style.backgroundColor = '#ffebee';
      scanResult.style.color = '#c62828';
      console.error(err);
    });
  }

  // ── Input helpers ────────────────────────────────────────────────────────────

  function addInputGroup(type) {
    const container = type === 'wanted' ? wantedLengthsContainer : measuredLengthsContainer;
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group';

    const lengthInput = document.createElement('input');
    lengthInput.type = 'number'; lengthInput.step = '1';
    lengthInput.className = `${type}-length`;
    lengthInput.placeholder = 'Lengde (cm)'; lengthInput.style.width = '12ch';

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number'; quantityInput.step = '1';
    quantityInput.value = '1'; quantityInput.className = `${type}-quantity`;
    quantityInput.placeholder = 'Antall'; quantityInput.style.width = '8ch';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn'; removeButton.textContent = 'Fjern';
    removeButton.onclick = () => { inputGroup.remove(); sendDataToBackend(); };

    inputGroup.appendChild(lengthInput);
    inputGroup.appendChild(quantityInput);
    inputGroup.appendChild(removeButton);
    container.appendChild(inputGroup);
    lengthInput.focus();
  }

  function getInputs() {
    const wantedLengths = [];
    const measuredLengths = [];
    const bladeWidth = parseFloat(bladeWidthInput.value);
    const unitPrice  = parseFloat(unitPriceInput.value);

    document.querySelectorAll('.wanted-length').forEach(el => {
      const length = parseFloat(el.value);
      const qty = parseInt(el.parentElement.querySelector('.wanted-quantity')?.value) || 1;
      if (!isNaN(length) && qty > 0) for (let j = 0; j < qty; j++) wantedLengths.push(length);
    });

    document.querySelectorAll('.measured-length').forEach(el => {
      const length = parseFloat(el.value);
      const qty = parseInt(el.parentElement.querySelector('.measured-quantity')?.value) || 1;
      if (!isNaN(length) && qty > 0) for (let j = 0; j < qty; j++) measuredLengths.push(length);
    });

    updateWantedTotalLength(wantedLengths);
    return {
      wanted_lengths: wantedLengths,
      measured_lengths: measuredLengths,
      blade_width: isNaN(bladeWidth) ? 0.3 : bladeWidth,
      unit_price: isNaN(unitPrice) ? 0 : unitPrice
    };
  }

  function updateWantedTotalLength(wantedLengths) {
    const total = wantedLengths.reduce((a, b) => a + b, 0);
    const el = document.getElementById('wanted-total-length');
    if (el) el.textContent = total > 0
      ? `Total ønsket: ${total.toFixed(1)} cm  (${(total/100).toFixed(2)} m)`
      : '';
  }

  // ── Suggestions ──────────────────────────────────────────────────────────────

  function fetchSuggestions(wantedLengths, measuredLengths, bladeWidth) {
    if (wantedLengths.length === 0) {
      if (suggestionsSection) suggestionsSection.style.display = 'none';
      return;
    }
    fetch('/suggest_lengths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wanted_lengths: wantedLengths,
        measured_lengths: measuredLengths,
        blade_width: bladeWidth
      })
    })
    .then(r => r.json())
    .then(data => {
      if (suggestionsSection) suggestionsSection.style.display = 'block';

      if (data.all_covered) {
        renderSuggestionsCovered();
        return;
      }
      if (!data.suggestions || data.suggestions.length === 0) {
        if (suggestionsSection) suggestionsSection.style.display = 'none';
        return;
      }
      renderSuggestions(data.suggestions, data.remaining_wanted || [], measuredLengths);
    })
    .catch(() => { if (suggestionsSection) suggestionsSection.style.display = 'none'; });
  }

  function renderSuggestionsCovered() {
    if (!suggestionsContainer) return;
    suggestionsContainer.innerHTML = `
      <div class="suggestions-covered">
        ✅ Alle ønskede lengder er dekket av registrerte planker!
      </div>`;
  }

  function renderSuggestions(suggestions, remainingWanted, measuredLengths) {
    if (!suggestionsContainer) return;
    suggestionsContainer.innerHTML = '';

    // Status header when measured boards are registered
    if (measuredLengths.length > 0 && remainingWanted.length > 0) {
      const totalRem = remainingWanted.reduce((a, b) => a + b, 0);
      const statusEl = document.createElement('div');
      statusEl.className = 'suggestions-status';
      statusEl.innerHTML = `📏 Gjenstående behov: <strong>${remainingWanted.length} biter</strong>
        (${totalRem.toFixed(1)} cm) – forslag inkluderer allerede målte planker:`;
      suggestionsContainer.appendChild(statusEl);
    }

    suggestions.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'suggestion-card' + (i === 0 ? ' best' : '');
      const badge = i === 0 ? '<span class="best-badge">✅ Beste valg</span>' : '';

      const hasMeasured = s.num_measured_used > 0;
      const measuredInfo = hasMeasured
        ? `<span>📐 Bruker ${s.num_measured_used} målte planke${s.num_measured_used !== 1 ? 'r' : ''}</span>`
        : '';

      const boardsLabel = s.num_boards === 0
        ? '<span>🛒 Ingen nye planker nødvendig</span>'
        : `<span>🛒 Kjøp: ${s.num_boards} × ${s.length_cm} cm</span>`;

      card.innerHTML = `
        ${badge}
        ${s.num_boards > 0
          ? `<div class="suggestion-length">${s.length_cm} cm</div>`
          : `<div class="suggestion-length" style="font-size:1rem">Alt dekket!</div>`
        }
        <div class="suggestion-stats">
          ${boardsLabel}
          ${measuredInfo}
          <span>🗑️ Svinn: ${s.waste_pct}%</span>
          <span>📐 Avkapp: ${s.total_waste_cm} cm</span>
          <span>📏 Totalt material: ${s.total_material_cm} cm</span>
        </div>
      `;
      suggestionsContainer.appendChild(card);
    });
  }

  // ── Main calculation ──────────────────────────────────────────────────────────

  function sendDataToBackend() {
    const data = getInputs();

    // Recalculate suggestions whenever wanted OR measured lengths change
    fetchSuggestions(data.wanted_lengths, data.measured_lengths, data.blade_width);

    if (data.wanted_lengths.length === 0 || data.measured_lengths.length === 0) {
      resultsDisplay.innerHTML = '';
      if (resultsHeader) resultsHeader.style.display = 'none';
      lastCutData = null;
      return;
    }

    fetch('/calculate_cuts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(cutData => {
      if (cutData.error) {
        resultsDisplay.innerHTML = `<div class="error-msg">⚠️ ${cutData.error}</div>`;
        if (resultsHeader) resultsHeader.style.display = 'none';
        if (suggestionsSection) suggestionsSection.style.display = 'block';
        lastCutData = null;
        return Promise.reject(null);
      }
      lastCutData = { ...cutData, blade_width: data.blade_width, unit_price: data.unit_price };
      displayResults(cutData, data.unit_price);
      if (resultsHeader) resultsHeader.style.display = 'flex';
      // Hide suggestions when a valid cutting plan exists
      if (suggestionsSection) suggestionsSection.style.display = 'none';
      return fetch('/visualize_cuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: cutData.results, blade_width: data.blade_width })
      });
    })
    .then(r => r.json())
    .then(imageData => {
      imageData.images.forEach((imgData, i) => {
        const placeholder = document.querySelector(`.stock-img-placeholder[data-index="${i}"]`);
        if (!placeholder) return;
        const img = document.createElement('img');
        img.src = 'data:image/png;base64,' + imgData;
        img.alt = `Planke ${i + 1}`;
        placeholder.replaceWith(img);
      });
    })
    .catch(err => {
      if (err === null) return;
      resultsDisplay.innerHTML = `<div class="error-msg">⚠️ Kan ikke kalkulere – legg til flere målte lengder.</div>`;
      console.error(err);
    });
  }

  function displayResults(data, unitPrice) {
    let html = '';

    // Summary box
    html += `<div class="summary-box">
      <div class="summary-item"><span>📏 Ønsket</span><strong>${data.total_wanted.toFixed(1)} cm</strong></div>
      <div class="summary-item"><span>📦 Målt</span><strong>${data.total_measured.toFixed(1)} cm</strong></div>
      <div class="summary-item"><span>✂️ Brukt</span><strong>${data.total_used.toFixed(1)} cm</strong></div>
      <div class="summary-item"><span>🗑️ Svinn</span><strong>${data.total_waste.toFixed(1)} cm</strong></div>
      <div class="summary-item"><span>💰 Totalpris</span><strong>kr ${data.total_price.toFixed(2)}</strong></div>
      <div class="summary-item"><span>💸 Svinn-kostnad</span><strong>kr ${data.waste_price.toFixed(2)}</strong></div>
    </div>`;

    data.results.forEach((stock, index) => {
      const isUnused = stock.unused === true;
      let cutsHtml = '';
      stock.cuts.forEach((cut, ci) => {
        cutsHtml += `<li><span class="cut-num">#${ci + 1}</span> ${cut.toFixed(1)} cm</li>`;
      });

      const unusedBadge = isUnused ? '<span class="unused-badge">Ikke i bruk</span>' : '';
      const statsHtml = isUnused
        ? `<div class="stock-stats"><span>📏 Hele planken er ubrukt</span></div>`
        : `<div class="stock-stats">
            <span>✂️ Kutt: ${stock.cuts.length}</span>
            <span>🗑️ Avkapp: ${stock.remaining_length.toFixed(1)} cm</span>
           </div>
           <ul>${cutsHtml}</ul>`;

      html += `<div class="stock-item${isUnused ? ' stock-unused' : ''}">
        <h3>Planke ${index + 1} – ${stock.original_length.toFixed(1)} cm ${unusedBadge}</h3>
        <div class="stock-img-placeholder" data-index="${index}"></div>
        ${statsHtml}
      </div>`;
    });

    resultsDisplay.innerHTML = html;
  }

  // ── PDF Export ────────────────────────────────────────────────────────────────

  function exportPdf() {
    if (!lastCutData || !exportPdfBtn) return;
    exportPdfBtn.textContent = '⏳ Genererer PDF...';
    exportPdfBtn.disabled = true;

    fetch('/export_pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastCutData)
    })
    .then(r => {
      if (!r.ok) throw new Error('PDF-feil');
      return r.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kuttplan_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(err => {
      alert('Feil ved generering av PDF: ' + err.message);
    })
    .finally(() => {
      exportPdfBtn.textContent = '📄 Last ned PDF';
      exportPdfBtn.disabled = false;
    });
  }

  // ── Barcode list ──────────────────────────────────────────────────────────────



  function addScannedBarcodeToMeasured(parsed) {
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group';
    inputGroup.dataset.scanned = 'true';
    inputGroup.dataset.barcodeId = parsed.barcode;

    const lengthInput = document.createElement('input');
    lengthInput.type = 'number'; lengthInput.step = '0.1';
    lengthInput.className = 'measured-length';
    lengthInput.placeholder = 'Lengde (cm)';
    lengthInput.value = parsed.length.toFixed(1);
    lengthInput.readOnly = true;
    lengthInput.style.width = '12ch';
    lengthInput.style.backgroundColor = '#e8f5e9';

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number'; quantityInput.step = '1';
    quantityInput.value = '1'; quantityInput.className = 'measured-quantity';
    quantityInput.placeholder = 'Antall'; quantityInput.style.width = '8ch';

    const barcodeDisplay = document.createElement('span');
    barcodeDisplay.style.cssText = 'font-size:0.8em; color:#666; margin-left:6px;';
    barcodeDisplay.textContent = `(${parsed.barcode})`;

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn'; removeButton.textContent = 'Fjern';
    removeButton.onclick = () => { inputGroup.remove(); sendDataToBackend(); };

    inputGroup.appendChild(lengthInput);
    inputGroup.appendChild(quantityInput);
    inputGroup.appendChild(barcodeDisplay);
    inputGroup.appendChild(removeButton);
    measuredLengthsContainer.appendChild(inputGroup);
  }

  // Expose sendDataToBackend for inline onclick handlers
  window.sendDataToBackend = sendDataToBackend;
});
