import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// --- IMPORT VOICE ASSISTANT MODULE ---
import { initVoiceRecognition } from "./voice.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCxo6I0UZj-_FuqCiDfSzgieWQf6iQKfBA",
  authDomain: "businessexpense.firebaseapp.com",
  projectId: "businessexpense",
  storageBucket: "businessexpense.firebasestorage.app",
  messagingSenderId: "29454321253",
  appId: "1:29454321253:web:969f4a4ef4e350daf1a88c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

// --- STATE VARIABLES ---
let currentUser = null;
let googleAccessToken = sessionStorage.getItem('google_access_token') || null;
let allExpenses = [];
let activeFilter = 'All';
let editingRowIndex = null;

// Timeout Variables
let inactivityTimer = null;
let countdownInterval = null;
const INACTIVITY_LIMIT_MS = 14 * 60 * 1000; // 14 mins until warning
let countdownSeconds = 30;

// --- DOM ELEMENTS ---
// Auth
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const btnLogin = document.getElementById('btnLogin');
const btnSignup = document.getElementById('btnSignup');
const btnGoogle = document.getElementById('btnGoogle');
const btnLogout = document.getElementById('btnLogout');
const authError = document.getElementById('authError');
const userEmailDisplay = document.getElementById('userEmailDisplay');

// Settings
const customSheetIdInput = document.getElementById('customSheetId');
const customTabNameInput = document.getElementById('customTabName');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const btnForgetSheet = document.getElementById('btnForgetSheet');
const btnOpenSheet = document.getElementById('btnOpenSheet');
const displaySheetId = document.getElementById('displaySheetId');
const displayTabName = document.getElementById('displayTabName');
const settingsDetails = document.getElementById('settingsDetails');

// Nav & Views
const navTabLog = document.getElementById('navTabLog');
const navTabHistory = document.getElementById('navTabHistory');
const viewLogSection = document.getElementById('viewLogSection');
const viewHistorySection = document.getElementById('viewHistorySection');
const editBanner = document.getElementById('editBanner');
const btnCancelEdit = document.getElementById('btnCancelEdit');

// Forms & Inputs
const tabReceipt = document.getElementById('tabReceipt');
const tabMileage = document.getElementById('tabMileage');
const receiptForm = document.getElementById('receiptForm');
const mileageForm = document.getElementById('mileageForm');
const receiptCategorySelect = document.getElementById('receiptCategory');
const vendorList = document.getElementById('vendorList');
const btnReceipt = document.getElementById('btnReceipt');
const btnMileage = document.getElementById('btnMileage');

// History & Totals
const totalUnpaidDisplay = document.getElementById('totalUnpaid');
const totalPaidDisplay = document.getElementById('totalPaid');
const totalMilesDisplay = document.getElementById('totalMiles');
const expenseListContainer = document.getElementById('expenseList');
const btnFetchExpenses = document.getElementById('btnFetchExpenses');
const filterAll = document.getElementById('filterAll');
const filterUnpaid = document.getElementById('filterUnpaid');
const filterPaid = document.getElementById('filterPaid');

// Timeout Modal
const timeoutModal = document.getElementById('timeoutModal');
const timeoutCountdown = document.getElementById('timeoutCountdown');
const btnKeepAlive = document.getElementById('btnKeepAlive');
const btnForceLogout = document.getElementById('btnForceLogout');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadSavedSettings();
  setupEventListeners();
  initDefaults();
  setupInactivityTracker();

  // Initialize external voice recognition module with category callback
  initVoiceRecognition(getAvailableCategories);
});

function initDefaults() {
  const today = new Date().toISOString().split('T')[0];
  const receiptDate = document.getElementById('receiptDate');
  const mileageDate = document.getElementById('mileageDate');
  if (receiptDate) receiptDate.value = today;
  if (mileageDate) mileageDate.value = today;
}

// Callback to pass loaded categories to voice.js
function getAvailableCategories() {
  if (!receiptCategorySelect) return [];
  return Array.from(receiptCategorySelect.options)
    .map(opt => opt.value)
    .filter(val => val !== "");
}

