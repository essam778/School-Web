// js/student.js
import { db, FirebaseHelpers } from './firebaseConfig.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== STATE =====
let currentStudent = null;
let studentData = null;
let isLoading = false;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (isLoading) return;
    isLoading = true;

    try {
        // Get user from session
        const currentUserStr = sessionStorage.getItem('currentUser');
        if (!currentUserStr) {
            console.log('No user in init');
            isLoading = false;
            return;
        }

        const user = JSON.parse(currentUserStr);
        await loadStudentData(user.uid);
        
        await Promise.all([
            loadStatistics(),
            loadAssignments(),
            loadGrades()
        ]);

    } catch (error) {
        FirebaseHelpers.logError('Student Init', error);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
        isLoading = false;
    }
}

// ===== LOAD STUDENT DATA =====
async function loadStudentData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        
        if (!userDoc.exists()) {
            console.error('User document not found');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        currentStudent = { id: uid, ...userDoc.data() };

        if (currentStudent.role !== 'student') {
            console.error('User is not a student');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        const studentsQuery = query(
            collection(db, 'students'),
            where('email', '==', currentStudent.email)
        );
        const studentsSnap = await getDocs(studentsQuery);
        
        if (!studentsSnap.empty) {
            studentData = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
        }

        document.getElementById('userName').textContent = currentStudent.fullName;
        document.getElementById('welcomeName').textContent = currentStudent.fullName;
        document.getElementById('userAvatar').textContent = getInitials(currentStudent.fullName);
        
        if (studentData) {
            document.getElementById('studentCode').textContent = `الرقم: ${studentData.studentCode || '-'}`;
            document.getElementById('seatNumber').textContent = studentData.seatNumber || '-';
            
            if (studentData.classId) {
                const classDoc = await getDoc(doc(db, 'classes', studentData.classId));
                if (classDoc.exists()) {
                    const classInfo = classDoc.data();
                    document.getElementById('classBadge').textContent = classInfo.name || 'الفصل';
                    document.getElementById('studentClass').textContent = classInfo.name || '-';
                    document.getElementById('studentGrade').textContent = classInfo.grade || '-';
                    
                    // Load teacher info
                    await loadTeacherInfo(studentData.classId);
                }
            }
        }

    } catch (error) {
        FirebaseHelpers.logError('Load Student', error);
        throw error;
    }
}

// ===== LOAD TEACHER INFO =====
async function loadTeacherInfo(classId) {
    try {
        // Find teacher assigned to this class
        const teachersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'teacher'),
            where('classes', 'array-contains', classId)
        );
        
        const teachersSnap = await getDocs(teachersQuery);
        
        if (!teachersSnap.empty) {
            const teacher = teachersSnap.docs[0].data();
            
            // Update teacher info elements if they exist
            const teacherNameEl = document.getElementById('teacherName');
            const teacherSubjectEl = document.getElementById('teacherSubject');
            const teacherEmailEl = document.getElementById('teacherEmail');
            
            if (teacherNameEl) teacherNameEl.textContent = teacher.fullName || 'غير محدد';
            if (teacherSubjectEl) teacherSubjectEl.textContent = teacher.subject || 'غير محدد';
            if (teacherEmailEl) teacherEmailEl.textContent = teacher.email || 'غير متوفر';
        } else {
            const teacherNameEl = document.getElementById('teacherName');
            if (teacherNameEl) teacherNameEl.textContent = 'لم يتم تعيين معلم';
        }
    } catch (error) {
        FirebaseHelpers.logError('Load Teacher Info', error);
    }
}

