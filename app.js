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
let totalExpenseAmount = 0;

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
    loadSheetSettings();
  } else {
    currentUser = null;
    sessionStorage.removeItem('google_access_token');
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
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
    // Fetch fresh expenses every time user switches to History Tab
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

  if (type === 'receipt') {
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

// CONFIG & SETTINGS
function updateSheetBadgeDisplay(sheetId, tabName) {
  const displaySheetId = document.getElementById('displaySheetId');
  const displayTabName = document.getElementById('displayTabName');
  const btnOpenSheet = document.getElementById('btnOpenSheet');

  if (sheetId) {
    displaySheetId.innerText = sheetId.length > 15 ? `${sheetId.substring(0, 8)}...${sheetId.substring(sheetId.length - 4)}` : sheetId;
    displayTabName.innerText = tabName || "Sheet1";
    btnOpenSheet.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    btnOpenSheet.classList.remove('hidden');
  } else {
    displaySheetId.innerText = "Not set";
    displayTabName.innerText = "None";
    btnOpenSheet.classList.add('hidden');
  }
}

function saveSheetSettings() {
  const sheetId = document.getElementById('customSheetId').value.trim();
  const tabName = document.getElementById('customTabName').value.trim() || "Sheet1";

  if (!sheetId) { alert("Please enter a Google Sheet ID."); return; }

  localStorage.setItem('user_sheet_id', sheetId);
  localStorage.setItem('user_tab_name', tabName);
  
  updateSheetBadgeDisplay(sheetId, tabName);
  alert("Sheet Settings Saved!");
}

function loadSheetSettings() {
  const savedSheetId = localStorage.getItem('user_sheet_id') || "";
  const savedTabName = localStorage.getItem('user_tab_name') || "Sheet1";

  document.getElementById('customSheetId').value = savedSheetId;
  document.getElementById('customTabName').value = savedTabName;

  updateSheetBadgeDisplay(savedSheetId, savedTabName);
}

// REST API GOOGLE SHEETS & DRIVE
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

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:H`;

  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error ? err.error.message : "Failed to fetch rows");
    }

    const data = await response.json();
    const rows = data.values || [];

    expenseList.innerHTML = "";
    totalExpenseAmount = 0;

    if (rows.length === 0) {
      expenseList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 italic">No expenses found in this sheet tab.</p>`;
      document.getElementById('sessionTotal').innerText = `$0.00`;
      return;
    }

    const reverseRows = [...rows].reverse();

    reverseRows.forEach(row => {
      const [date, user, type, category, amount, mileage, notes, driveUrl] = row;

      if (date && date.toLowerCase() === "date") return;

      let displayVal = "";
      if (amount && parseFloat(amount)) {
        const parsedAmt = parseFloat(amount);
        totalExpenseAmount += parsedAmt;
        displayVal = `$${parsedAmt.toFixed(2)}`;
      } else if (mileage) {
        displayVal = `${mileage} mi`;
      } else {
        displayVal = "-";
      }

      const title = category || type || "Expense";
      const subtitle = notes ? `${notes} • ${date || ''}` : (date || '');

      addExpenseToList(title, subtitle, displayVal, driveUrl);
    });

    document.getElementById('sessionTotal').innerText = `$${totalExpenseAmount.toFixed(2)}`;

  } catch (err) {
    console.error("Fetch Error:", err);
    expenseList.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Error loading data: ${err.message}</p>`;
  }
}

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

        if (!response.ok) {
          const errorJson = await response.json();
          throw new Error(errorJson.error ? errorJson.error.message : 'Drive Upload Failed');
        }

        const data = await response.json();
        resolve(data.webViewLink);
      } catch (err) { reject(err); }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

function addExpenseToList(title, subtitle, amountOrMiles, driveUrl) {
  const expenseList = document.getElementById('expenseList');

  const itemCard = document.createElement('div');
  itemCard.className = "bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center text-xs";

  let linkBadge = "";
  if (driveUrl) {
    linkBadge = `<a href="${driveUrl}" target="_blank" class="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5 mt-0.5">📎 View Receipt</a>`;
  }

  itemCard.innerHTML = `
    <div class="truncate mr-2">
      <div class="font-semibold text-gray-800">${title}</div>
      <div class="text-gray-500 text-[11px]">${subtitle}</div>
      ${linkBadge}
    </div>
    <div class="font-bold text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 whitespace-nowrap">
      ${amountOrMiles}
    </div>
  `;

  expenseList.appendChild(itemCard);
}

async function handleFormSubmit(event, type) {
  event.preventDefault();

  const sheetId = localStorage.getItem('user_sheet_id') || document.getElementById('customSheetId').value.trim();
  const tabName = localStorage.getItem('user_tab_name') || document.getElementById('customTabName').value.trim() || "Sheet1";
  const accessToken = sessionStorage.getItem('google_access_token');

  if (!sheetId) { alert("Please specify a Google Sheet ID in settings first!"); return; }
  if (!accessToken) { alert("To post directly to Google Sheets & Drive, you must sign in using 'Sign in with Google'."); return; }

  const btn = type === 'receipt' ? document.getElementById('btnReceipt') : document.getElementById('btnMileage');
  const originalText = btn.innerText;

  const userEmail = currentUser && currentUser.email ? currentUser.email : "Anonymous";
  const date = new Date().toLocaleDateString();

  let rowData = [];
  let uploadedReceiptLink = "";

  try {
    if (type === 'receipt') {
      const amount = parseFloat(document.getElementById('receiptAmount').value) || 0;
      const category = document.getElementById('receiptCategory').value;
      const notes = document.getElementById('receiptNotes').value;
      const fileInput = document.getElementById('receiptFile');

      if (fileInput && fileInput.files.length > 0) {
        btn.innerText = "Uploading Receipt to Drive...";
        btn.disabled = true;
        uploadedReceiptLink = await uploadFileToGoogleDrive(fileInput.files[0], accessToken);
      }

      btn.innerText = "Writing to Google Sheet...";
      btn.disabled = true;

      rowData = [date, userEmail, type, category, amount.toFixed(2), "", notes, uploadedReceiptLink];
    } else {
      btn.innerText = "Writing to Google Sheet...";
      btn.disabled = true;

      const start = parseFloat(document.getElementById('startOdo').value);
      const end = parseFloat(document.getElementById('endOdo').value);
      const miles = end - start;
      const notes = document.getElementById('mileageNotes').value;
      
      rowData = [date, userEmail, type, "Mileage", "", miles, notes, ""];
    }

    const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:H:append?valueInputOption=USER_ENTERED`;

    const response = await fetch(endpoint, {
      method: 'POST',
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

    alert(`Logged a ${type} entry successfully!`);
    event.target.reset();

  } catch (error) {
    console.error("REST API Error:", error);
    alert(`Error: ${error.message}`);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

document.getElementById('receiptForm').addEventListener('submit', (e) => handleFormSubmit(e, 'receipt'));
document.getElementById('mileageForm').addEventListener('submit', (e) => handleFormSubmit(e, 'mileage'));