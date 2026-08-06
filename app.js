import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCxo6I0UZj-_FuqCiDfSzgieWQf6iQKfBA",
  authDomain: "businessexpense.firebaseapp.com",
  projectId: "businessexpense",
  storageBucket: "businessexpense.firebasestorage.app",
  messagingSenderId: "29454321253",
  appId: "1:29454321253:web:969f4a4ef4e350daf1a88c",
  measurementId: "G-98G35BTD8D"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

let currentUser = null;
let existingVendors = [];

// GLOBALS FOR EDITING AND FILTERING
let editingRowIndex = null;
let editingExistingDriveUrl = "";
let editingStatus = "Unpaid"; // Holds the existing status when editing
let currentFilter = "all"; // 'all', 'unpaid', 'paid'
let rawRowsCache = []; // Cache rows for instant filtering

// DOM ELEMENTS
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const userEmailDisplay = document.getElementById('userEmailDisplay');

// TAB SWAPPING ELEMENTS
const navTabLog = document.getElementById('navTabLog');
const navTabHistory = document.getElementById('navTabHistory');
const viewLogSection = document.getElementById('viewLogSection');
const viewHistorySection = document.getElementById('viewHistorySection');

// AUTH LISTENER
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    userEmailDisplay.innerText = user.email;
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    const savedSheetId = localStorage.getItem('user_sheet_id');

    // If a new user logs in and hasn't configured a sheet yet, redirect to setup
    if (!savedSheetId) {
      window.location.href = "setup.html";
      return;
    }
    loadSheetSettings();
    fetchVendorsFromSheet();
    fetchCategoriesFromSheet(); 
    startInactivityTracking();
  } else {
    currentUser = null;
    sessionStorage.removeItem('google_access_token');
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    stopInactivityTracking();
  }
});

function showError(msg) {
  authError.innerText = msg;
  authError.classList.remove('hidden');
}

function validateInputs(email, password) {
  if (!email || !email.trim()) { showError("Please enter your email address."); return false; }
  if (!password || !password.trim()) { showError("Please enter your password."); return false; }
  if (password.length < 6) { showError("Password should be at least 6 characters."); return false; }
  return true;
}

// AUTH LISTENERS
document.getElementById('btnLogin').addEventListener('click', async () => {
  authError.classList.add('hidden');
  if (!validateInputs(authEmail.value, authPassword.value)) return;
  try { await signInWithEmailAndPassword(auth, authEmail.value, authPassword.value); } catch (err) { showError(err.message); }
});

document.getElementById('btnSignup').addEventListener('click', async () => {
  authError.classList.add('hidden');
  if (!validateInputs(authEmail.value, authPassword.value)) return;
  try { await createUserWithEmailAndPassword(auth, authEmail.value, authPassword.value); } catch (err) { showError(err.message); }
});

document.getElementById('btnGoogle').addEventListener('click', async () => {
  authError.classList.add('hidden');
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
      sessionStorage.setItem('google_access_token', credential.accessToken);
      await fetchVendorsFromSheet();
      await fetchCategoriesFromSheet();
    }
  } catch (err) { showError(err.message); }
});

document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

// NAVIGATION TAB SWITCHER
function switchNavTab(tab) {
  const activeClass = "w-1/2 py-2.5 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600";
  const inactiveClass = "w-1/2 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700";

  if (tab === 'log') {
    navTabLog.className = activeClass;
    navTabHistory.className = inactiveClass;
    viewLogSection.classList.remove('hidden');
    viewHistorySection.classList.add('hidden');
  } else {
    navTabLog.className = inactiveClass;
    navTabHistory.className = activeClass;
    viewLogSection.classList.add('hidden');
    viewHistorySection.classList.remove('hidden');
    fetchAllExpensesFromSheet();
  }
}

navTabLog.addEventListener('click', () => switchNavTab('log'));
navTabHistory.addEventListener('click', () => switchNavTab('history'));

