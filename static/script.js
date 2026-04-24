document.addEventListener('DOMContentLoaded', function() {
  const addWantedLengthButton = document.getElementById('add-wanted-length');
  const addMeasuredLengthButton = document.getElementById('add-measured-length');
  const wantedLengthsContainer = document.getElementById('wanted-lengths-container');
  const measuredLengthsContainer = document.getElementById('measured-lengths-container');
  const resultsDisplay = document.getElementById('results');

  // Barcode Scanner Setup
  const toggleScannerButton = document.getElementById('toggle-barcode-scanner');
  const closeScannerButton = document.getElementById('close-scanner');
  const barcodeInput = document.getElementById('barcode-input');
  const scannerContainer = document.getElementById('barcode-scanner-container');
  const scannerStatus = document.getElementById('scanner-status');
  let barcodeStream = null;

  // GS1-128 Parser for Norwegian timber barcodes
  function parseGS1_128Barcode(barcode) {
    // Remove FNC1 characters (represented as ~)
    barcode = barcode.replace(/[~]/g, '');
    
    // Extract different Application Identifiers (AI)
    const result = {
      gtin: null,
      length: null,
      weight: null,
      raw: barcode
    };

    // Pattern matching for common AI codes
    const patterns = [
      // AI 3104: Length (for variable-length products) - 3 digits
      { pattern: /3104(\d{3})/, extractor: (m) => parseFloat(m[1]) / 10 },
      // AI 3103: Net weight - 6 digits
      { pattern: /3103(\d{6})/, extractor: (m) => parseFloat(m[1]) / 1000 },
      // AI 01: GTIN-14
      { pattern: /^01(\d{14})/, extractor: (m) => m[1] },
      // Norwegian timber format: might have length encoded in last digits
      // Format: [AI][value] where length might be in mm in last 4 digits
      { pattern: /(\d{4,6})$/, extractor: (m) => parseFloat(m[1]) / 10 }
    ];

    for (const rule of patterns) {
      const match = barcode.match(rule.pattern);
      if (match) {
        if (rule.pattern.source.includes('3104')) {
          result.length = rule.extractor(match);
          return result; // GS1 compliant format found
        } else if (rule.pattern.source.includes('3103')) {
          result.weight = rule.extractor(match);
        } else if (rule.pattern.source.includes('01')) {
          result.gtin = rule.extractor(match);
        }
      }
    }

    // If no AI found, try simple numeric extraction (fallback for Norwegian format)
    if (!result.length && /^\d+$/.test(barcode)) {
      // Extract potential length from barcode
      // Common format: first part is GTIN, last 3-4 digits might be length in cm*10
      const lengthPart = barcode.slice(-4);
      if (/^\d+$/.test(lengthPart)) {
        const potentialLength = parseFloat(lengthPart) / 10;
        if (potentialLength > 10 && potentialLength < 1000) {
          result.length = potentialLength;
        }
      }
    }

    return result;
  }

  // Start barcode camera scanning
  toggleScannerButton.addEventListener('click', async function() {
    try {
      const video = document.getElementById('barcode-video');
      if (!barcodeStream) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        video.srcObject = stream;
        barcodeStream = stream;
        scannerContainer.style.display = 'block';
        scannerStatus.textContent = 'Camera active - scanning for barcodes...';
        startBarcodeDetection(video);
      }
    } catch (err) {
      scannerStatus.textContent = '❌ Camera access denied. Use manual input below.';
      console.error('Camera error:', err);
    }
  });

  closeScannerButton.addEventListener('click', function() {
    if (barcodeStream) {
      barcodeStream.getTracks().forEach(track => track.stop());
      barcodeStream = null;
    }
    scannerContainer.style.display = 'none';
    scannerStatus.textContent = 'Scanner closed';
  });

  // Simple barcode detection using Canvas
  function startBarcodeDetection(video) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const detectionInterval = setInterval(() => {
      if (!barcodeStream) {
        clearInterval(detectionInterval);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // This would require a barcode library. For now, use manual input fallback
    }, 500);
  }

  // Handle manual barcode input (text input or paste)
  barcodeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const barcode = barcodeInput.value.trim();
      if (barcode) {
        processBarcodeInput(barcode);
        barcodeInput.value = '';
      }
    }
  });

  // Manual paste handling
  barcodeInput.addEventListener('paste', function(e) {
    setTimeout(() => {
      const barcode = barcodeInput.value.trim();
      if (barcode) {
        processBarcodeInput(barcode);
        barcodeInput.value = '';
      }
    }, 10);
  });

  function processBarcodeInput(barcode) {
    const parsed = parseGS1_128Barcode(barcode);
    
    if (parsed.length && parsed.length > 0) {
      // Auto-add measured length
      const inputGroup = document.createElement('div');
      inputGroup.className = 'input-group';
      
      const lengthInput = document.createElement('input');
      lengthInput.type = 'number';
      lengthInput.step = '0.01';
      lengthInput.className = 'measured-length';
      lengthInput.value = parsed.length.toFixed(2);
      lengthInput.style.width = '15ch';
      
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.step = '1';
      quantityInput.className = 'measured-quantity';
      quantityInput.value = '1';
      quantityInput.style.width = '8ch';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.className = 'secondary-btn';
      deleteBtn.style.padding = '5px 10px';
      deleteBtn.addEventListener('click', function() {
        inputGroup.remove();
        sendDataToBackend();
      });
      
      inputGroup.appendChild(lengthInput);
      inputGroup.appendChild(quantityInput);
      inputGroup.appendChild(deleteBtn);
      
      measuredLengthsContainer.appendChild(inputGroup);
      
      scannerStatus.textContent = `✓ Added: ${parsed.length.toFixed(2)} cm (Barcode: ${barcode})`;
      
      // Auto-trigger calculation
      lengthInput.addEventListener('input', sendDataToBackend);
      quantityInput.addEventListener('input', sendDataToBackend);
      sendDataToBackend();
    } else {
      scannerStatus.textContent = '❌ Could not extract length from barcode. Format not recognized.';
    }
  }

  addWantedLengthButton.addEventListener('click', function() {
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group';
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.step = '0.01';
    lengthInput.className = 'wanted-length';
    lengthInput.placeholder = `Enter wanted length #${wantedLengthsContainer.children.length + 1}`;
    lengthInput.style.width = '15ch';
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.step = '1';
    quantityInput.className = 'wanted-quantity';
    quantityInput.placeholder = `Enter quantity #${wantedLengthsContainer.children.length + 1}`;
    quantityInput.style.width = '8ch';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.className = 'secondary-btn';
    deleteBtn.style.padding = '5px 10px';
    deleteBtn.addEventListener('click', function() {
      inputGroup.remove();
      sendDataToBackend();
    });
    inputGroup.appendChild(lengthInput);
    inputGroup.appendChild(quantityInput);
    inputGroup.appendChild(deleteBtn);
    wantedLengthsContainer.appendChild(inputGroup);
    lengthInput.addEventListener('input', sendDataToBackend);
    quantityInput.addEventListener('input', sendDataToBackend);
  });

  addMeasuredLengthButton.addEventListener('click', function() {
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group';
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.step = '0.01';
    lengthInput.className = 'measured-length';
    lengthInput.placeholder = `Enter measured length #${measuredLengthsContainer.children.length + 1}`;
    lengthInput.style.width = '15ch';
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.step = '1';
    quantityInput.className = 'measured-quantity';
    quantityInput.placeholder = `Enter quantity #${measuredLengthsContainer.children.length + 1}`;
    quantityInput.style.width = '8ch';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.className = 'secondary-btn';
    deleteBtn.style.padding = '5px 10px';
    deleteBtn.addEventListener('click', function() {
      inputGroup.remove();
      sendDataToBackend();
    });
    inputGroup.appendChild(lengthInput);
    inputGroup.appendChild(quantityInput);
    inputGroup.appendChild(deleteBtn);
    measuredLengthsContainer.appendChild(inputGroup);
    lengthInput.addEventListener('input', sendDataToBackend);
    quantityInput.addEventListener('input', sendDataToBackend);
  });

  function getInputs() {
    const wantedLengths = [];
    const measuredLengths = [];
    const wantedLengthInputs = document.getElementsByClassName('wanted-length');
    const wantedQuantityInputs = document.getElementsByClassName('wanted-quantity');
    const measuredLengthInputs = document.getElementsByClassName('measured-length');
    const measuredQuantityInputs = document.getElementsByClassName('measured-quantity');

    for (let i = 0; i < wantedLengthInputs.length; i++) {
      const length = parseFloat(wantedLengthInputs[i].value);
      const quantity = parseInt(wantedQuantityInputs[i].value);
      if (!isNaN(length) && !isNaN(quantity)) {
        for (let j = 0; j < quantity; j++) {
          wantedLengths.push(length);
        }
      }
    }

    for (let i = 0; i < measuredLengthInputs.length; i++) {
      const length = parseFloat(measuredLengthInputs[i].value);
      const quantity = parseInt(measuredQuantityInputs[i].value);
      if (!isNaN(length) && !isNaN(quantity)) {
        for (let j = 0; j < quantity; j++) {
          measuredLengths.push(length);
        }
      }
    }

    const bladeWidth = parseFloat(document.getElementById('blade-width').value);
    return {
      wanted_lengths: wantedLengths,
      measured_lengths: measuredLengths,
      blade_width: isNaN(bladeWidth) ? 0.6 : bladeWidth
    };
  }

  function sendDataToBackend() {
    const data = getInputs();
    const totalWanted = data.wanted_lengths.reduce((sum, val) => sum + val, 0);
    const totalMeasured = data.measured_lengths.reduce((sum, val) => sum + val, 0);

    if (data.wanted_lengths.length === 0) {
      resultsDisplay.innerHTML = '<p>Please enter at least one wanted length.</p>';
      return;
    }
    if (data.measured_lengths.length === 0) {
      resultsDisplay.innerHTML = '<p>Please enter at least one measured stock length.</p>';
      return;
    }
    if (totalMeasured < totalWanted) {
      resultsDisplay.innerHTML = `<p>Waiting for more measured stock. Total wanted: ${totalWanted.toFixed(2)}, total measured: ${totalMeasured.toFixed(2)}.</p>`;
      return;
    }

    fetch('/calculate_cuts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(cutData => {
      displayResults(cutData);
    })
    .catch(error => {
      resultsDisplay.innerHTML = '<p>Error calculating cuts. Please try again.</p>';
      console.error('Error:', error);
    });
  }

  function displayResults(data) {
    if (data.error) {
      resultsDisplay.innerHTML = `<p>${data.error}</p>`;
      return;
    }

    let html = '<h2>Cutting Plan</h2>';
    html += `<p><strong>Number of wanted lengths:</strong> ${document.getElementsByClassName('wanted-length').length}</p>`;
    html += `<p><strong>Number of measured stock lengths:</strong> ${document.getElementsByClassName('measured-length').length}</p>`;

    data.forEach((stock, index) => {
      html += `<div class="stock-item stock-used">`;
      html += `<h3>Stock ${index + 1}</h3>`;
      html += `<p>Original Length: ${stock.original_length.toFixed(2)} cm</p>`;
      html += `<p>Remaining Length: ${stock.remaining_length.toFixed(2)} cm</p>`;
      html += '<ul>';
      stock.cuts.forEach(cut => {
        html += `<li>${cut.toFixed(2)} cm</li>`;
      });
      html += '</ul>';
      html += '</div>';
    });

    resultsDisplay.innerHTML = html;
  }

  wantedLengthsContainer.addEventListener('input', sendDataToBackend);
  measuredLengthsContainer.addEventListener('input', sendDataToBackend);
  document.getElementById('blade-width').addEventListener('input', sendDataToBackend);
});
