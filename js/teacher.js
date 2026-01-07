// js/teacher.js
import { db, FirebaseHelpers } from './firebaseConfig.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== STATE =====
let currentTeacher = null;
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
        await loadTeacherData(user.uid);
        updateCurrentDate();
        
        await Promise.all([
            loadStatistics(),
            loadTeacherClasses()
        ]);

    } catch (error) {
        FirebaseHelpers.logError('Teacher Init', error);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
        isLoading = false;
    }
}

// ===== LOAD TEACHER DATA =====
async function loadTeacherData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        
        if (!userDoc.exists()) {
            console.error('User document not found');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        currentTeacher = { id: uid, ...userDoc.data() };

        if (currentTeacher.role !== 'teacher') {
            console.error('User is not a teacher');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        document.getElementById('userName').textContent = currentTeacher.fullName;
        document.getElementById('userEmail').textContent = currentTeacher.email;
        document.getElementById('welcomeName').textContent = currentTeacher.fullName;
        document.getElementById('teacherSubject').textContent = currentTeacher.subject || 'غير محدد';
        document.getElementById('subjectBadge').textContent = currentTeacher.subject || 'المادة';
        document.getElementById('userAvatar').textContent = getInitials(currentTeacher.fullName);
        
        // Show subject selection prompt if not set
        if (!currentTeacher.subject) {
            setTimeout(() => {
                selectSubject();
            }, 500);
        }
        
        const classesCount = currentTeacher.classes ? currentTeacher.classes.length : 0;
        document.getElementById('totalClasses').textContent = classesCount;

    } catch (error) {
        FirebaseHelpers.logError('Load Teacher', error);
        throw error;
    }
}

// ===== LOAD STATISTICS =====
async function loadStatistics() {
    try {
        const classesCount = currentTeacher.classes ? currentTeacher.classes.length : 0;
        animateCounter('classesCount', classesCount);

        let totalStudents = 0;
        if (currentTeacher.classes && currentTeacher.classes.length > 0) {
            for (const classId of currentTeacher.classes) {
                const studentsQuery = query(
                    collection(db, 'students'),
                    where('classId', '==', classId)
                );
                const studentsSnap = await getDocs(studentsQuery);
                totalStudents += studentsSnap.size;
            }
        }
        animateCounter('totalStudents', totalStudents);

        const assignmentsQuery = query(
            collection(db, 'assignments'),
            where('teacherId', '==', currentTeacher.id),
            where('status', '==', 'active')
        );
        const assignmentsSnap = await getDocs(assignmentsQuery);
        animateCounter('assignmentsCount', assignmentsSnap.size);

        const today = new Date().toISOString().split('T')[0];
        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('markedBy', '==', currentTeacher.id),
            where('date', '==', today)
        );
        
        const attendanceSnap = await getDocs(attendanceQuery);
        let presentCount = 0;
        let totalAttendance = 0;
        
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'present') presentCount++;
            totalAttendance++;
        });
        
        const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;
        document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;

        const avgGrade = 85;
        document.getElementById('averageGrade').textContent = `${avgGrade}%`;

    } catch (error) {
        FirebaseHelpers.logError('Load Statistics', error);
    }
}