// FORM TABS (Receipt vs Mileage)
function switchForm(type) {
  const receiptForm = document.getElementById('receiptForm');
  const mileageForm = document.getElementById('mileageForm');
  const tabReceipt = document.getElementById('tabReceipt');
  const tabMileage = document.getElementById('tabMileage');

  const activeStyle = "w-1/2 py-1.5 text-xs font-medium rounded-md bg-white text-gray-800 shadow";
  const inactiveStyle = "w-1/2 py-1.5 text-xs font-medium rounded-md text-gray-600";

  if (type === 'receipt' || type.toLowerCase() === 'receipt') {
    receiptForm.classList.remove('hidden');
    mileageForm.classList.add('hidden');
    tabReceipt.className = activeStyle;
    tabMileage.className = inactiveStyle;
  } else {
    receiptForm.classList.add('hidden');
    mileageForm.classList.remove('hidden');
    tabReceipt.className = inactiveStyle;
    tabMileage.className = activeStyle;
  }
}

document.getElementById('tabReceipt').addEventListener('click', () => switchForm('receipt'));
document.getElementById('tabMileage').addEventListener('click', () => switchForm('mileage'));
document.getElementById('btnSaveConfig').addEventListener('click', saveSheetSettings);
document.getElementById('btnFetchExpenses').addEventListener('click', fetchAllExpensesFromSheet);

// CANCEL EDIT
document.getElementById('btnCancelEdit').addEventListener('click', () => {
  editingRowIndex = null;
  editingExistingDriveUrl = "";
  editingStatus = "Unpaid";
  document.getElementById('editBanner').classList.add('hidden');
  document.getElementById('btnReceipt').innerText = "Log Receipt";
  document.getElementById('btnMileage').innerText = "Log Mileage";
  document.getElementById('existingFileNote').classList.add('hidden');
  document.getElementById('receiptForm').reset();
  document.getElementById('mileageForm').reset();
});

// CONFIG & SETTINGS
function updateSheetBadgeDisplay(sheetId, tabName) {
  const displaySheetId = document.getElementById('displaySheetId');
  const displayTabName = document.getElementById('displayTabName');
  const btnOpenSheet = document.getElementById('btnOpenSheet');
  const btnForgetSheet = document.getElementById('btnForgetSheet');

  if (sheetId) {
    displaySheetId.innerText = sheetId.length > 15 ? `${sheetId.substring(0, 8)}...${sheetId.substring(sheetId.length - 4)}` : sheetId;
    displayTabName.innerText = tabName || "Sheet1";
    btnOpenSheet.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    btnOpenSheet.classList.remove('hidden');
    btnForgetSheet.classList.remove('hidden');
  } else {
    displaySheetId.innerText = "Not set";
    displayTabName.innerText = "None";
    btnOpenSheet.classList.add('hidden');
    btnForgetSheet.classList.add('hidden');
  }
}

function forgetSheet() {
  const confirmAction = confirm(
    "Disconnect active spreadsheet?\n\nThis will clear the current sheet connection from this browser. Your data inside Google Drive will NOT be deleted."
  );

  if (!confirmAction) return;

  // Clear local storage
  localStorage.removeItem('user_sheet_id');
  localStorage.removeItem('user_tab_name');

  // Clear vendor cache & forms
  existingVendors = [];
  rawRowsCache = [];
  document.getElementById('customSheetId').value = "";
  document.getElementById('customTabName').value = "Sheet1";
  
  // Update badge display
  updateSheetBadgeDisplay(null, null);

  // Automatically expand settings section so user can input new sheet or auto-create
  const settingsDetails = document.getElementById('settingsDetails');
  if (settingsDetails) settingsDetails.open = true;

  // Refresh history UI to reflect cleared state
  renderFilteredExpenses();

  alert("Sheet disconnected. You can now auto-create a new sheet or paste a different Sheet ID.");
}

// Event Listener
document.getElementById('btnForgetSheet').addEventListener('click', forgetSheet);

function saveSheetSettings() {
  const sheetId = document.getElementById('customSheetId').value.trim();
  const tabName = document.getElementById('customTabName').value.trim() || "Sheet1";

  if (!sheetId) { alert("Please enter a Google Sheet ID."); return; }

  localStorage.setItem('user_sheet_id', sheetId);
  localStorage.setItem('user_tab_name', tabName);
  
  updateSheetBadgeDisplay(sheetId, tabName);
  fetchVendorsFromSheet();
  fetchCategoriesFromSheet();
  alert("Sheet Settings Saved!");
}