// --- AUTH OBSERVER ---
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    if (authContainer) authContainer.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    if (userEmailDisplay) userEmailDisplay.textContent = user.email || user.displayName;

    const sheetId = localStorage.getItem('user_sheet_id');
    if (sheetId && googleAccessToken) {
      loadDropdownOptions(sheetId);
      fetchExpensesFromSheet();
    }
    resetInactivityTimer();
  } else {
    if (authContainer) authContainer.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    if (userEmailDisplay) userEmailDisplay.textContent = '';
    clearTimeout(inactivityTimer);
    clearInterval(countdownInterval);
  }
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Auth
  if (btnLogin) btnLogin.addEventListener('click', handleEmailLogin);
  if (btnSignup) btnSignup.addEventListener('click', handleEmailSignup);
  if (btnGoogle) btnGoogle.addEventListener('click', handleGoogleLogin);
  if (btnLogout) btnLogout.addEventListener('click', () => signOut(auth));

  // Settings
  if (btnSaveConfig) btnSaveConfig.addEventListener('click', handleSaveConfig);
  if (btnForgetSheet) btnForgetSheet.addEventListener('click', handleDisconnectSheet);

  // Navigation
  if (navTabLog) navTabLog.addEventListener('click', showLogView);
  if (navTabHistory) navTabHistory.addEventListener('click', showHistoryView);
  if (tabReceipt) tabReceipt.addEventListener('click', showReceiptForm);
  if (tabMileage) tabMileage.addEventListener('click', showMileageForm);
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', resetEditMode);

  // History & Filters
  if (btnFetchExpenses) btnFetchExpenses.addEventListener('click', fetchExpensesFromSheet);
  if (filterAll) filterAll.addEventListener('click', () => setFilter('All'));
  if (filterUnpaid) filterUnpaid.addEventListener('click', () => setFilter('Unpaid'));
  if (filterPaid) filterPaid.addEventListener('click', () => setFilter('Paid'));

  // Forms
  if (receiptForm) receiptForm.addEventListener('submit', handleReceiptSubmit);
  if (mileageForm) mileageForm.addEventListener('submit', handleMileageSubmit);

  // Timeout Modal Buttons
  if (btnKeepAlive) btnKeepAlive.addEventListener('click', keepUserAlive);
  if (btnForceLogout) btnForceLogout.addEventListener('click', () => signOut(auth));
}

// --- EMAIL/PASSWORD AUTHENTICATION ---
async function handleEmailLogin() {
  const email = authEmail?.value.trim();
  const password = authPassword?.value.trim();
  if (!email || !password) return showAuthError("Enter email and password.");

  try {
    hideAuthError();
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleEmailSignup() {
  const email = authEmail?.value.trim();
  const password = authPassword?.value.trim();
  if (!email || !password) return showAuthError("Enter email and password.");

  try {
    hideAuthError();
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Account created successfully!");
  } catch (err) {
    showAuthError(err.message);
  }
}

function showAuthError(msg) {
  if (authError) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
  }
}

function hideAuthError() {
  if (authError) authError.classList.add('hidden');
}

// --- GOOGLE AUTHENTICATION ---
async function handleGoogleLogin() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    googleAccessToken = credential?.accessToken || null;

    if (googleAccessToken) {
      sessionStorage.setItem('google_access_token', googleAccessToken);
      const sheetId = localStorage.getItem('user_sheet_id');
      if (sheetId) {
        loadDropdownOptions(sheetId);
        fetchExpensesFromSheet();
      }
    }
  } catch (error) {
    showAuthError(`Google Sign In failed: ${error.message}`);
  }
}

// --- NAVIGATION & VIEWS ---
function showLogView() {
  if (viewLogSection) viewLogSection.classList.remove('hidden');
  if (viewHistorySection) viewHistorySection.classList.add('hidden');
  navTabLog.className = "w-1/2 py-2.5 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600";
  navTabHistory.className = "w-1/2 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700";
}

