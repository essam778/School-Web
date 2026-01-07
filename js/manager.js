// js/manager.js
import { db, FirebaseHelpers } from './firebaseConfig.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    query,
    where,
    orderBy,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ===== STATE =====
let currentUser = null;
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
        await loadUserData(user.uid);
        
        await Promise.all([
            loadStats(),
            loadTeachers(),
            loadClasses()
        ]);

    } catch (error) {
        FirebaseHelpers.logError('Manager Init', error);
        FirebaseHelpers.showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
        isLoading = false;
    }
}

// ===== LOAD USER DATA =====
async function loadUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        
        if (!userDoc.exists()) {
            console.error('User document not found');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        currentUser = userDoc.data();

        if (currentUser.role !== 'manager' && currentUser.role !== 'admin') {
            console.error('User is not a manager or admin');
            // Don't redirect - dashboardGuard handles this
            return;
        }

        document.getElementById('userName').textContent = currentUser.fullName;
        document.getElementById('welcomeName').textContent = currentUser.fullName;
        document.getElementById('userAvatar').textContent = getInitials(currentUser.fullName);

    } catch (error) {
        FirebaseHelpers.logError('Load User', error);
        throw error;
    }
}

// ===== LOAD STATISTICS =====
async function loadStats() {
    try {
        const [teachers, classes] = await Promise.all([
            getDocs(query(collection(db, 'users'), where('role', '==', 'teacher'))),
            getDocs(collection(db, 'classes'))
        ]);

        animateCounter('teachersCount', teachers.size);
        animateCounter('classesCount', classes.size);

    } catch (error) {
        FirebaseHelpers.logError('Load Stats', error);
    }
}

