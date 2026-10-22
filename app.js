document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlInput = document.getElementById('urlInput');
  const clearBtn = document.getElementById('clearBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const exampleBtn = document.getElementById('exampleBtn');

  const fgColor = document.getElementById('fgColor');
  const fgColorText = document.getElementById('fgColorText');
  const bgColor = document.getElementById('bgColor');
  const bgColorText = document.getElementById('bgColorText');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const sizeSelect = document.getElementById('sizeSelect');

  const logoInput = document.getElementById('logoInput');
  const logoUploadText = document.getElementById('logoUploadText');
  const removeLogoBtn = document.getElementById('removeLogoBtn');

  const qrCanvas = document.getElementById('qrCanvas');
  const emptyState = document.getElementById('emptyState');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const hiddenQrHelper = document.getElementById('hiddenQrHelper');
  const toast = document.getElementById('toast');

  let currentLogoImage = null;
  let debounceTimer = null;

  // Toast Helper
  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = isError ? 'toast toast-error show' : 'toast show';
    setTimeout(() => {
      toast.className = 'toast';
    }, 3200);
  }

  // Draw rounded rectangle helper for canvas
  function roundRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    // Fallback for older browsers
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Render QR Code onto Main Canvas
  async function generateQRCode() {
    const text = urlInput.value.trim();
    const size = parseInt(sizeSelect.value, 10) || 512;
    const dark = fgColor.value || '#000000';
    const light = bgColor.value || '#ffffff';

    if (!text) {
      emptyState.style.display = 'flex';
      qrCanvas.style.display = 'none';
      downloadBtn.disabled = true;
      copyBtn.disabled = true;
      clearBtn.style.display = 'none';
      return;
    }

    clearBtn.style.display = 'flex';
    emptyState.style.display = 'none';
    qrCanvas.style.display = 'block';

    try {
      loadingOverlay.style.display = 'flex';

      // 1. Try Client-side generation using QRCode.js
      let qrSource = null;

      if (window.QRCode) {
        hiddenQrHelper.innerHTML = '';
        try {
          const qr = new window.QRCode(hiddenQrHelper, {
            text: text,
            width: size,
            height: size,
            colorDark: dark,
            colorLight: light,
            correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.H : 2
          });

          // Allow DOM to render
          await new Promise(r => setTimeout(r, 60));

          const renderedCanvas = hiddenQrHelper.querySelector('canvas');
          const renderedImg = hiddenQrHelper.querySelector('img');

          if (renderedCanvas) {
            qrSource = renderedCanvas;
          } else if (renderedImg && renderedImg.src) {
            const img = new Image();
            img.src = renderedImg.src;
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = rej;
            });
            qrSource = img;
          }
        } catch (clientErr) {
          console.warn('İstemci taraflı QR oluşturma başarısız oldu, sunucu deneniyor...', clientErr);
        }
      }

      // 2. Fallback to Server API if client-side couldn't produce an image
      if (!qrSource) {
        try {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text,
              width: size,
              margin: 4,
              dark: dark,
              light: light,
              errorCorrectionLevel: 'H'
            })
          });

          const data = await response.json();
          if (data.success && data.qr) {
            const serverImg = new Image();
            serverImg.src = data.qr;
            await new Promise((res, rej) => {
              serverImg.onload = res;
              serverImg.onerror = rej;
            });
            qrSource = serverImg;
          } else {
            throw new Error(data.message || 'Sunucu hatası');
          }
        } catch (serverErr) {
          throw new Error('QR Kod oluşturulamadı: ' + serverErr.message);
        }
      }

      // 3. Draw onto Main Canvas with Size and Optional Logo
      qrCanvas.width = size;
      qrCanvas.height = size;
      const ctx = qrCanvas.getContext('2d');

      // Clear & Draw base QR
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(qrSource, 0, 0, size, size);

      // 4. Draw Logo in Center if available
      if (currentLogoImage) {
        const logoSize = Math.floor(size * 0.22); // 22% of QR code width
        const x = Math.floor((size - logoSize) / 2);
        const y = Math.floor((size - logoSize) / 2);
        const padding = Math.max(4, Math.floor(logoSize * 0.12));
        const bgSize = logoSize + padding * 2;
        const bgX = x - padding;
        const bgY = y - padding;
        const cornerRadius = Math.max(4, Math.floor(bgSize * 0.16));

        // Background container for logo to ensure readability
        ctx.save();
        ctx.fillStyle = light;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = Math.max(6, Math.floor(size * 0.02));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        roundRect(ctx, bgX, bgY, bgSize, bgSize, cornerRadius);
        ctx.fill();
        ctx.restore();

        // Border around logo pad
        ctx.save();
        ctx.strokeStyle = dark;
        ctx.lineWidth = Math.max(1, Math.floor(size * 0.003));
        ctx.globalAlpha = 0.2;
        roundRect(ctx, bgX, bgY, bgSize, bgSize, cornerRadius);
        ctx.stroke();
        ctx.restore();

        // Clip and draw logo
        ctx.save();
        roundRect(ctx, x, y, logoSize, logoSize, cornerRadius - 2);
        ctx.clip();
        ctx.drawImage(currentLogoImage, x, y, logoSize, logoSize);
        ctx.restore();
      }

      downloadBtn.disabled = false;
      copyBtn.disabled = false;
    } catch (err) {
      console.error(err);
      showToast(err.message, true);
    } finally {
      loadingOverlay.style.display = 'none';
    }
  }

  // Debounced input handler
  function onInputChanged() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateQRCode, 200);
  }

  // Event Listeners for Input
  urlInput.addEventListener('input', onInputChanged);

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.focus();
    generateQRCode();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlInput.value = text;
          showToast('Bağlantı panodan yapıştırıldı!');
          generateQRCode();
        } else {
          showToast('Panoda kopyalanmış metin bulunamadı.', true);
        }
      } else {
        showToast('Panoya erişim tarayıcınızda desteklenmiyor.', true);
      }
    } catch {
      showToast('Panoya erişim izni verilmedi.', true);
    }
  });

  exampleBtn.addEventListener('click', () => {
    urlInput.value = 'https://yetimhellac61.github.io/teknofestctf/';
    showToast('Örnek bağlantı yüklendi!');
    generateQRCode();
  });

  // Color Pickers
  fgColor.addEventListener('input', (e) => {
    fgColorText.textContent = e.target.value;
    removePresetActive();
    onInputChanged();
  });

  bgColor.addEventListener('input', (e) => {
    bgColorText.textContent = e.target.value;
    removePresetActive();
    onInputChanged();
  });

  function removePresetActive() {
    presetBtns.forEach(btn => btn.classList.remove('active'));
  }

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      removePresetActive();
      btn.classList.add('active');

      const fg = btn.getAttribute('data-fg');
      const bg = btn.getAttribute('data-bg');

      fgColor.value = fg;
      fgColorText.textContent = fg;
      bgColor.value = bg;
      bgColorText.textContent = bg;

      generateQRCode();
    });
  });

  sizeSelect.addEventListener('change', generateQRCode);

  // Logo Upload
  logoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Lütfen geçerli bir resim dosyası seçin.', true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        currentLogoImage = img;
        logoUploadText.textContent = '✓ ' + file.name;
        removeLogoBtn.style.display = 'inline-block';
        showToast('Logo başarıyla eklendi!');
        generateQRCode();
      };
      img.onerror = () => {
        showToast('Logo resmi yüklenirken hata oluştu.', true);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  removeLogoBtn.addEventListener('click', () => {
    currentLogoImage = null;
    logoInput.value = '';
    logoUploadText.textContent = '📁 Logo Resmi Seç (PNG/JPG)';
    removeLogoBtn.style.display = 'none';
    showToast('Logo kaldırıldı.');
    generateQRCode();
  });

  // Download PNG Button
  downloadBtn.addEventListener('click', () => {
    if (!qrCanvas || qrCanvas.width === 0) return;

    try {
      const text = urlInput.value.trim();
      let cleanName = 'qrcode';
      try {
        if (text.startsWith('http')) {
          const urlObj = new URL(text);
          cleanName = 'qr_' + urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        }
      } catch {
        cleanName = 'qrcode';
      }

      const link = document.createElement('a');
      link.download = `${cleanName}.png`;
      link.href = qrCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('QR Kod başarıyla indirildi!');
    } catch (e) {
      console.error(e);
      showToast('İndirme sırasında bir sorun oluştu.', true);
    }
  });

  // Copy to Clipboard Button
  copyBtn.addEventListener('click', async () => {
    if (!qrCanvas || qrCanvas.width === 0) return;

    try {
      qrCanvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Resim oluşturulamadı.', true);
          return;
        }

        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            showToast('QR Kod panoya kopyalandı! (Ctrl+V ile yapıştırabilirsiniz)');
          } catch (clipErr) {
            console.warn(clipErr);
            showToast('Panoya kopyalama izni verilmedi.', true);
          }
        } else {
          showToast('Tarayıcınız panoya resim kopyalamayı desteklemiyor.', true);
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
      showToast('Panoya kopyalama başarısız.', true);
    }
  });

  // Initial Load with Example Link
  urlInput.value = 'https://yetimhellac61.github.io/teknofestctf/';
  generateQRCode();
});
