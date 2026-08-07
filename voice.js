// voice.js
export function parseVoiceTranscript(text, existingCategories = []) {
  const result = {
    amount: null,
    category: null,
    vendor: "",
    date: null
  };

  if (!text) return result;

  // Clean transcript: lowercased, strip colons & commas after keywords
  let cleanText = text.toLowerCase()
    .replace(/category\s*:\s*/gi, 'category ')
    .replace(/vendor\s*:\s*/gi, 'vendor ')
    .replace(/notes?\s*:\s*/gi, 'notes ')
    .replace(/[,.]/g, ' ');

  // 1. EXTRACT DATE ("yesterday", "today")
  const today = new Date();
  const formatDate = (d) => d.toISOString().split('T')[0];

  if (cleanText.includes("yesterday")) {
    today.setDate(today.getDate() - 1);
    result.date = formatDate(today);
  } else if (cleanText.includes("today")) {
    result.date = formatDate(today);
  }

  // 2. EXTRACT AMOUNT
  const amountRegex = /(\$\s?\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s?dollars?(?:\s?and\s?\d+\s?cents?)?|\d+\.\d{1,2})/i;
  const amountMatch = cleanText.match(amountRegex);

  if (amountMatch) {
    let rawAmount = amountMatch[0]
      .replace('$', '')
      .replace(/dollars?/i, '.')
      .replace(/and/i, '')
      .replace(/cents?/i, '')
      .replace(/\s+/g, '');
    
    result.amount = parseFloat(rawAmount).toFixed(2);
  }

  // 3. EXTRACT CATEGORY
  let rawCategoryText = "";
  const explicitCategoryRegex = /category\s+(.*?)(?=\s+(?:vendor|notes?|amount|dollars?|cents?|yesterday|today|on|\$|\d)|$)/i;
  const explicitCatMatch = cleanText.match(explicitCategoryRegex);

  if (explicitCatMatch && explicitCatMatch[1]) {
    rawCategoryText = explicitCatMatch[1].trim();
  }

  // Match extracted category against actual select dropdown options (case-insensitive)
  if (existingCategories && existingCategories.length > 0) {
    const matchedCategory = existingCategories.find(cat => {
      const cleanCat = cat.toLowerCase().trim();
      const cleanRaw = rawCategoryText.toLowerCase().trim();
      
      return cleanCat === cleanRaw || 
             (cleanRaw && cleanCat.includes(cleanRaw)) || 
             (cleanRaw && cleanRaw.includes(cleanCat)) ||
             cleanText.includes(cleanCat);
    });

    if (matchedCategory) {
      result.category = matchedCategory;
    }
  } else if (rawCategoryText) {
    result.category = rawCategoryText;
  }

  // 4. EXTRACT VENDOR / NOTES
  const explicitVendorRegex = /(?:vendor|notes?)\s+(?:is\s+)?(.*?)(?=\s+(?:category|amount|dollars?|cents?|yesterday|today|on|\$|\d)|$)/i;
  const explicitVendorMatch = cleanText.match(explicitVendorRegex);

  if (explicitVendorMatch && explicitVendorMatch[1]) {
    result.vendor = explicitVendorMatch[1].trim();
  } else {
    // Fallback: Strip known entities and use remaining text
    let fallbackNotes = cleanText
      .replace(/yesterday|today|category|vendor|notes?|spent|paid|for|at|dollars?|cents?/gi, '')
      .replace(amountRegex, '');

    if (result.category) {
      fallbackNotes = fallbackNotes.replace(new RegExp(result.category, 'gi'), '');
    }

    result.vendor = fallbackNotes.replace(/\s+/g, ' ').trim();
  }

  // Capitalize vendor string
  if (result.vendor) {
    result.vendor = result.vendor.charAt(0).toUpperCase() + result.vendor.slice(1);
  }

  return result;
}
/**
 * Resets the form inputs in the active tab before capturing new voice input.
 */