function showHistoryView() {
  if (viewHistorySection) viewHistorySection.classList.remove('hidden');
  if (viewLogSection) viewLogSection.classList.add('hidden');
  navTabHistory.className = "w-1/2 py-2.5 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600";
  navTabLog.className = "w-1/2 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700";
  fetchExpensesFromSheet();
}

function showReceiptForm() {
  if (receiptForm) receiptForm.classList.remove('hidden');
  if (mileageForm) mileageForm.classList.add('hidden');
  tabReceipt.className = "w-1/2 py-1.5 text-xs font-medium rounded-md bg-white text-gray-800 shadow";
  tabMileage.className = "w-1/2 py-1.5 text-xs font-medium rounded-md text-gray-600";
}

function showMileageForm() {
  if (mileageForm) mileageForm.classList.remove('hidden');
  if (receiptForm) receiptForm.classList.add('hidden');
  tabMileage.className = "w-1/2 py-1.5 text-xs font-medium rounded-md bg-white text-gray-800 shadow";
  tabReceipt.className = "w-1/2 py-1.5 text-xs font-medium rounded-md text-gray-600";
}

// --- EDIT & DUPLICATE ---
window.handleEditExpense = function(rowIndex) {
  const expense = allExpenses.find(e => e.rowIndex === rowIndex);
  if (!expense) return;

  editingRowIndex = rowIndex;
  const dateInput = document.getElementById('receiptDate');
  const amountInput = document.getElementById('receiptAmount');
  const notesInput = document.getElementById('receiptNotes');
  const existingNote = document.getElementById('existingFileNote');

  if (dateInput) dateInput.value = expense.date;
  if (amountInput) amountInput.value = expense.amount || '';
  if (receiptCategorySelect) receiptCategorySelect.value = expense.category || '';
  if (notesInput) notesInput.value = expense.notes || '';

  if (expense.receiptUrl && existingNote) existingNote.classList.remove('hidden');
  if (editBanner) editBanner.classList.remove('hidden');
  if (btnReceipt) btnReceipt.textContent = 'Update Entry';

  showLogView();
};

window.handleDuplicateExpense = function(rowIndex) {
  const expense = allExpenses.find(e => e.rowIndex === rowIndex);
  if (!expense) return;

  resetEditMode();
  const dateInput = document.getElementById('receiptDate');
  const amountInput = document.getElementById('receiptAmount');
  const notesInput = document.getElementById('receiptNotes');

  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  if (amountInput) amountInput.value = expense.amount || '';
  if (receiptCategorySelect) receiptCategorySelect.value = expense.category || '';
  if (notesInput) notesInput.value = expense.notes || '';

  showLogView();
};

function resetEditMode() {
  editingRowIndex = null;
  if (editBanner) editBanner.classList.add('hidden');
  if (btnReceipt) btnReceipt.textContent = 'Log Receipt';

  const existingNote = document.getElementById('existingFileNote');
  if (existingNote) existingNote.classList.add('hidden');

  if (receiptForm) receiptForm.reset();
  initDefaults();
}

// --- SETTINGS MANAGEMENT ---
function loadSavedSettings() {
  const savedSheetId = localStorage.getItem('user_sheet_id');
  const savedTabName = localStorage.getItem('user_tab_name') || 'Sheet1';

  if (savedSheetId) {
    if (customSheetIdInput) customSheetIdInput.value = savedSheetId;
    if (customTabNameInput) customTabNameInput.value = savedTabName;
    if (displaySheetId) displaySheetId.textContent = `${savedSheetId.substring(0, 8)}...`;
    if (displayTabName) displayTabName.textContent = savedTabName;
    
    if (btnOpenSheet) {
      btnOpenSheet.href = `https://docs.google.com/spreadsheets/d/${savedSheetId}/edit`;
      btnOpenSheet.classList.remove('hidden');
    }
    if (btnForgetSheet) btnForgetSheet.classList.remove('hidden');
    if (settingsDetails) settingsDetails.removeAttribute('open');
  } else {
    if (displaySheetId) displaySheetId.textContent = 'Not set';
    if (displayTabName) displayTabName.textContent = 'None';
    if (btnOpenSheet) btnOpenSheet.classList.add('hidden');
    if (btnForgetSheet) btnForgetSheet.classList.add('hidden');
    if (settingsDetails) settingsDetails.setAttribute('open', 'true');
  }
}

