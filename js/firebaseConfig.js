// js/firebaseConfig.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { 
    getAuth, 
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCSTx_xxEL1gDy8KHZFY7RspufcGOP93rc",
    authDomain: "moral-1f74c.firebaseapp.com",
    databaseURL: "https://moral-1f74c-default-rtdb.firebaseio.com",
    projectId: "moral-1f74c",
    storageBucket: "moral-1f74c.firebasestorage.app",
    messagingSenderId: "499145715364",
    appId: "1:499145715364:web:33808d0524085e35e24031",
    measurementId: "G-0FG02JEW6N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Set persistence to local
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log('✅ Firebase persistence set to LOCAL');
    })
    .catch((error) => {
        console.warn('⚠️ Persistence error:', error);
    });

// Helper functions
const FirebaseHelpers = {
    logError: (context, error) => {
        console.error(`❌ ${context}:`, error.code || error.message || error);
    },
    
    showToast: (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            animation: slideDown 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

export { auth, db, FirebaseHelpers };