function clearCurrentFormFields() {
  const receiptForm = document.getElementById('receiptForm');
  const isReceiptActive = receiptForm && !receiptForm.classList.contains('hidden');

  if (isReceiptActive) {
    const amount = document.getElementById('receiptAmount');
    const category = document.getElementById('receiptCategory');
    const date = document.getElementById('receiptDate');
    const notes = document.getElementById('receiptNotes');

    if (amount) amount.value = '';
    if (category) category.value = '';
    if (date) date.value = '';
    if (notes) notes.value = '';
  } else {
    const date = document.getElementById('mileageDate');
    const startOdo = document.getElementById('startOdo');
    const endOdo = document.getElementById('endOdo');
    const notes = document.getElementById('mileageNotes');

    if (date) date.value = '';
    if (startOdo) startOdo.value = '';
    if (endOdo) endOdo.value = '';
    if (notes) notes.value = '';
  }

  // Clear previous transcript display
  const transcriptText = document.getElementById('transcriptText');
  const voiceTranscript = document.getElementById('voiceTranscript');
  if (transcriptText) transcriptText.innerText = '';
  if (voiceTranscript) voiceTranscript.classList.add('hidden');
}

export function initVoiceRecognition(getCategoriesCallback) {
  const btnVoiceRecord = document.getElementById('btnVoiceRecord');
  const micStatusText = document.getElementById('micStatusText');
  const micIcon = document.getElementById('micIcon');
  const voiceTranscript = document.getElementById('voiceTranscript');
  const transcriptText = document.getElementById('transcriptText');

  // Check browser support for Web Speech API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    if (btnVoiceRecord) {
      btnVoiceRecord.disabled = true;
      micStatusText.innerText = "Voice input not supported in this browser";
      btnVoiceRecord.classList.add('opacity-50', 'cursor-not-allowed');
    }
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  let isListening = false;

  btnVoiceRecord.addEventListener('click', () => {
    if (!isListening) {
      recognition.start();
    } else {
      recognition.stop();
    }
  });

  recognition.onstart = () => {
    isListening = true;

    // Reset active form fields so previous data is cleared on re-record
    clearCurrentFormFields();

    micStatusText.innerText = "Listening... Speak now";
    micIcon.innerText = "🎤";
    btnVoiceRecord.classList.replace('bg-indigo-600', 'bg-rose-600');
  };

  recognition.onend = () => {
    isListening = false;
    micStatusText.innerText = "Tap to Speak Expense";
    micIcon.innerText = "🎙️";
    btnVoiceRecord.classList.replace('bg-rose-600', 'bg-indigo-600');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    
    // Display raw transcript
    if (transcriptText) transcriptText.innerText = `"${transcript}"`;
    if (voiceTranscript) voiceTranscript.classList.remove('hidden');

    // Retrieve active categories dynamically
    const categories = typeof getCategoriesCallback === 'function' ? getCategoriesCallback() : [];

    // Parse the transcript
    const parsedData = parseVoiceTranscript(transcript, categories);

    const receiptForm = document.getElementById('receiptForm');
    const isReceiptActive = receiptForm && !receiptForm.classList.contains('hidden');
    const defaultToday = new Date().toISOString().split('T')[0];

    // Populate active form
    if (isReceiptActive) {
      const receiptAmount = document.getElementById('receiptAmount');
      const receiptCategory = document.getElementById('receiptCategory');
      const receiptDate = document.getElementById('receiptDate');
      const receiptNotes = document.getElementById('receiptNotes');

      if (receiptAmount) receiptAmount.value = parsedData.amount || '';
      if (receiptCategory) receiptCategory.value = parsedData.category || '';
      if (receiptDate) receiptDate.value = parsedData.date || defaultToday;
      if (receiptNotes) receiptNotes.value = parsedData.vendor || '';

    } else {
      const mileageDate = document.getElementById('mileageDate');
      const mileageNotes = document.getElementById('mileageNotes');

      if (mileageDate) mileageDate.value = parsedData.date || defaultToday;
      if (mileageNotes) mileageNotes.value = parsedData.vendor || '';
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech Recognition Error:", event.error);
    micStatusText.innerText = "Error listening. Try again.";
  };
}