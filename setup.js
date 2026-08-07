// setup.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

document.addEventListener('DOMContentLoaded', () => {
  const btnCreateSheet = document.getElementById('btnCreateSheet');
  const statusBox = document.getElementById('statusBox');
  const statusText = document.getElementById('statusText');
  const sheetLinkContainer = document.getElementById('sheetLinkContainer');
  const sheetLink = document.getElementById('sheetLink');

  if (!btnCreateSheet) return;

  btnCreateSheet.addEventListener('click', async () => {
    statusBox.classList.remove('hidden');
    sheetLinkContainer.classList.add('hidden');
    btnCreateSheet.disabled = true;

    try {
      statusText.innerText = "Authenticating with Google...";
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) throw new Error("Could not retrieve Google Access Token.");

      sessionStorage.setItem('google_access_token', accessToken);

      statusText.innerText = "Creating Google Sheet template...";

      // 1. CREATE SPREADSHEET WITH 'Sheet1', 'Vendors', AND 'Categories' TABS
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { title: `BizExpense Tracker - ${new Date().getFullYear()}` },
          sheets: [
            { properties: { title: 'Sheet1' } },
            { properties: { title: 'Vendors' } },
            { properties: { title: 'Categories' } }
          ]
        })
      });

      if (!createResponse.ok) throw new Error("Failed to create spreadsheet.");

      const sheetData = await createResponse.json();
      const sheetId = sheetData.spreadsheetId;

      statusText.innerText = "Formatting headers, vendors, and categories...";

      // 2. POPULATE HEADERS & INITIAL VALUES IN ALL THREE TABS
      const batchUpdateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: [
            // Tab 1: Sheet1 Headers
            {
              range: "Sheet1!A1:I1",
              values: [["Date", "User", "Type", "Amount", "Category", "Miles", "Notes", "Receipt Link", "Status"]]
            },
            // Tab 2: Default Vendors
            {
              range: "Vendors!A1:A5",
              values: [
                ["Vendor Name"],
                ["Office Supplies Co"],
                ["Uber / Lyft"],
                ["Amazon"],
                ["Software SaaS"]
              ]
            },
            // Tab 3: Default Expense Categories
            {
              range: "Categories!A1:A7",
              values: [
                ["Category Name"],
                ["Office Supplies"],
                ["Meals & Entertainment"],
                ["Software & Subscriptions"],
                ["Travel & Lodging"],
                ["Marketing & Advertising"],
                ["Professional Services"]
              ]
            }
          ]
        })
      });

      if (!batchUpdateResponse.ok) throw new Error("Failed to populate initial headers and categories.");

      // 3. SAVE SHEET ID TO LOCAL STORAGE
      localStorage.setItem('user_sheet_id', sheetId);
      localStorage.setItem('user_tab_name', 'Sheet1');

      statusText.innerHTML = `✅ <span class="text-emerald-700 font-bold">Sheet created successfully!</span> Settings saved.`;
      sheetLink.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
      sheetLinkContainer.classList.remove('hidden');

      // Add direct button back to index.html
      if (!document.getElementById('btnGoToApp')) {
        const btnGoToApp = document.createElement('a');
        btnGoToApp.id = 'btnGoToApp';
        btnGoToApp.href = "index.html";
        btnGoToApp.className = "mt-3 block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-xs transition";
        btnGoToApp.innerText = "➡️ Launch BizExpense Tracker";
        statusBox.appendChild(btnGoToApp);
      }

    } catch (err) {
      console.error(err);
      statusText.innerHTML = `❌ <span class="text-rose-600 font-bold">Error:</span> ${err.message}`;
    } finally {
      btnCreateSheet.disabled = false;
    }
  });
});