function loadSheetSettings() {
  const savedSheetId = localStorage.getItem('user_sheet_id') || "";
  const savedTabName = localStorage.getItem('user_tab_name') || "Sheet1";

  document.getElementById('customSheetId').value = savedSheetId;
  document.getElementById('customTabName').value = savedTabName;

  updateSheetBadgeDisplay(savedSheetId, savedTabName);
}

// VENDORS TAB MANAGEMENT
async function fetchVendorsFromSheet() {
  const sheetId = localStorage.getItem('user_sheet_id') || document.getElementById('customSheetId')?.value.trim();
  const accessToken = sessionStorage.getItem('google_access_token');
  const datalist = document.getElementById('vendorList');

  if (!sheetId || !accessToken || !datalist) return;

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Vendors!A:A`;

  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) return;

    const data = await response.json();
    const rows = data.values || [];

    existingVendors = rows.flat().filter(v => v && !['vendor', 'vendors'].includes(v.toLowerCase()));

    datalist.innerHTML = existingVendors
      .map(vendor => `<option value="${vendor}"></option>`)
      .join('');
  } catch (err) {
    console.warn("Could not fetch vendors:", err);
  }
}

async function appendVendorIfNew(vendorName) {
  const sheetId = localStorage.getItem('user_sheet_id') || document.getElementById('customSheetId').value.trim();
  const accessToken = sessionStorage.getItem('google_access_token');
  const cleanVendor = vendorName ? vendorName.trim() : "";

  if (!cleanVendor || !sheetId || !accessToken) return;

  const exists = existingVendors.some(v => v.toLowerCase() === cleanVendor.toLowerCase());

  if (!exists) {
    const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Vendors!A:A:append?valueInputOption=USER_ENTERED`;

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [[cleanVendor]] })
      });

      existingVendors.push(cleanVendor);
      const datalist = document.getElementById('vendorList');
      if (datalist) datalist.insertAdjacentHTML('beforeend', `<option value="${cleanVendor}"></option>`);
    } catch (err) {}
  }
}

// ==========================================
// FETCH, FILTER, EDIT, AND DUPLICATE LOGIC
// ==========================================
async function fetchAllExpensesFromSheet() {
  const sheetId = localStorage.getItem('user_sheet_id') || document.getElementById('customSheetId').value.trim();
  const tabName = localStorage.getItem('user_tab_name') || document.getElementById('customTabName').value.trim() || "Sheet1";
  const accessToken = sessionStorage.getItem('google_access_token');
  const expenseList = document.getElementById('expenseList');

  if (!sheetId || !accessToken) {
    expenseList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 italic">Sign in with Google & save Sheet ID to load records.</p>`;
    return;
  }

  expenseList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 italic">Fetching records from Google Sheet...</p>`;

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:I`;

  try {
    const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${accessToken}` } });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error ? err.error.message : "Failed to fetch rows");
    }

    const data = await response.json();
    const rows = data.values || [];

    // Cache indexed rows for quick filtering
    rawRowsCache = rows.map((row, index) => ({ data: row, rowIndex: index + 1 }));

    renderFilteredExpenses();

  } catch (err) {
    console.error("Fetch Error:", err);
    expenseList.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Error loading data: ${err.message}</p>`;
  }
}

function renderFilteredExpenses() {
  const expenseList = document.getElementById('expenseList');
  expenseList.innerHTML = "";

  let totalPaid = 0;
  let totalUnpaid = 0;
  let totalMiles = 0;

  // 1. Calculate overall sheet totals regardless of current view filter
  rawRowsCache.forEach(item => {
    const [date, user, type, amount, category, miles, notes, driveUrl, status] = item.data;
    if (date && date.toLowerCase() === "date") return;

    const isPaid = status && status.toLowerCase() === "paid";
    if (amount && parseFloat(amount)) {
      const parsedAmt = parseFloat(amount);
      if (isPaid) totalPaid += parsedAmt; else totalUnpaid += parsedAmt;
    } else if (miles && parseFloat(miles)) {
      totalMiles += parseFloat(miles);
    }
  });

  updateDashboardTotals(totalPaid, totalUnpaid, totalMiles);

  // 2. Filter rows for display
  const reverseRows = [...rawRowsCache].reverse();
  let renderedCount = 0;

  reverseRows.forEach(item => {
    const row = item.data;
    const rIndex = item.rowIndex;
    const [date, user, type, amount, category, miles, notes, driveUrl, status] = row;

    if (date && date.toLowerCase() === "date") return; // Skip header

    const isPaid = status && status.toLowerCase() === "paid";

    // Apply Filter Logic
    if (currentFilter === "unpaid" && isPaid) return;
    if (currentFilter === "paid" && !isPaid) return;

    renderedCount++;
    let displayVal = "-";

    if (amount && parseFloat(amount)) {
      displayVal = `$${parseFloat(amount).toFixed(2)}`;
    } else if (miles && parseFloat(miles)) {
      displayVal = `${miles} mi`;
    }

    const title = row[3] && parseFloat(row[3]) ? row[4] : (type || "Expense");
    const subtitle = notes ? `${notes} • ${date || ''}` : (date || '');

    renderExpenseCard(row, rIndex, title, subtitle, displayVal, driveUrl, isPaid);
  });

  if (renderedCount === 0) {
    expenseList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 italic">No ${currentFilter !== 'all' ? currentFilter : ''} entries found.</p>`;
  }
}