// ===== LOAD STATISTICS =====
async function loadStatistics() {
    try {
        if (!currentStudent) return;

        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('studentId', '==', currentStudent.id)
        );
        
        const attendanceSnap = await getDocs(attendanceQuery);
        let presentCount = 0;
        let totalCount = 0;
        
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'present') presentCount++;
            totalCount++;
        });
        
        const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
        document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;
        document.getElementById('schoolDay').textContent = totalCount;

        const assignmentsQuery = query(
            collection(db, 'assignments'),
            where('status', '==', 'active'),
            where('assignedTo', 'array-contains', currentStudent.id)
        );
        
        const assignmentsSnap = await getDocs(assignmentsQuery);
        const pendingCount = assignmentsSnap.size;
        animateCounter('pendingAssignments', pendingCount);

        const gradesQuery = query(
            collection(db, 'grades'),
            where('studentId', '==', currentStudent.id)
        );
        
        const gradesSnap = await getDocs(gradesQuery);
        let totalGrades = 0;
        let gradeCount = 0;
        
        // Sort grades by createdAt to get most recent for GPA calculation
        const sortedGrades = gradesSnap.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(0);
            const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(0);
            return dateB - dateA; // Descending order
        });
        
        sortedGrades.forEach(doc => {
            const data = doc.data();
            if (data.score && data.maxScore) {
                totalGrades += (data.score / data.maxScore) * 100;
                gradeCount++;
            }
        });
        
        const gpa = gradeCount > 0 ? (totalGrades / gradeCount).toFixed(1) : 0;
        document.getElementById('gpaScore').textContent = gpa;
        
        document.getElementById('progressPercentage').textContent = `${Math.round(gpa)}%`;
        document.getElementById('progressBar').style.width = `${gpa}%`;

        const subjectsSnap = await getDocs(collection(db, 'subjects'));
        animateCounter('totalSubjects', subjectsSnap.size);

    } catch (error) {
        FirebaseHelpers.logError('Load Statistics', error);
    }
}

// ===== LOAD ASSIGNMENTS =====
async function loadAssignments() {
    const container = document.getElementById('assignmentsContainer');
    
    try {
        if (!studentData || !studentData.classId) {
            container.innerHTML = createEmptyState(
                'لا توجد واجبات',
                'لم يتم تعيين أي واجبات بعد',
                'fas fa-tasks'
            );
            return;
        }

        // Query assignments by classId instead of assignedTo array
        const q = query(
            collection(db, 'assignments'),
            where('status', '==', 'active'),
            where('classId', '==', studentData.classId)
        );
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا توجد واجبات معلقة',
                'أحسنت! لقد أكملت جميع واجباتك',
                'fas fa-check-circle',
                '#27ae60'
            );
            return;
        }

        let html = '<div class="assignments-grid">';
        
        snapshot.forEach(doc => {
            const assignment = doc.data();
            
            const today = new Date();
            const dueDate = new Date(assignment.dueDate);
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let dueText = '';
            let priority = 'low';
            
            if (diffDays < 0) {
                dueText = 'متأخر';
                priority = 'high';
            } else if (diffDays === 0) {
                dueText = 'اليوم';
                priority = 'high';
            } else if (diffDays === 1) {
                dueText = 'غداً';
                priority = 'medium';
            } else {
                dueText = `${diffDays} يوم`;
                priority = diffDays <= 3 ? 'medium' : 'low';
            }
            
            const formattedDate = dueDate.toLocaleDateString('ar-EG', {
                month: 'short',
                day: 'numeric'
            });

            html += `
                <div class="assignment-card ${priority}">
                    <div class="assignment-header">
                        <h3>${assignment.title || 'واجب'}</h3>
                        <div class="due-badge">${dueText}</div>
                    </div>
                    <div class="assignment-body">
                        <p>${assignment.description || 'لا يوجد وصف'}</p>
                        <div class="assignment-meta">
                            <div class="meta-item">
                                <div class="label">المادة</div>
                                <div class="value">${assignment.subject || '-'}</div>
                            </div>
                            <div class="meta-item">
                                <div class="label">التسليم</div>
                                <div class="value">${formattedDate}</div>
                            </div>
                            <div class="meta-item">
                                <div class="label">الدرجة</div>
                                <div class="value">${assignment.maxScore || 0}</div>
                            </div>
                        </div>
                        <button class="assignment-btn" onclick="viewAssignment('${doc.id}')">
                            <i class="fas fa-eye"></i> عرض التفاصيل
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Assignments', error);
        container.innerHTML = createErrorState('فشل في تحميل الواجبات');
    }
}

// ===== LOAD GRADES =====
async function loadGrades() {
    const container = document.getElementById('gradesContainer');
    
    try {
        if (!currentStudent) {
            container.innerHTML = createEmptyState(
                'لا توجد درجات',
                'لم يتم إدخال درجات بعد',
                'fas fa-chart-line'
            );
            return;
        }

        const q = query(
            collection(db, 'grades'),
            where('studentId', '==', currentStudent.id)
        );
        
        const snapshot = await getDocs(q);

        // Sort documents by createdAt in descending order
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date(0);
            const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date(0);
            return dateB - dateA; // Descending order (newest first)
        });

        if (sortedDocs.length === 0) {
            container.innerHTML = createEmptyState(
                'لا توجد درجات',
                'لم يتم إدخال أي درجات حتى الآن',
                'fas fa-chart-line'
            );
            return;
        }

        let html = '<table><thead><tr>';
        html += '<th>المادة</th>';
        html += '<th>النوع</th>';
        html += '<th>الدرجة</th>';
        html += '<th>من</th>';
        html += '<th>النسبة</th>';
        html += '<th>التقدير</th>';
        html += '</tr></thead><tbody>';

        sortedDocs.forEach(doc => {
            const grade = doc.data();
            const percentage = grade.maxScore > 0 
                ? ((grade.score / grade.maxScore) * 100).toFixed(1) 
                : 0;
            
            let gradeClass = 'grade-poor';
            let gradeText = 'ضعيف';
            
            if (percentage >= 90) {
                gradeClass = 'grade-excellent';
                gradeText = 'ممتاز';
            } else if (percentage >= 75) {
                gradeClass = 'grade-good';
                gradeText = 'جيد جداً';
            } else if (percentage >= 60) {
                gradeClass = 'grade-average';
                gradeText = 'جيد';
            }
            
            const typeMap = {
                'assignment': 'واجب',
                'exam': 'امتحان',
                'quiz': 'اختبار قصير'
            };

            html += `<tr>
                <td><strong>${grade.subjectName || '-'}</strong></td>
                <td>${typeMap[grade.type] || grade.type || '-'}</td>
                <td>${grade.score || 0}</td>
                <td>${grade.maxScore || 0}</td>
                <td><strong>${percentage}%</strong></td>
                <td><span class="grade-badge ${gradeClass}">${gradeText}</span></td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Grades', error);
        container.innerHTML = createErrorState('فشل في تحميل الدرجات');
    }
}