function handleSaveConfig() {
  if (!customSheetIdInput) return;
  const sheetId = customSheetIdInput.value.trim();
  const tabName = customTabNameInput?.value.trim() || 'Sheet1';

  if (!sheetId) {
    alert('Please enter a valid Google Spreadsheet ID.');
    return;
  }

  localStorage.setItem('user_sheet_id', sheetId);
  localStorage.setItem('user_tab_name', tabName);
  loadSavedSettings();
  alert('Configuration saved!');

  if (googleAccessToken) {
    loadDropdownOptions(sheetId);
    fetchExpensesFromSheet();
  }
}

function handleDisconnectSheet() {
  localStorage.removeItem('user_sheet_id');
  localStorage.removeItem('user_tab_name');
  if (customSheetIdInput) customSheetIdInput.value = '';
  if (customTabNameInput) customTabNameInput.value = '';
  loadSavedSettings();
  alert('Disconnected from sheet.');
}

// --- DYNAMIC SHEETS DROPDOWNS ---
async function loadDropdownOptions(sheetId) {
  if (!googleAccessToken) return;

  try {
    const categoryRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Categories!A2:A`, {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    if (categoryRes.ok) {
      const categoryData = await categoryRes.json();
      populateSelectOptions(receiptCategorySelect, categoryData.values, 'Select Category...');
    }

    const vendorRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Vendors!A2:A`, {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    if (vendorRes.ok) {
      const vendorData = await vendorRes.json();
      populateDatalistOptions(vendorList, vendorData.values);
    }
  } catch (err) {
    console.warn("Could not load categories/vendors:", err.message);
  }
}

function populateSelectOptions(selectElement, valuesArray, placeholder) {
  if (!selectElement || !valuesArray) return;
  selectElement.innerHTML = `<option value="">${placeholder}</option>`;
  valuesArray.flat().forEach(val => {
    if (val && val.trim() !== '') {
      const opt = document.createElement('option');
      opt.value = val.trim();
      opt.textContent = val.trim();
      selectElement.appendChild(opt);
    }
  });
}

function populateDatalistOptions(datalistElement, valuesArray) {
  if (!datalistElement || !valuesArray) return;
  datalistElement.innerHTML = '';
  valuesArray.flat().forEach(val => {
    if (val && val.trim() !== '') {
      const opt = document.createElement('option');
      opt.value = val.trim();
      datalistElement.appendChild(opt);
    }
  });
}

// --- FORM SUBMISSIONS (RECEIPT & MILEAGE) ---
async function handleReceiptSubmit(e) {
  e.preventDefault();
  if (!currentUser) return alert('Please log in first.');

  const sheetId = localStorage.getItem('user_sheet_id');
  const tabName = localStorage.getItem('user_tab_name') || 'Sheet1';
  if (!sheetId) return alert('No Spreadsheet ID configured.');
  if (!googleAccessToken) return alert('Google session expired. Sign out & sign in.');

  if (btnReceipt) {
    btnReceipt.disabled = true;
    btnReceipt.textContent = 'Saving...';
  }

  try {
    let receiptUrl = '';
    const receiptFileInput = document.getElementById('receiptFile');
    const receiptFile = receiptFileInput?.files[0];

    if (receiptFile) {
      const storageRef = ref(storage, `receipts/${currentUser.uid}/${Date.now()}_${receiptFile.name}`);
      const uploadResult = await uploadBytes(storageRef, receiptFile);
      receiptUrl = await getDownloadURL(uploadResult.ref);
    } else if (editingRowIndex) {
      const existing = allExpenses.find(e => e.rowIndex === editingRowIndex);
      receiptUrl = existing?.receiptUrl || '';
    }

    const date = document.getElementById('receiptDate')?.value || '';
    const amount = document.getElementById('receiptAmount')?.value || '';
    const category = receiptCategorySelect?.value || '';
    const notes = document.getElementById('receiptNotes')?.value || '';

    const rowData = [date, currentUser.displayName || currentUser.email, 'Expense', amount, category, '', notes, receiptUrl, 'Pending'];

    let response;
    if (editingRowIndex) {
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A${editingRowIndex}:I${editingRowIndex}?valueInputOption=USER_ENTERED`;
      response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [rowData] })
      });
    } else {
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:I:append?valueInputOption=USER_ENTERED`;
      response = await fetch(appendUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [rowData] })
      });
    }

    if (!response.ok) throw new Error('Failed to update Google Sheet.');

    alert(editingRowIndex ? '✅ Entry updated!' : '✅ Expense logged!');
    resetEditMode();
    fetchExpensesFromSheet();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    if (btnReceipt) {
      btnReceipt.disabled = false;
      btnReceipt.textContent = editingRowIndex ? 'Update Entry' : 'Log Receipt';
    }
  }
}