function updateDashboardTotals(paid, unpaid, miles) {
  document.getElementById('totalPaid').innerText = `$${paid.toFixed(2)}`;
  document.getElementById('totalUnpaid').innerText = `$${unpaid.toFixed(2)}`;
  document.getElementById('totalMiles').innerText = miles.toFixed(1);
}

function renderExpenseCard(row, rowIndex, title, subtitle, amountOrMiles, driveUrl, isPaid) {
  const expenseList = document.getElementById('expenseList');
  const itemCard = document.createElement('div');
  itemCard.className = "bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-sm flex flex-col gap-2";

  let linkBadge = driveUrl ? `<a href="${driveUrl}" target="_blank" class="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5 mt-0.5">📎 View Receipt</a>` : "";
  let statusBadge = isPaid 
    ? `<span class="bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">Paid</span>` 
    : `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">Unpaid</span>`;

  itemCard.innerHTML = `
    <div class="flex justify-between items-start">
      <div class="truncate mr-2">
        <div class="font-semibold text-gray-800 flex items-center gap-2">${title} ${statusBadge}</div>
        <div class="text-gray-500 text-[11px] mt-0.5">${subtitle}</div>
        ${linkBadge}
      </div>
      <div class="font-bold text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200 whitespace-nowrap">
        ${amountOrMiles}
      </div>
    </div>
    <div class="flex justify-end gap-2 border-t border-gray-100 pt-2 mt-1">
      <button type="button" class="btn-duplicate text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded font-medium transition">Duplicate</button>
      <button type="button" class="btn-edit text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-medium transition">Edit</button>
    </div>
  `;

  itemCard.querySelector('.btn-duplicate').addEventListener('click', () => loadFormWithData(row, null));
  itemCard.querySelector('.btn-edit').addEventListener('click', () => loadFormWithData(row, rowIndex));

  expenseList.appendChild(itemCard);
}