// ===== LOAD TEACHER CLASSES =====
async function loadTeacherClasses() {
    const container = document.getElementById('classesContainer');
    
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            container.innerHTML = createEmptyState(
                'لا توجد فصول مكلف بها',
                'لم يتم تعيين أي فصول لك بعد. يرجى التواصل مع المدير.',
                'fas fa-users-class'
            );
            return;
        }

        const classesData = [];
        for (const classId of currentTeacher.classes) {
            try {
                const classDoc = await getDoc(doc(db, 'classes', classId));
                if (classDoc.exists()) {
                    const studentsQuery = query(
                        collection(db, 'students'),
                        where('classId', '==', classId)
                    );
                    const studentsSnap = await getDocs(studentsQuery);
                    
                    const today = new Date().toISOString().split('T')[0];
                    const attendanceQuery = query(
                        collection(db, 'attendance'),
                        where('classId', '==', classId),
                        where('date', '==', today)
                    );
                    const attendanceSnap = await getDocs(attendanceQuery);
                    
                    let presentCount = 0;
                    attendanceSnap.forEach(doc => {
                        if (doc.data().status === 'present') presentCount++;
                    });
                    
                    const attendanceRate = studentsSnap.size > 0 
                        ? Math.round((presentCount / studentsSnap.size) * 100) 
                        : 0;

                    classesData.push({
                        id: classId,
                        data: classDoc.data(),
                        studentsCount: studentsSnap.size,
                        attendanceRate: attendanceRate
                    });
                }
            } catch (error) {
                console.error(`Error loading class ${classId}:`, error);
            }
        }

        if (classesData.length === 0) {
            container.innerHTML = createEmptyState(
                'لا توجد فصول متاحة',
                'الفصول المخصصة لك غير موجودة في النظام',
                'fas fa-exclamation-triangle'
            );
            return;
        }

        let html = '<div class="classes-grid">';
        
        classesData.forEach(classInfo => {
            const classData = classInfo.data;
            
            html += `
                <div class="class-card">
                    <div class="class-header">
                        <h3>${classData.name || 'فصل بدون اسم'}</h3>
                        <div class="grade">${classData.grade || 'غير محدد'}</div>
                    </div>
                    <div class="class-body">
                        <div class="class-stats">
                            <div class="class-stat-item">
                                <div class="label">الطلاب</div>
                                <div class="value">${classInfo.studentsCount}</div>
                            </div>
                            <div class="class-stat-item">
                                <div class="label">الحضور</div>
                                <div class="value">${classInfo.attendanceRate}%</div>
                            </div>
                            <div class="class-stat-item">
                                <div class="label">السعة</div>
                                <div class="value">${classData.capacity || 0}</div>
                            </div>
                        </div>
                        
                        <div class="class-actions">
                            <button class="class-btn primary" onclick="takeAttendance('${classInfo.id}')">
                                <i class="fas fa-clipboard-check"></i>
                                <span>الحضور</span>
                            </button>
                            <button class="class-btn success" onclick="viewStudents('${classInfo.id}')">
                                <i class="fas fa-users"></i>
                                <span>الطلاب</span>
                            </button>
                            <button class="class-btn info" onclick="createAssignment('${classInfo.id}')">
                                <i class="fas fa-tasks"></i>
                                <span>واجب</span>
                            </button>
                            <button class="class-btn warning" onclick="viewGrades('${classInfo.id}')">
                                <i class="fas fa-chart-line"></i>
                                <span>الدرجات</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Classes', error);
        container.innerHTML = createErrorState('فشل في تحميل الفصول');
    }
}

// ===== HELPER FUNCTIONS =====
function getInitials(name) {
    if (!name) return 'م';
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

function updateCurrentDate() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const dateString = now.toLocaleDateString('ar-EG', options);
    document.getElementById('currentDate').textContent = dateString;
}

function createEmptyState(title, message, icon) {
    return `
        <div class="empty-state">
            <i class="${icon}"></i>
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

//===== ACTION FUNCTIONS =====
function generateUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Teacher selects their subject
window.selectSubject = async function() {
    try {
        const subject = prompt('أدخل المادة التي تدرسها:');
        if (!subject) return;
        
        await updateDoc(doc(db, 'users', currentTeacher.id), {
            subject: subject
        });
        
        currentTeacher.subject = subject;
        document.getElementById('teacherSubject').textContent = subject;
        document.getElementById('subjectBadge').textContent = subject;
        
        FirebaseHelpers.showToast('تم تحديث المادة بنجاح', 'success');
    } catch (error) {
        FirebaseHelpers.logError('Select Subject', error);
        FirebaseHelpers.showToast('فشل تحديث المادة', 'error');
    }
};

// Teacher selects/adds classes
window.selectClasses = async function() {
    try {
        console.log('selectClasses called');
        console.log('Current teacher:', currentTeacher);
        
        const classesSnap = await getDocs(collection(db, 'classes'));
        console.log('Classes found:', classesSnap.size);
        
        if (classesSnap.empty) {
            FirebaseHelpers.showToast('لا توجد فصول متاحة. يجب على المدير إضافة فصول أولاً', 'error');
            return;
        }
        
        let classOptions = 'اختر الفصول لتدريسها:\n\n';
        const classList = [];
        const currentClasses = currentTeacher.classes || [];
        
        classesSnap.forEach((doc, index) => {
            const classData = doc.data();
            const isAssigned = currentClasses.includes(doc.id);
            classList.push({ id: doc.id, ...classData });
            classOptions += `${index + 1}. ${classData.name} ${isAssigned ? '✓' : ''}\n`;
        });
        
        classOptions += '\nأدخل رقم الفصل لإضافته أو إزالته:';
        
        const choice = prompt(classOptions);
        if (!choice) return;
        
        // Convert to number and check if it's a valid number
        const classIndex = parseInt(choice) - 1;
        if (isNaN(classIndex) || classIndex < 0 || classIndex >= classList.length) {
            FirebaseHelpers.showToast('رقم غير صحيح', 'error');
            return;
        }
        
        const selectedClass = classList[classIndex];
        let newClasses = [...currentClasses];
        
        if (currentClasses.includes(selectedClass.id)) {
            // Remove class
            newClasses = newClasses.filter(id => id !== selectedClass.id);
            FirebaseHelpers.showToast(`تم إزالة ${selectedClass.name}`, 'success');
        } else {
            // Add class
            newClasses.push(selectedClass.id);
            FirebaseHelpers.showToast(`تم إضافة ${selectedClass.name}`, 'success');
        }
        
        console.log('Updating classes to:', newClasses);
        
        await updateDoc(doc(db, 'users', currentTeacher.id), {
            classes: newClasses
        });
        
        currentTeacher.classes = newClasses;
        document.getElementById('totalClasses').textContent = newClasses.length;
        
        await loadStatistics();
        await loadTeacherClasses();
    } catch (error) {
        console.error('Select Classes Error:', error);
        FirebaseHelpers.logError('Select Classes', error);
        FirebaseHelpers.showToast('فشل تحديث الفصول: ' + error.message, 'error');
    }
};

window.viewStudents = async function(classId) {
    try {
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );
        const studentsSnap = await getDocs(studentsQuery);
        
        if (studentsSnap.empty) {
            alert('لا يوجد طلاب في هذا الفصل');
            return;
        }
        
        let studentsList = 'قائمة الطلاب:\n\n';
        let index = 1;
        const students = [];
        
        studentsSnap.forEach(doc => {
            const student = doc.data();
            students.push({ id: doc.id, ...student });
            studentsList += `${index}. ${student.fullName} - ${student.studentCode}\n`;
            index++;
        });
        
        studentsList += '\nاختر رقم الطالب لعرض التفاصيل/التعديل أو 0 لإضافة طالب:';
        
        const choice = prompt(studentsList);
        if (!choice) return;
        
        if (choice === '0') {
            await addStudentToClass(classId);
        } else {
            const studentIndex = parseInt(choice) - 1;
            if (studentIndex >= 0 && studentIndex < students.length) {
                await editStudent(students[studentIndex].id, students[studentIndex]);
            }
        }
    } catch (error) {
        FirebaseHelpers.logError('View Students', error);
        FirebaseHelpers.showToast('فشل عرض الطلاب', 'error');
    }
};

async function addStudentToClass(classId) {
    try {
        const fullName = prompt('إدخل اسم الطالب الكامل:');
        if (!fullName) return;
        
        const email = prompt('إدخل البريد الإلكتروني:');
        if (!email) return;
        
        const password = prompt('إدخل كلمة المرور:', '123456');
        if (!password) return;
        
        const studentCode = prompt('إدخل الرقم الطلابي:', 'ST' + Date.now().toString().slice(-6));
        if (!studentCode) return;
        
        const seatNumber = prompt('إدخل رقم الجلوس:', '1');
        
        const uid = generateUID();
        
        // Create in users collection
        await setDoc(doc(db, 'users', uid), {
            email: email,
            password: password,
            fullName: fullName,
            role: 'student',
            isActive: true,
            createdAt: serverTimestamp(),
            lastLogin: null
        });
        
        // Create in students collection with same UID
        await setDoc(doc(db, 'students', uid), {
            email: email,
            fullName: fullName,
            studentCode: studentCode,
            classId: classId,
            seatNumber: parseInt(seatNumber) || 1,
            createdAt: serverTimestamp()
        });
        
        FirebaseHelpers.showToast('تم إضافة الطالب بنجاح', 'success');
        await loadStatistics();
        await loadTeacherClasses();
    } catch (error) {
        FirebaseHelpers.logError('Add Student', error);
        FirebaseHelpers.showToast('فشل إضافة الطالب', 'error');
    }
}

async function editStudent(studentId, studentData) {
    try {
        const fullName = prompt('اسم الطالب:', studentData.fullName);
        if (!fullName) return;
        
        const studentCode = prompt('الرقم الطلابي:', studentData.studentCode);
        if (!studentCode) return;
        
        const seatNumber = prompt('رقم الجلوس:', studentData.seatNumber);
        
        await updateDoc(doc(db, 'students', studentId), {
            fullName: fullName,
            studentCode: studentCode,
            seatNumber: parseInt(seatNumber) || studentData.seatNumber
        });
        
        // Also update users collection
        await updateDoc(doc(db, 'users', studentId), {
            fullName: fullName
        });
        
        FirebaseHelpers.showToast('تم تحديث بيانات الطالب', 'success');
        await loadStatistics();
        await loadTeacherClasses();
    } catch (error) {
        FirebaseHelpers.logError('Edit Student', error);
        FirebaseHelpers.showToast('فشل التحديث', 'error');
    }
}

window.takeAttendance = function(classId) {
    FirebaseHelpers.showToast('سيتم إضافة وظيفة تسجيل الحضور قريباً', 'info');
};

window.createAssignment = async function(classId) {
    try {
        if (!currentTeacher.subject) {
            FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
            return;
        }
        
        const title = prompt('عنوان الواجب:');
        if (!title) return;
        
        const description = prompt('وصف الواجب:');
        if (!description) return;
        
        const dueDate = prompt('تاريخ التسليم (YYYY-MM-DD):', 
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        if (!dueDate) return;
        
        const maxScore = prompt('الدرجة العظمى:', '10');
        
        await addDoc(collection(db, 'assignments'), {
            title: title,
            description: description,
            subject: currentTeacher.subject,
            classId: classId,
            teacherId: currentTeacher.id,
            teacherName: currentTeacher.fullName,
            dueDate: dueDate,
            maxScore: parseInt(maxScore) || 10,
            status: 'active',
            createdAt: serverTimestamp()
        });
        
        FirebaseHelpers.showToast('تم إضافة الواجب بنجاح', 'success');
        await loadStatistics();
    } catch (error) {
        FirebaseHelpers.logError('Create Assignment', error);
        FirebaseHelpers.showToast('فشل إضافة الواجب', 'error');
    }
};

window.viewGrades = async function(classId) {
    try {
        // Get students in this class
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', classId)
        );
        const studentsSnap = await getDocs(studentsQuery);
        
        if (studentsSnap.empty) {
            FirebaseHelpers.showToast('لا يوجد طلاب في هذا الفصل', 'error');
            return;
        }
        
        let studentsList = 'اختر الطالب لإضافة درجة:\n\n';
        const students = [];
        let index = 1;
        
        studentsSnap.forEach(doc => {
            const student = doc.data();
            students.push({ id: doc.id, ...student });
            studentsList += `${index}. ${student.fullName} - ${student.studentCode}\n`;
            index++;
        });
        
        const choice = prompt(studentsList);
        if (!choice) return;
        
        const studentIndex = parseInt(choice) - 1;
        if (studentIndex < 0 || studentIndex >= students.length) return;
        
        const selectedStudent = students[studentIndex];
        await addGrade(selectedStudent.id, selectedStudent.fullName, classId);
        
    } catch (error) {
        FirebaseHelpers.logError('View Grades', error);
        FirebaseHelpers.showToast('فشل عرض الدرجات', 'error');
    }
};

async function addGrade(studentId, studentName, classId) {
    try {
        const typeOptions = 'نوع التقييم:\n1. واجب\n2. امتحان\n3. اختبار قصير';
        const typeChoice = prompt(typeOptions);
        if (!typeChoice) return;
        
        const types = ['assignment', 'exam', 'quiz'];
        const typeIndex = parseInt(typeChoice) - 1;
        if (typeIndex < 0 || typeIndex > 2) return;
        
        const type = types[typeIndex];
        
        const score = prompt('الدرجة التي حصل عليها الطالب:');
        if (!score) return;
        
        const maxScore = prompt('الدرجة العظمى:', '10');
        if (!maxScore) return;
        
        const notes = prompt('ملاحظات (اختياري):', '');
        
        await addDoc(collection(db, 'grades'), {
            studentId: studentId,
            studentName: studentName,
            classId: classId,
            teacherId: currentTeacher.id,
            teacherName: currentTeacher.fullName,
            subjectName: currentTeacher.subject,
            type: type,
            score: parseFloat(score) || 0,
            maxScore: parseFloat(maxScore) || 10,
            notes: notes || '',
            createdAt: serverTimestamp()
        });
        
        FirebaseHelpers.showToast(`تم إضافة درجة ${studentName}`, 'success');
    } catch (error) {
        FirebaseHelpers.logError('Add Grade', error);
        FirebaseHelpers.showToast('فشل إضافة الدرجة', 'error');
    }
}

window.showAttendanceModal = function() {
    FirebaseHelpers.showToast('اختر فصلاً من القائمة أدناه لتسجيل الحضور', 'info');
};

window.showAssignmentModal = async function() {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }
        
        if (!currentTeacher.subject) {
            FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
            return;
        }
        
        // Get class names
        let classOptions = 'اختر الفصل:\n\n';
        const classList = [];
        
        for (let i = 0; i < currentTeacher.classes.length; i++) {
            const classId = currentTeacher.classes[i];
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
                const classData = classDoc.data();
                classList.push({ id: classId, ...classData });
                classOptions += `${i + 1}. ${classData.name}\n`;
            }
        }
        
        const choice = prompt(classOptions);
        if (!choice) return;
        
        const classIndex = parseInt(choice) - 1;
        if (classIndex < 0 || classIndex >= classList.length) return;
        
        const selectedClass = classList[classIndex];
        await createAssignment(selectedClass.id);
        
    } catch (error) {
        FirebaseHelpers.logError('Show Assignment Modal', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج الواجب', 'error');
    }
};