async function handleMileageSubmit(e) {
  e.preventDefault();
  if (!currentUser) return alert('Please log in first.');

  const sheetId = localStorage.getItem('user_sheet_id');
  const tabName = localStorage.getItem('user_tab_name') || 'Sheet1';
  if (!sheetId) return alert('No Spreadsheet ID configured.');

  const date = document.getElementById('mileageDate')?.value || '';
  const startOdo = parseFloat(document.getElementById('startOdo')?.value) || 0;
  const endOdo = parseFloat(document.getElementById('endOdo')?.value) || 0;
  const notes = document.getElementById('mileageNotes')?.value || '';

  const totalMiles = startOdo > 0 && endOdo > startOdo ? (endOdo - startOdo).toFixed(1) : endOdo.toFixed(1);

  if (btnMileage) {
    btnMileage.disabled = true;
    btnMileage.textContent = 'Logging...';
  }

  try {
    const rowData = [date, currentUser.displayName || currentUser.email, 'Mileage', '', 'Mileage', totalMiles, notes, '', 'Pending'];
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:I:append?valueInputOption=USER_ENTERED`;

    const response = await fetch(appendUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowData] })
    });

    if (!response.ok) throw new Error('Failed to write mileage row.');

    alert('🚗 Mileage logged successfully!');
    mileageForm.reset();
    initDefaults();
    fetchExpensesFromSheet();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    if (btnMileage) {
      btnMileage.disabled = false;
      btnMileage.textContent = 'Log Mileage';
    }
  }
}

// --- HISTORY & TOTALS ---
async function fetchExpensesFromSheet() {
  const sheetId = localStorage.getItem('user_sheet_id');
  const tabName = localStorage.getItem('user_tab_name') || 'Sheet1';
  if (!sheetId || !googleAccessToken) return;

  if (expenseListContainer) {
    expenseListContainer.innerHTML = `<div class="text-center text-xs text-gray-400 py-6">Loading entries from Google Sheet...</div>`;
  }

  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A2:I`, {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });

    if (!response.ok) throw new Error('Failed to fetch data.');

    const data = await response.json();
    const rows = data.values || [];

    allExpenses = rows.map((row, index) => ({
      rowIndex: index + 2,
      date: row[0] || '',
      user: row[1] || '',
      type: row[2] || 'Expense',
      amount: parseFloat(row[3]) || 0,
      category: row[4] || 'General',
      miles: parseFloat(row[5]) || 0,
      notes: row[6] || '',
      receiptUrl: row[7] || '',
      status: row[8] || 'Pending'
    })).reverse();

    calculateTotals(allExpenses);
    renderExpenseList();
  } catch (err) {
    if (expenseListContainer) {
      expenseListContainer.innerHTML = `<div class="text-center text-xs text-rose-500 py-6">Error loading history: ${err.message}</div>`;
    }
  }
}