function loadFormWithData(row, rowIndexTarget) {
  const [date, user, type, amount, category, miles, notes, driveUrl, status] = row;
  const isEditing = rowIndexTarget !== null;

  switchNavTab('log');
  switchForm(type || 'receipt');

  if (isEditing) {
    editingRowIndex = rowIndexTarget;
    editingExistingDriveUrl = driveUrl || "";
    editingStatus = status || "Unpaid"; // Maintain current status on edit
    document.getElementById('editBanner').classList.remove('hidden');
    document.getElementById('btnReceipt').innerText = "Update Receipt Entry";
    document.getElementById('btnMileage').innerText = "Update Mileage Entry";
    if (driveUrl) document.getElementById('existingFileNote').classList.remove('hidden');
  } else {
    document.getElementById('btnCancelEdit').click();
  }

  const formType = (type || 'receipt').toLowerCase();
  if (formType === 'receipt') {
    document.getElementById('receiptAmount').value = amount || "";
    if (category) document.getElementById('receiptCategory').value = category;
    document.getElementById('receiptNotes').value = notes || "";
  } else {
    document.getElementById('startOdo').value = 0;
    document.getElementById('endOdo').value = miles || "";
    document.getElementById('mileageNotes').value = notes || "";
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// FILTER CONTROLS
function setFilter(filterType) {
  currentFilter = filterType;
  const activeBtnStyle = "px-3 py-1 rounded-md bg-white text-gray-800 shadow font-semibold";
  const inactiveBtnStyle = "px-3 py-1 rounded-md text-gray-600 hover:text-gray-800";

  document.getElementById('filterAll').className = filterType === 'all' ? activeBtnStyle : inactiveBtnStyle;
  document.getElementById('filterUnpaid').className = filterType === 'unpaid' ? activeBtnStyle : inactiveBtnStyle;
  document.getElementById('filterPaid').className = filterType === 'paid' ? activeBtnStyle : inactiveBtnStyle;

  renderFilteredExpenses();
}

document.getElementById('filterAll').addEventListener('click', () => setFilter('all'));
document.getElementById('filterUnpaid').addEventListener('click', () => setFilter('unpaid'));
document.getElementById('filterPaid').addEventListener('click', () => setFilter('paid'));

// UPLOAD TO DRIVE
async function uploadFileToGoogleDrive(file, accessToken) {
  const metadata = { name: `Receipt_${Date.now()}_${file.name}`, mimeType: file.type };
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = async function (e) {
      const contentType = file.type || 'application/octet-stream';
      const base64Data = e.target.result.split(',')[1];

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        close_delim;

      try {
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`
          },
          body: multipartRequestBody
        });

        if (!response.ok) throw new Error('Drive Upload Failed');
        const data = await response.json();
        resolve(data.webViewLink);
      } catch (err) { reject(err); }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// SUBMIT / UPDATE LOGIC
async function handleFormSubmit(event, type) {
  event.preventDefault();

  const sheetId = localStorage.getItem('user_sheet_id') || document.getElementById('customSheetId').value.trim();
  const tabName = localStorage.getItem('user_tab_name') || document.getElementById('customTabName').value.trim() || "Sheet1";
  const accessToken = sessionStorage.getItem('google_access_token');

  if (!sheetId) { alert("Please specify a Google Sheet ID in settings first!"); return; }
  if (!accessToken) { alert("To post directly to Google Sheets & Drive, you must sign in using 'Sign in with Google'."); return; }

  const btn = type === 'receipt' ? document.getElementById('btnReceipt') : document.getElementById('btnMileage');

  const userEmail = currentUser && currentUser.email ? currentUser.email : "Anonymous";
  const date = new Date().toLocaleDateString();

  let rowData = [];
  let uploadedReceiptLink = editingRowIndex ? editingExistingDriveUrl : "";
  
  // Status defaults to "Unpaid" for new entries, or retains existing status if editing
  const entryStatus = editingRowIndex ? editingStatus : "Unpaid";

  try {
    if (type === 'receipt') {
      const amount = parseFloat(document.getElementById('receiptAmount').value) || 0;
      const category = document.getElementById('receiptCategory').value;
      const notes = document.getElementById('receiptNotes').value.trim();
      const fileInput = document.getElementById('receiptFile');

      if (notes) await appendVendorIfNew(notes);

      if (fileInput && fileInput.files.length > 0) {
        btn.innerText = "Uploading Receipt...";
        btn.disabled = true;
        uploadedReceiptLink = await uploadFileToGoogleDrive(fileInput.files[0], accessToken);
      }

      btn.innerText = editingRowIndex ? "Updating Sheet..." : "Writing to Sheet...";
      btn.disabled = true;

      rowData = [date, userEmail, "Receipt", amount.toFixed(2), category, "", notes, uploadedReceiptLink, entryStatus];
    } else {
      btn.innerText = editingRowIndex ? "Updating Sheet..." : "Writing to Sheet...";
      btn.disabled = true;

      const start = parseFloat(document.getElementById('startOdo').value);
      const end = parseFloat(document.getElementById('endOdo').value);
      const miles = end - start;
      const notes = document.getElementById('mileageNotes').value;
      
      rowData = [date, userEmail, "Mileage", "", "Mileage", miles, notes, "", entryStatus];
    }

    let method = 'POST';
    let endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:I:append?valueInputOption=USER_ENTERED`;
    
    if (editingRowIndex) {
      method = 'PUT';
      endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A${editingRowIndex}:I${editingRowIndex}?valueInputOption=USER_ENTERED`;
    }

    const response = await fetch(endpoint, {
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowData] })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error ? errData.error.message : "Failed to write to sheet");
    }

    alert(editingRowIndex ? "Entry updated successfully!" : `Logged a ${type} entry successfully!`);
    
    document.getElementById('btnCancelEdit').click();

  } catch (error) {
    console.error("REST API Error:", error);
    alert(`Error: ${error.message}`);
  } finally {
    btn.innerText = type === 'receipt' ? "Log Receipt" : "Log Mileage";
    btn.disabled = false;
  }
}

let existingCategories = [];

// Fetch categories from the 3rd Tab ("Categories")
async function fetchCategoriesFromSheet() {
  const sheetId = localStorage.getItem('user_sheet_id');
  const token = sessionStorage.getItem('google_access_token');
  if (!sheetId || !token) return;

  try {
    const range = "Categories!A2:A";
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.values && data.values.length > 0) {
        // Flatten array and filter out empty rows
        existingCategories = data.values.map(row => row[0]).filter(Boolean);
        console.log("Fetched categories");
      } else {
        // Fallback default categories if tab is empty
        existingCategories = ["Office Supplies", "Meals & Entertainment", "Software & Subscriptions", "Travel & Lodging", "Marketing & Advertising"];
        console.log("Fetched categories, tab is empty");
      }
    } else {
      // Fallback defaults if Categories tab doesn't exist yet
      existingCategories = ["Office Supplies", "Meals & Entertainment", "Software & Subscriptions", "Travel & Lodging", "Marketing & Advertising"];
        console.log("Fetched categories, Tab does not exist");
    }
    populateCategoryDropdown();
  } catch (err) {
    console.error("Error fetching categories:", err);
  }
}

// Populate Category <select> dropdown in index.html
function populateCategoryDropdown() {
  const categorySelect = document.getElementById('receiptCategory');
  console.log("checking categoryselect");
  if (!categorySelect) return;

  // Preserve initial placeholder option
  categorySelect.innerHTML = `<option value="">Select Category...</option>`;
  console.log("populated dropdown");
  existingCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

// ==========================================
// SESSION TIMEOUT & COUNTDOWN MODAL CONFIG
// ==========================================
const IDLE_TIME_LIMIT = 15 * 60 * 1000;
const COUNTDOWN_SECONDS = 30;

let idleTimer = null;
let countdownInterval = null;
let secondsRemaining = COUNTDOWN_SECONDS;

const timeoutModal = document.getElementById('timeoutModal');
const timeoutCountdown = document.getElementById('timeoutCountdown');
const btnKeepAlive = document.getElementById('btnKeepAlive');
const btnForceLogout = document.getElementById('btnForceLogout');

function resetIdleTimer() {
  if (!currentUser) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showTimeoutModal, IDLE_TIME_LIMIT);
}

function showTimeoutModal() {
  detachActivityListeners();
  secondsRemaining = COUNTDOWN_SECONDS;
  timeoutCountdown.innerText = secondsRemaining;
  timeoutModal.classList.remove('hidden');

  countdownInterval = setInterval(() => {
    secondsRemaining -= 1;
    timeoutCountdown.innerText = secondsRemaining;
    if (secondsRemaining <= 0) performTimeoutLogout();
  }, 1000);
}

function hideTimeoutModal() {
  clearInterval(countdownInterval);
  timeoutModal.classList.add('hidden');
  attachActivityListeners();
  resetIdleTimer();
}

function performTimeoutLogout() {
  clearInterval(countdownInterval);
  timeoutModal.classList.add('hidden');
  signOut(auth).then(() => alert("Session expired due to inactivity."));
}

const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
function attachActivityListeners() { activityEvents.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true })); }
function detachActivityListeners() { activityEvents.forEach(evt => window.removeEventListener(evt, resetIdleTimer)); }

function startInactivityTracking() {
  attachActivityListeners();
  resetIdleTimer();
}

function stopInactivityTracking() {
  clearTimeout(idleTimer);
  clearInterval(countdownInterval);
  detachActivityListeners();
  timeoutModal.classList.add('hidden');
}

btnKeepAlive.addEventListener('click', hideTimeoutModal);
btnForceLogout.addEventListener('click', performTimeoutLogout);

document.getElementById('receiptForm').addEventListener('submit', (e) => handleFormSubmit(e, 'receipt'));
document.getElementById('mileageForm').addEventListener('submit', (e) => handleFormSubmit(e, 'mileage'));