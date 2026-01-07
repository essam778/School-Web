// js/dashboardGuard.js
import { db } from './firebaseConfig.js';
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Prevent multiple checks
let isChecking = false;
let accessGranted = false;

// Check authentication and authorization
async function checkAccess() {
    // Prevent running multiple times
    if (isChecking || accessGranted) {
        return accessGranted;
    }
    
    isChecking = true;
    
    try {
        // Check session storage for user
        const currentUserStr = sessionStorage.getItem('currentUser');
        
        // Redirect to login if not authenticated
        if (!currentUserStr) {
            console.log('❌ No user logged in, redirecting to login');
            window.location.href = 'index.html';
            return false;
        }
        
        const currentUser = JSON.parse(currentUserStr);
        console.log('✅ User authenticated:', currentUser.email);
        
        // Get user data from Firestore to verify
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        
        if (!userDoc.exists()) {
            console.log('❌ User document not found');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
            return false;
        }
        
        const userData = userDoc.data();
        const userRole = userData.role;
        
        // Check if account is active
        if (userData.isActive === false) {
            alert('حسابك غير نشط. يرجى التواصل مع الإدارة');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
            return false;
        }
        
        // Check role authorization based on current page
        const currentPage = window.location.pathname.split('/').pop();
        const rolePages = {
            'admin_dashboard.html': 'admin',
            'manager_dashboard.html': 'manager',
            'teacher_dashboard.html': 'teacher',
            'student_dashboard.html': 'student'
        };
        
        const requiredRole = rolePages[currentPage];
        
        if (requiredRole && userRole !== requiredRole) {
            console.log(`❌ Role mismatch. Required: ${requiredRole}, User: ${userRole}`);
            
            // Redirect to correct dashboard
            const correctPages = {
                'admin': 'admin_dashboard.html',
                'manager': 'manager_dashboard.html',
                'teacher': 'teacher_dashboard.html',
                'student': 'student_dashboard.html'
            };
            
            window.location.href = correctPages[userRole] || 'student_dashboard.html';
            return false;
        }
        
        console.log('✅ Access granted for role:', userRole);
        accessGranted = true;
        return true;
        
    } catch (error) {
        console.error('❌ Access check error:', error);
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return false;
    } finally {
        isChecking = false;
    }
}

// Run check on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAccess();
});

export { checkAccess };