window.showGradesModal = async function() {
    try {
        if (!currentTeacher.classes || currentTeacher.classes.length === 0) {
            FirebaseHelpers.showToast('يجب اختيار فصول أولاً', 'error');
            return;
        }
        
        if (!currentTeacher.subject) {
            FirebaseHelpers.showToast('يجب تحديد المادة أولاً', 'error');
            return;
        }
        
        // Get class names
        let classOptions = 'اختر الفصل:\n\n';
        const classList = [];
        
        for (let i = 0; i < currentTeacher.classes.length; i++) {
            const classId = currentTeacher.classes[i];
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
                const classData = classDoc.data();
                classList.push({ id: classId, ...classData });
                classOptions += `${i + 1}. ${classData.name}\n`;
            }
        }
        
        const choice = prompt(classOptions);
        if (!choice) return;
        
        const classIndex = parseInt(choice) - 1;
        if (classIndex < 0 || classIndex >= classList.length) return;
        
        const selectedClass = classList[classIndex];
        await viewGrades(selectedClass.id);
        
    } catch (error) {
        FirebaseHelpers.logError('Show Grades Modal', error);
        FirebaseHelpers.showToast('فشل في فتح نموذج الدرجات', 'error');
    }
};

window.showAnnouncementModal = function() {
    FirebaseHelpers.showToast('سيتم إضافة وظيفة إرسال الإشعارات قريباً', 'info');
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