// ===== HELPER FUNCTIONS =====
function getInitials(name) {
    if (!name) return 'ط';
    return name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
}

function animateCounter(elementId, target) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let current = 0;
    const increment = target / 30;
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 30);
}

function createEmptyState(title, message, icon, color = '#7f8c8d') {
    return `
        <div class="empty-state">
            <i class="${icon}" style="color: ${color};"></i>
            <h3>${title}</h3>
            <p>${message}</p>
        </div>
    `;
}

function createErrorState(message) {
    return `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
            <h3>حدث خطأ</h3>
            <p>${message}</p>
        </div>
    `;
}

// ===== ACTION FUNCTIONS =====
window.viewAssignment = async function(assignmentId) {
    try {
        const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (!assignmentDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الواجب', 'error');
            return;
        }
        
        const assignment = assignmentDoc.data();
        const dueDate = new Date(assignment.dueDate);
        const formattedDate = dueDate.toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const info = `
عنوان الواجب: ${assignment.title}
المادة: ${assignment.subject || '-'}
المعلم: ${assignment.teacherName || '-'}
الوصف: ${assignment.description || 'لا يوجد'}
التسليم: ${formattedDate}
الدرجة العظمى: ${assignment.maxScore || 0}
        `;
        
        alert(info);
    } catch (error) {
        FirebaseHelpers.logError('View Assignment', error);
        FirebaseHelpers.showToast('فشل عرض الواجب', 'error');
    }
};

// ===== LOGOUT =====
window.logoutUser = async function() {
    try {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    } catch (error) {
        FirebaseHelpers.logError('Logout', error);
        FirebaseHelpers.showToast('فشل تسجيل الخروج', 'error');
    }
};