// ===== LOAD TEACHERS =====
async function loadTeachers() {
    const container = document.getElementById('teachersTableContent');
    
    try {
        // Remove orderBy to avoid index issues
        const q = query(
            collection(db, 'users'), 
            where('role', '==', 'teacher')
        );
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا يوجد مدرسين',
                'لم يتم تسجيل أي مدرس حتى الآن',
                'fas fa-user-tie'
            );
            return;
        }

        let html = '<table><thead><tr>';
        html += '<th>#</th>';
        html += '<th>الاسم</th>';
        html += '<th>البريد الإلكتروني</th>';
        html += '<th>المادة</th>';
        html += '<th>عدد الفصول</th>';
        html += '<th>الحالة</th>';
        html += '<th>الإجراءات</th>';
        html += '</tr></thead><tbody>';

        let index = 1;
        snapshot.forEach(doc => {
            const teacher = doc.data();
            const classesCount = teacher.classes ? teacher.classes.length : 0;
            
            html += `<tr>
                <td>${index++}</td>
                <td><strong>${teacher.fullName || '-'}</strong></td>
                <td>${teacher.email || '-'}</td>
                <td>${teacher.subject || '-'}</td>
                <td>${classesCount}</td>
                <td>
                    <span class="status-badge ${teacher.isActive !== false ? 'status-active' : 'status-inactive'}">
                        ${teacher.isActive !== false ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="icon-btn" onclick="assignTeacherToClass('${doc.id}')" title="تعيين لفصل">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="icon-btn edit" onclick="editTeacher('${doc.id}')" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete" onclick="confirmDelete('teacher', '${doc.id}', '${teacher.fullName}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="icon-btn" onclick="toggleStatus('${doc.id}', ${teacher.isActive !== false})" title="${teacher.isActive !== false ? 'تعطيل' : 'تفعيل'}">
                            <i class="fas fa-${teacher.isActive !== false ? 'ban' : 'check'}"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Teachers', error);
        container.innerHTML = createErrorState('فشل تحميل بيانات المدرسين');
    }
}

// ===== LOAD CLASSES =====
async function loadClasses() {
    const container = document.getElementById('classesTableContent');
    
    try {
        const snapshot = await getDocs(collection(db, 'classes'));

        if (snapshot.empty) {
            container.innerHTML = createEmptyState(
                'لا توجد فصول',
                'لم يتم إنشاء أي فصل دراسي حتى الآن',
                'fas fa-door-open'
            );
            return;
        }

        let html = '<table><thead><tr>';
        html += '<th>#</th>';
        html += '<th>اسم الفصل</th>';
        html += '<th>المرحلة</th>';
        html += '<th>السعة</th>';
        html += '<th>عدد الطلاب</th>';
        html += '<th>الإجراءات</th>';
        html += '</tr></thead><tbody>';

        let index = 1;

        const studentsSnap = await getDocs(collection(db, 'students'));
        const studentCounts = new Map();
        studentsSnap.forEach(doc => {
            const classId = doc.data().classId;
            studentCounts.set(classId, (studentCounts.get(classId) || 0) + 1);
        });

        snapshot.forEach(doc => {
            const classData = doc.data();
            const studentCount = studentCounts.get(doc.id) || 0;
            
            html += `<tr>
                <td>${index++}</td>
                <td><strong>${classData.name || '-'}</strong></td>
                <td>${classData.grade || '-'}</td>
                <td>${classData.capacity || 0}</td>
                <td>${studentCount}</td>
                <td>
                    <div class="table-actions">
                        <button class="icon-btn edit" onclick="editClass('${doc.id}')" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete" onclick="confirmDelete('class', '${doc.id}', '${classData.name}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="icon-btn" onclick="viewClassDetails('${doc.id}')" title="التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        FirebaseHelpers.logError('Load Classes', error);
        container.innerHTML = createErrorState('فشل تحميل بيانات الفصول');
    }
}

// ===== HELPER FUNCTIONS =====
function getInitials(name) {
    if (!name) return 'م';
    return name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
}

function generateUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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

function scrollToSection(id) {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ===== CRUD OPERATIONS =====
async function toggleStatus(userId, currentStatus) {
    try {
        const newStatus = !currentStatus;
        await updateDoc(doc(db, 'users', userId), {
            isActive: newStatus
        });
        
        FirebaseHelpers.showToast(
            newStatus ? 'تم تفعيل المستخدم بنجاح' : 'تم تعطيل المستخدم بنجاح',
            'success'
        );
        
        await loadTeachers();
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Toggle Status', error);
        FirebaseHelpers.showToast('فشل تغيير حالة المستخدم', 'error');
    }
}

async function confirmDelete(type, id, name) {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟\nهذه العملية لا يمكن التراجع عنها.`)) {
        return;
    }

    try {
        if (type === 'teacher') {
            await deleteDoc(doc(db, 'users', id));
            await loadTeachers();
        } else if (type === 'class') {
            await deleteDoc(doc(db, 'classes', id));
            await loadClasses();
        }
        
        FirebaseHelpers.showToast('تم الحلذف بنجاح', 'success');
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Delete', error);
        FirebaseHelpers.showToast('فشل الحذف', 'error');
    }
}

// ===== MODAL FUNCTIONS =====
window.showAddTeacherModal = async () => {
    const fullName = prompt('إدخل اسم المعلم الكامل:');
    if (!fullName) return;
    
    const email = prompt('إدخل البريد الإلكتروني:');
    if (!email) return;
    
    const password = prompt('إدخل كلمة المرور:', '123456');
    if (!password) return;
    
    try {
        // Generate UID
        const uid = generateUID();
        
        // Add to users collection - Teacher will choose subject later
        await setDoc(doc(db, 'users', uid), {
            email: email,
            password: password,
            fullName: fullName,
            role: 'teacher',
            subject: null,
            classes: [],
            isActive: true,
            createdAt: serverTimestamp(),
            lastLogin: null
        });
        
        FirebaseHelpers.showToast('تم إضافة المعلم بنجاح', 'success');
        await loadTeachers();
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Add Teacher', error);
        FirebaseHelpers.showToast('فشل إضافة المعلم: ' + error.message, 'error');
    }
};

window.showAddClassModal = async () => {
    const name = prompt('إدخل اسم الفصل (مثل: الصف الأول أ):');
    if (!name) return;
    
    const grade = prompt('إدخل المرحلة (مثل: الصف الأول):');
    if (!grade) return;
    
    const capacity = prompt('إدخل سعة الفصل:', '30');
    
    try {
        await addDoc(collection(db, 'classes'), {
            name: name,
            grade: grade,
            capacity: parseInt(capacity) || 30,
            createdAt: serverTimestamp()
        });
        
        FirebaseHelpers.showToast('تم إضافة الفصل بنجاح', 'success');
        await loadClasses();
        await loadStats();
    } catch (error) {
        FirebaseHelpers.logError('Add Class', error);
        FirebaseHelpers.showToast('فشل إضافة الفصل: ' + error.message, 'error');
    }
};

window.editTeacher = async (id) => {
    try {
        const teacherDoc = await getDoc(doc(db, 'users', id));
        if (!teacherDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على المعلم', 'error');
            return;
        }
        
        const teacher = teacherDoc.data();
        
        const fullName = prompt('اسم المعلم:', teacher.fullName);
        if (!fullName) return;
        
        const subject = prompt('المادة:', teacher.subject);
        if (!subject) return;
        
        await updateDoc(doc(db, 'users', id), {
            fullName: fullName,
            subject: subject
        });
        
        FirebaseHelpers.showToast('تم تحديث بيانات المعلم', 'success');
        await loadTeachers();
    } catch (error) {
        FirebaseHelpers.logError('Edit Teacher', error);
        FirebaseHelpers.showToast('فشل التحديث', 'error');
    }
};

window.editClass = async (id) => {
    try {
        const classDoc = await getDoc(doc(db, 'classes', id));
        if (!classDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الفصل', 'error');
            return;
        }
        
        const classData = classDoc.data();
        
        const name = prompt('اسم الفصل:', classData.name);
        if (!name) return;
        
        const grade = prompt('المرحلة:', classData.grade);
        if (!grade) return;
        
        const capacity = prompt('سعة الفصل:', classData.capacity);
        
        await updateDoc(doc(db, 'classes', id), {
            name: name,
            grade: grade,
            capacity: parseInt(capacity) || classData.capacity
        });
        
        FirebaseHelpers.showToast('تم تحديث بيانات الفصل', 'success');
        await loadClasses();
    } catch (error) {
        FirebaseHelpers.logError('Edit Class', error);
        FirebaseHelpers.showToast('فشل التحديث', 'error');
    }
};

window.viewStudentDetails = async (id) => {
    try {
        const studentDoc = await getDoc(doc(db, 'students', id));
        if (!studentDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الطالب', 'error');
            return;
        }
        
        const student = studentDoc.data();
        let classInfo = 'غير محدد';
        
        if (student.classId) {
            const classDoc = await getDoc(doc(db, 'classes', student.classId));
            if (classDoc.exists()) {
                classInfo = classDoc.data().name;
            }
        }
        
        const info = `
الاسم: ${student.fullName}
البريد: ${student.email}
الرقم الطلابي: ${student.studentCode}
الفصل: ${classInfo}
رقم الجلوس: ${student.seatNumber}
        `;
        
        alert(info);
    } catch (error) {
        FirebaseHelpers.logError('View Student', error);
        FirebaseHelpers.showToast('فشل عرض التفاصيل', 'error');
    }
};

window.viewClassDetails = async (id) => {
    try {
        const classDoc = await getDoc(doc(db, 'classes', id));
        if (!classDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على الفصل', 'error');
            return;
        }
        
        const classData = classDoc.data();
        
        // Get students count
        const studentsQuery = query(
            collection(db, 'students'),
            where('classId', '==', id)
        );
        const studentsSnap = await getDocs(studentsQuery);
        
        const info = `
اسم الفصل: ${classData.name}
المرحلة: ${classData.grade}
السعة: ${classData.capacity}
عدد الطلاب: ${studentsSnap.size}
الأماكن المتبقية: ${classData.capacity - studentsSnap.size}
        `;
        
        alert(info);
    } catch (error) {
        FirebaseHelpers.logError('View Class', error);
        FirebaseHelpers.showToast('فشل عرض التفاصيل', 'error');
    }
};

// Assign teacher to class
window.assignTeacherToClass = async (teacherId) => {
    try {
        console.log('assignTeacherToClass called for teacher:', teacherId);
        
        // Get available classes
        const classesSnap = await getDocs(collection(db, 'classes'));
        console.log('Classes found:', classesSnap.size);
        
        if (classesSnap.empty) {
            FirebaseHelpers.showToast('يجب إضافة فصول أولاً', 'error');
            return;
        }
        
        let classOptions = 'اختر الفصل لتعيينه:\n\n';
        const classList = [];
        classesSnap.forEach((doc, index) => {
            classList.push({ id: doc.id, ...doc.data() });
            classOptions += `${index + 1}. ${doc.data().name}\n`;
        });
        
        const classIndex = prompt(classOptions);
        console.log('User selected:', classIndex);
        
        if (!classIndex) return;
        
        // Convert to number and check if it's a valid number
        const index = parseInt(classIndex) - 1;
        if (isNaN(index) || index < 0 || index >= classList.length) {
            FirebaseHelpers.showToast('رقم غير صحيح', 'error');
            return;
        }
        
        const selectedClass = classList[index];
        console.log('Selected class:', selectedClass);
        
        // Get current teacher data
        const teacherDoc = await getDoc(doc(db, 'users', teacherId));
        if (!teacherDoc.exists()) {
            FirebaseHelpers.showToast('لم يتم العثور على المعلم', 'error');
            return;
        }
        
        const teacher = teacherDoc.data();
        const currentClasses = teacher.classes || [];
        console.log('Current teacher classes:', currentClasses);
        
        // Check if already assigned
        if (currentClasses.includes(selectedClass.id)) {
            FirebaseHelpers.showToast('المعلم معين بالفعل لهذا الفصل', 'info');
            return;
        }
        
        // Add class to teacher
        currentClasses.push(selectedClass.id);
        console.log('Updating to:', currentClasses);
        
        await updateDoc(doc(db, 'users', teacherId), {
            classes: currentClasses
        });
        
        FirebaseHelpers.showToast(`تم تعيين المعلم لـ ${selectedClass.name}`, 'success');
        await loadTeachers();
    } catch (error) {
        console.error('Assign Teacher Error:', error);
        FirebaseHelpers.logError('Assign Teacher', error);
        FirebaseHelpers.showToast('فشل التعيين: ' + error.message, 'error');
    }
};

window.toggleStatus = toggleStatus;
window.confirmDelete = confirmDelete;
window.scrollToSection = scrollToSection;

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