function calculateTotals(expenses) {
  let unpaid = 0, paid = 0, totalMiles = 0;
  expenses.forEach(exp => {
    if (exp.status.toLowerCase() === 'paid') paid += exp.amount;
    else unpaid += exp.amount;
    totalMiles += exp.miles;
  });

  if (totalUnpaidDisplay) totalUnpaidDisplay.textContent = `$${unpaid.toFixed(2)}`;
  if (totalPaidDisplay) totalPaidDisplay.textContent = `$${paid.toFixed(2)}`;
  if (totalMilesDisplay) totalMilesDisplay.textContent = totalMiles.toFixed(1);
}

function setFilter(filter) {
  activeFilter = filter;
  [filterAll, filterUnpaid, filterPaid].forEach(btn => {
    if (btn) btn.className = "px-3 py-1 rounded-md text-gray-600 hover:text-gray-800";
  });

  if (filter === 'All' && filterAll) filterAll.className = "px-3 py-1 rounded-md bg-white text-gray-800 shadow font-semibold";
  if (filter === 'Unpaid' && filterUnpaid) filterUnpaid.className = "px-3 py-1 rounded-md bg-white text-gray-800 shadow font-semibold";
  if (filter === 'Paid' && filterPaid) filterPaid.className = "px-3 py-1 rounded-md bg-white text-gray-800 shadow font-semibold";

  renderExpenseList();
}

function renderExpenseList() {
  if (!expenseListContainer) return;

  const filtered = allExpenses.filter(exp => {
    const isPaid = exp.status.toLowerCase() === 'paid';
    if (activeFilter === 'Unpaid') return !isPaid;
    if (activeFilter === 'Paid') return isPaid;
    return true;
  });

  if (filtered.length === 0) {
    expenseListContainer.innerHTML = `<div class="text-center text-xs text-gray-400 py-6">No ${activeFilter !== 'All' ? activeFilter.toLowerCase() : ''} entries found.</div>`;
    return;
  }

  expenseListContainer.innerHTML = filtered.map(exp => {
    const isPaid = exp.status.toLowerCase() === 'paid';
    const statusBg = isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
    
    return `
      <div class="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between gap-3 text-xs">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-bold text-gray-800 truncate">${exp.notes || exp.category}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBg}">${exp.status}</span>
          </div>
          <div class="text-gray-400 text-[11px] flex gap-2">
            <span>📅 ${exp.date}</span>
            <span>🏷️ ${exp.category}</span>
            ${exp.miles ? `<span>🚗 ${exp.miles} mi</span>` : ''}
          </div>
        </div>

        <div class="text-right flex-shrink-0 flex flex-col items-end gap-1">
          <div class="font-bold text-sm text-gray-900">${exp.amount > 0 ? `$${exp.amount.toFixed(2)}` : ''}</div>
          <div class="flex items-center gap-2 text-[10px]">
            ${exp.receiptUrl ? `<a href="${exp.receiptUrl}" target="_blank" class="text-indigo-600 hover:underline">📄 Receipt</a>` : ''}
            <button onclick="handleEditExpense(${exp.rowIndex})" type="button" class="text-gray-500 hover:text-indigo-600 font-medium">✏️ Edit</button>
            <button onclick="handleDuplicateExpense(${exp.rowIndex})" type="button" class="text-gray-500 hover:text-indigo-600 font-medium">📋 Copy</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- SESSION TIMEOUT SYSTEM ---
function setupInactivityTracker() {
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer);
  });
}

function resetInactivityTimer() {
  if (!currentUser) return;
  clearTimeout(inactivityTimer);
  clearInterval(countdownInterval);
  if (timeoutModal) timeoutModal.classList.add('hidden');

  inactivityTimer = setTimeout(triggerTimeoutWarning, INACTIVITY_LIMIT_MS);
}

function triggerTimeoutWarning() {
  if (timeoutModal) timeoutModal.classList.remove('hidden');
  countdownSeconds = 30;
  if (timeoutCountdown) timeoutCountdown.textContent = countdownSeconds;

  countdownInterval = setInterval(() => {
    countdownSeconds--;
    if (timeoutCountdown) timeoutCountdown.textContent = countdownSeconds;

    if (countdownSeconds <= 0) {
      clearInterval(countdownInterval);
      signOut(auth);
    }
  }, 1000);
}

function keepUserAlive() {
  resetInactivityTimer();
}