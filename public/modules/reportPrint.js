document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('print-pdf-btn')?.addEventListener('click', () => {
    window.print();
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  let activeSlot = null;

  function renderSlotImage(slot, dataUrl) {
    slot.classList.add('has-image');
    slot.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Evidencia del sistema';
    slot.appendChild(img);
    try {
      if (slot.dataset.slot) {
        localStorage.setItem(`c360_doc_img_${slot.dataset.slot}`, dataUrl);
      }
    } catch {}
  }

  function loadFileIntoSlot(file, slot) {
    if (!file || !slot) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        renderSlotImage(slot, reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  document.querySelectorAll('.evidence-slot').forEach((slot) => {
    const key = slot.dataset.slot;
    if (key) {
      const saved = localStorage.getItem(`c360_doc_img_${key}`);
      if (saved) renderSlotImage(slot, saved);
    }

    slot.addEventListener('click', () => {
      activeSlot = slot;
      fileInput.value = '';
      fileInput.click();
    });

    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.style.borderColor = '#ee6c4d';
    });

    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = '';
    });

    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.style.borderColor = '';
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        loadFileIntoSlot(file, slot);
      }
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file && activeSlot) {
      loadFileIntoSlot(file, activeSlot);
    }
  });
});
