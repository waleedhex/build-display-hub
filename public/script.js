const letters = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
const colorSets = [
    { red: '#ff4081', green: '#81c784' },
    { red: '#f8bbd0', green: '#4dd0e1' },
    { red: '#d32f2f', green: '#0288d1' },
    { red: '#ff5722', green: '#388e3c' }
];
let currentColorSetIndex = 0;
let isSwapped = false;
let defaultQuestions = {};
let goldenLetter = null; // متغير لتخزين الحرف الذهبي المختار عشوائيًا

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('حدث beforeinstallprompt تم التقاطه، التطبيق قابل للتثبيت'); // beforeinstallprompt event captured, app is installable
    const saveButton = document.getElementById('saveButton');
    if (saveButton && !isPWA()) {
        saveButton.style.display = 'inline-block';
    }
});

function getColorCycle() {
    return [
        '#ffffe0',
        '#ffa500',
        colorSets[currentColorSetIndex].red,
        colorSets[currentColorSetIndex].green,
        '#ffffe0'
    ];
}

let ws = null;
let pingInterval = null; // Variable to store ping timeout ID
let isHost = false;
let partyInterval = null;
let currentQuestionLetter = '';
const usedQuestions = {};
let phoneNumber = localStorage.getItem('sessionCode') || null;
let isAdmin = false;
let playerName = '';
let token = localStorage.getItem('sessionToken') || null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectInterval = 3000;
let isAdsFetched = false;
let joinErrorAttempts = 0;
const maxJoinErrorAttempts = 3;

// Function to check if WebSocket connection is open
function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
}

// Function to check if WebSocket connection is closed
function isClosed() {
    return !ws || ws.readyState === WebSocket.CLOSED;
}

function connectWebSocket() {
    // If connection exists and is not closed, do nothing
    if (ws && !isClosed()) return;

    ws = new WebSocket(window.location.protocol === 'https:' ? 'wss://' + window.location.host : 'ws://' + window.location.host);

    ws.onopen = () => {
        console.log('✅ تم الاتصال بـ WebSocket'); // WebSocket connected
        reconnectAttempts = 0;
        joinErrorAttempts = 0;
        hideConnectionLost();

        // Clear any existing ping timeout
        if (pingInterval) clearInterval(pingInterval);

        // Send periodic ping every 5 seconds
        pingInterval = setInterval(() => {
            if (isConnected()) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 5000);

        // Extract session code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const sessionCode = urlParams.get('sessionCode');
        const createdAt = urlParams.get('createdAt');
        const phoneScreen = document.getElementById('phoneScreen');
        const welcomeScreen = document.getElementById('welcomeScreen');
        const loadingScreen = document.getElementById('loadingScreen');

        // Check for required DOM elements
        if (!phoneScreen || !welcomeScreen || !loadingScreen) {
            console.error('لم يتم العثور على عناصر DOM المطلوبة:', { phoneScreen, welcomeScreen, loadingScreen }); // Required DOM elements not found
            showToast('خطأ في تحميل الصفحة، يرجى إعادة المحاولة', 'error'); // Page load error, please try again
            return;
        }

        // Add a small delay to ensure DOM stability
        setTimeout(() => {
            if (sessionCode && createdAt) {
                // Validate invitation link on client side
                const now = Date.now();
                const hoursDifference = (now - parseInt(createdAt)) / (1000 * 60 * 60);
                if (hoursDifference > 4) {
                    console.log('رابط الدعوة منتهي الصلاحية'); // Invitation link expired
                    showToast('رابط الدعوة منتهي الصلاحية، يرجى إدخال رمز جديد', 'error'); // Invitation link expired, please enter new code
                    phoneScreen.classList.add('active');
                    welcomeScreen.classList.remove('active');
                    loadingScreen.classList.remove('active');
                    document.getElementById('phoneNumber').value = '';
                    return;
                }
                console.log('إرسال التحقق من الهاتف من معلمة URL:', sessionCode); // Sending phone verification from URL parameter
                phoneNumber = sessionCode.toUpperCase();
                ws.send(JSON.stringify({
                    type: 'verifyPhone',
                    data: {
                        phoneNumber: sessionCode,
                        isInviteLink: true,
                        createdAt: createdAt
                    }
                }));
                phoneScreen.classList.remove('active');
                welcomeScreen.classList.remove('active');
                loadingScreen.classList.add('active');
                document.getElementById('phoneNumber').value = sessionCode;
            } else if (phoneNumber && isPWA()) { // Autofil only in PWA
                console.log('عرض شاشة إدخال الرمز مع التعبئة التلقائية في PWA:', phoneNumber); // Displaying code entry screen with autofill in PWA
                phoneScreen.classList.add('active');
                welcomeScreen.classList.remove('active');
                loadingScreen.classList.remove('active');
                document.getElementById('phoneNumber').value = phoneNumber;
            } else {
                console.log('عرض شاشة إدخال الرمز بدون تعبئة تلقائية'); // Displaying code entry screen without autofill
                phoneScreen.classList.add('active');
                welcomeScreen.classList.remove('active');
                loadingScreen.classList.remove('active');
                document.getElementById('phoneNumber').value = '';
            }
        }, 100); // 100 milliseconds
    };

    ws.onclose = () => {
        console.warn('⚠️ الاتصال مقطوع. سيتم إعادة المحاولة...'); // Connection lost. Retrying...
        if (pingInterval) clearInterval(pingInterval);
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts), 30000);
            setTimeout(connectWebSocket, delay);
            reconnectAttempts++;
            document.getElementById('loadingScreen')?.classList.add('active');
            document.getElementById('phoneScreen')?.classList.remove('active');
            document.getElementById('welcomeScreen')?.classList.remove('active');
        } else {
            console.error('❌ تم الوصول للحد الأقصى لمحاولات إعادة الاتصال'); // Max reconnect attempts reached
            showConnectionLost(true);
            document.getElementById('loadingScreen')?.classList.remove('active');
            document.getElementById('phoneScreen')?.classList.add('active');
        }
    };

    ws.onerror = (err) => {
        console.error('💥 حدث خطأ في WebSocket:', err); // WebSocket error occurred
        ws.close();
        document.getElementById('loadingScreen')?.classList.add('active');
        document.getElementById('phoneScreen')?.classList.remove('active');
        document.getElementById('welcomeScreen')?.classList.remove('active');
    };

    ws.onmessage = handleMessages;
    // ws.onpong removed here, as isAlive logic is now handled on the server side
}

function showConnectionLost(showButton = false) {
    let connectionLostDiv = document.getElementById('connectionLost');
    // Dynamic creation removed as per instructions to prevent null errors
    if (!connectionLostDiv) {
        console.error('لم يتم العثور على عنصر connectionLost. يجب أن يكون موجودًا في index.html'); // connectionLost element not found. It must be in index.html
        return;
    }
    const button = document.getElementById('connectionLostButton'); // Get the button by its ID
    if (button) {
        button.style.display = showButton ? 'block' : 'none';
    }
    connectionLostDiv.style.display = 'flex';
}

// Fixed hideConnectionLost to check for element existence before modifying style
function hideConnectionLost() {
    const connectionLost = document.getElementById('connectionLost');
    const connectionLostButton = document.getElementById('connectionLostButton');
    if (connectionLost) {
        connectionLost.style.display = 'none';
    }
    if (connectionLostButton) {
        connectionLostButton.style.display = 'none';
    }
}

// Ensure resetToPhoneScreen does not remove sessionCode from URL
function resetToPhoneScreen() {
    document.getElementById('hostScreen').classList.remove('active');
    document.getElementById('contestantScreen').classList.remove('active');
    document.getElementById('welcomeScreen').classList.remove('active');
    document.getElementById('phoneScreen').classList.add('active');
    document.getElementById('announcementsContainer').classList.remove('hidden');
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('sessionCode'); // Keep this if we want to clear the stored phone number
    token = null;
    phoneNumber = null; // Also clear in memory
    playerName = '';
    isHost = false;
    isAdmin = false;
    isAdsFetched = false;
    reconnectAttempts = 0;
    joinErrorAttempts = 0;
    hideConnectionLost();
    // Removed: window.history.replaceState({}, document.title, window.location.pathname);
}

function showToast(message, type = 'success', duration = 3000) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        document.body.appendChild(toast);
    }
    toast.className = `toast ${type}`;
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

// Function to check if the app is running as a Progressive Web App (PWA)
function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true ||
          window.location.search.includes('source=pwa');
}


function handleMessages(event) {
    const { type, data } = JSON.parse(event.data);
    if (type === 'codeVerified') {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionCode = urlParams.get('sessionCode');
        if (sessionCode) {
            phoneNumber = sessionCode.toUpperCase();
        } else {
            phoneNumber = document.getElementById('phoneNumber').value.trim().toUpperCase();
        }
        localStorage.setItem('sessionCode', phoneNumber); // Store session code
        isAdmin = (phoneNumber === 'IMWRA143');
        document.getElementById('phoneScreen').classList.remove('active');
        document.getElementById('welcomeScreen').classList.add('active');
        document.getElementById('loadingScreen').classList.remove('active'); // Hide loading screen on verification
        document.getElementById('phoneError').innerText = '';
        if (isAdmin) {
            document.getElementById('adminPanel').style.display = 'block';
            fetchGeneralQuestions();
            fetchSessionQuestions();
            updateCodesCount();
            fetchAnnouncements();
        }
        if (!isAdsFetched) fetchAnnouncements();
    } else if (type === 'codeError') {
        document.getElementById('phoneError').innerText = data;
        document.getElementById('phoneError').className = 'error-message';
        document.getElementById('phoneScreen').classList.add('active');
        document.getElementById('welcomeScreen').classList.remove('active');
        document.getElementById('loadingScreen').classList.remove('active'); // Hide loading screen on error
        showToast(data, 'error'); // Display error message as toast
    } else if (type === 'init') {
        token = data.token || token;
        if (token) {
            localStorage.setItem('sessionToken', token);
            console.log('تم حفظ الرمز في التخزين المحلي:', token); // Token saved in local storage
        }
        defaultQuestions = data.questions || {};
        currentColorSetIndex = data.colorSetIndex;
        isSwapped = data.isSwapped;
        goldenLetter = data.goldenLetter || null; // تحديث الحرف الذهبي عند التهيئة

        // Load saved session data from local storage if available and not overridden by server data
        const savedSession = localStorage.getItem('savedSession');
        if (savedSession && !data.hexagons) {
            const sessionData = JSON.parse(savedSession);
            updateGrid(sessionData.hexagons, sessionData.lettersOrder, isHost ? 'hexGridHost' : 'hexGridContestant');
            updateTeams(sessionData.teams);
            currentColorSetIndex = sessionData.colorSetIndex;
            isSwapped = sessionData.isSwapped;
        } else {
            updateGrid(data.hexagons, data.lettersOrder, isHost ? 'hexGridHost' : 'hexGridContestant');
            updateTeams(data.teams);
        }

        updateBuzzer(data.buzzer);
        if (!isAdsFetched) fetchAnnouncements();
        joinErrorAttempts = 0; // Reset joinError attempts
    } else if (type === 'codesGenerated') {
        const generatedCodesDiv = document.getElementById('generatedCodes');
        generatedCodesDiv.innerHTML = 'الرموز الجديدة:<br>' + data.join('<br>'); // New codes
        showToast('تم توليد الرموز بنجاح', 'success'); // Codes generated successfully
        document.getElementById('copyCodesButton').style.display = 'inline';
        updateCodesCount();
    } else if (type === 'specialCodesGenerated') {
        const specialCodesTextarea = document.getElementById('specialGeneratedCodes');
        specialCodesTextarea.value = data.join('\n');
        showToast('تم توليد الرموز الخاصة بنجاح', 'success'); // Special codes generated successfully
        document.getElementById('copySpecialCodesButton').style.display = 'inline';
        updateCodesCount();
    } else if (type === 'manualCodeAdded') {
        document.getElementById('generatedCodes').innerHTML = `تم إضافة الرمز: ${data}`; // Code added
        showToast('تمت الإضافة بنجاح', 'success'); // Added successfully
        document.getElementById('copyCodesButton').style.display = 'none';
        updateCodesCount();
    } else if (type === 'codeDeleted') {
        document.getElementById('generatedCodes').innerHTML = `تم حذف الرمز: ${data}`; // Code deleted
        showToast('تم الحذف بنجاح', 'success'); // Deleted successfully
        document.getElementById('copyCodesButton').style.display = 'none';
        updateCodesCount();
    } else if (type === 'codesDeleted') {
        showToast(`تم حذف ${data.length} رمز`, 'success'); // Deleted... codes
        document.getElementById('generatedCodes').innerHTML = '';
        updateCodesCount();
    } else if (type === 'adminError') {
        showToast(data, 'error');
        document.getElementById('adminStatus').innerText = '';
    } else if (type === 'generalQuestions') {
        displayGeneralQuestions(data);
        document.getElementById('questionsCount').innerText = `عدد الأسئلة العامة: ${data.length}`; // Number of general questions
    } else if (type === 'sessionQuestions') {
        displaySessionQuestions(data);
    } else if (type === 'generalQuestionAdded' || type === 'generalQuestionsAdded') {
        showToast(data, 'success');
        fetchGeneralQuestions();
    } else if (type === 'generalQuestionsDeleted') {
        showToast('تم حذف الأسئلة المحددة', 'success'); // Selected questions deleted
        fetchGeneralQuestions();
    } else if (type === 'addedToGeneral') {
        showToast('تم إضافة الأسئلة المحددة إلى العام', 'success'); // Selected questions added to general
        fetchGeneralQuestions();
        fetchSessionQuestions();
    } else if (type === 'codesCount') {
        document.getElementById('codesCount').innerText = `إجمالي عدد الرموز: ${data}`; // Total number of codes
    } else if (type === 'codesExported') {
        showToast('تم نسخ الرموز بنجاح، الملف محفوظ', 'success'); // Codes copied successfully, file saved
        document.getElementById('adminError').innerText = '';
        const { filename, content } = data;
        const blob = new Blob([new Uint8Array(atob(content).split('').map(c => c.charCodeAt(0)))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } else if (type === 'codesImported') {
        showToast(data, 'success');
        document.getElementById('adminError').innerText = '';
        document.getElementById('restoreFile').value = '';
        updateCodesCount();
    } else if (type === 'activeAnnouncements') {
        displayAnnouncements(data);
        isAdsFetched = true;
    } else if (type === 'Announcements') {
        displayAdminAnnouncements(data);
    } else if (type === 'announcementAdded') {
        showToast(data, 'success');
        fetchAnnouncements();
    } else if (type === 'announcementDeleted') {
        showToast(data, 'success');
        fetchAnnouncements();
    } else if (type === 'displayLink') {
        const modal = document.getElementById('shareModal');
        const shareLink = document.getElementById('shareLink');
        const qrCodeDiv = document.getElementById('qrCode');
        shareLink.value = data.url;
        qrCodeDiv.innerHTML = '';
        new QRCode(qrCodeDiv, {
            text: data.url,
            width: 150,
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        modal.style.display = 'flex';
    } else if (type === 'inviteLink') {
        const inviteModal = document.getElementById('inviteModal');
        const inviteLink = document.getElementById('inviteLink');
        const inviteQrCodeDiv = document.getElementById('inviteQrCode');
        inviteLink.value = data.url;
        inviteQrCodeDiv.innerHTML = '';
        new QRCode(inviteQrCodeDiv, {
            text: data.url,
            width: 150,
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        inviteModal.style.display = 'flex';
    } else if (type === 'questionAdded') {
        showToast(data, 'success');
    }
    else if (type === 'updateHexagon') {
        const hex = document.querySelector(`#${isHost ? 'hexGridHost' : 'hexGridContestant'} .changeable[data-letter="${data.letter}"]`);
        if (hex) {
            hex.style.backgroundColor = data.color;
            hex.dataset.clickCount = data.clickCount;
            if (data.clickCount === '1') {
                currentQuestionLetter = data.letter;
                showQuestionAndAnswer(data.letter);
            } else if (data.clickCount === '0') {
                document.getElementById('currentQuestion').innerText = '';
            }
        }
    } else if (type === 'shuffle') {
        goldenLetter = data.goldenLetter || null; // تحديث الحرف الذهبي عند الخلط
        updateGrid(data.hexagons, data.lettersOrder, isHost ? 'hexGridHost' : 'hexGridContestant');
        stopPartyMode();
    } else if (type === 'swapColors') {
        isSwapped = data.isSwapped;
        updateGrid(data.hexagons, data.lettersOrder, isHost ? 'hexGridHost' : 'hexGridContestant');
    } else if (type === 'changeColors') {
        currentColorSetIndex = data.colorSetIndex;
        updateGrid(data.hexagons, data.lettersOrder, isHost ? 'hexGridHost' : 'hexGridContestant');
        stopPartyMode();
    } else if (type === 'party') {
        if (data.active) startPartyMode(); else stopPartyMode();
    } else if (type === 'goldenLetterActivated') {
        console.log('Received goldenLetterActivated:', data);
        if (data.active && data.letter === goldenLetter) {
            startGoldenLetterCelebration();
        }
    }
    else if (type === 'buzzer') {
        updateBuzzer(data);
        // Start of modification for background change
        const container = document.querySelector('.container');
        if (data.active && data.team) {
            requestAnimationFrame(() => {
                if (data.team === 'red') {
                    container.classList.add(isSwapped ? 'team-background-green' : 'team-background-red');
                    container.classList.remove(isSwapped ? 'team-background-red' : 'team-background-green');
                } else if (data.team === 'green') {
                    container.classList.add(isSwapped ? 'team-background-red' : 'team-background-green');
                    container.classList.remove(isSwapped ? 'team-background-green' : 'team-background-red');
                } else {
                    showToast('خطأ في تحديد الفريق!', 'error'); // Error in determining team!
                    return;
                }
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        container.classList.remove('team-background-red', 'team-background-green');
                    });
                }, 1000); // Remove background classes after 1 second
            });
        } else {
            requestAnimationFrame(() => {
                container.classList.remove('team-background-red', 'team-background-green');
            });
        }
        // End of modification for background change
        if (data.active && isHost) {
            const audio = document.getElementById('buzzerSound');
            audio.play().catch(err => console.error('خطأ في تشغيل صوت الجرس:', err)); // Error playing buzzer sound
        }
    } else if (type === 'timeUpWarning') {
        const info = document.getElementById(isHost ? 'buzzerInfo' : 'contestantBuzzerInfo');
        info.innerText = data.message;
        const audio = document.getElementById('timeUpSound');
        audio.play().catch(err => console.error('خطأ في تشغيل صوت انتهاء الوقت:', err)); // Error playing time up sound
    } else if (type === 'timeUp') {
        updateBuzzer({ active: false, player: '', team: null });
    } else if (type === 'resetBuzzer') {
        updateBuzzer({ active: false, player: '', team: null });
    } else if (type === 'updateTeams') {
        updateTeams(data);
    } else if (type === 'updateQuestions') {
        defaultQuestions.session = data;
    } else if (type === 'joinError') {
        if (isHost && data.includes('يوجد مضيف بالفعل') && joinErrorAttempts < maxJoinErrorAttempts) { // Host already exists
            joinErrorAttempts++;
            console.log(`محاولة خطأ الانضمام ${joinErrorAttempts}`); // Join error attempt
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    if (token) {
                        ws.send(JSON.stringify({ type: 'reconnect', data: { token } }));
                    } else if (phoneNumber && playerName) {
                        ws.send(JSON.stringify({ type: 'join', data: { role: 'host', name: playerName, phoneNumber } }));
                    }
                }
            }, 2000);
            showToast('يوجد مضيف بالفعل، جاري إعادة المحاولة...', 'warning'); // Host already exists, retrying...
        } else {
            document.getElementById('welcomeScreen').classList.add('active');
            document.getElementById('hostScreen').classList.remove('active');
            document.getElementById('contestantScreen').classList.remove('active');
            document.getElementById('welcomeError').innerText = data;
            document.getElementById('welcomeError').className = 'error-message';
            joinErrorAttempts = 0;
        }
    } else if (type === 'error') {
        if (data.includes('رمز مؤقت غير صالح') || data.includes('الجلسة غير موجودة')) { // Invalid temporary code / Session not found
            showToast('انتهت صلاحية الجلسة، جاري التحقق من الرمز...', 'warning'); // Session expired, checking code...
            if (phoneNumber && ws && ws.readyState === WebSocket.OPEN) {
                console.log('محاولة توليد توكن جديد باستخدام phoneNumber:', phoneNumber); // Attempting to generate new token using phoneNumber
                ws.send(JSON.stringify({
                    type: 'verifyPhone',
                    data: { phoneNumber, isInviteLink: false }
                }));
                document.getElementById('phoneScreen').classList.remove('active');
                document.getElementById('welcomeScreen').classList.remove('active');
                document.getElementById('loadingScreen').classList.add('active');
            } else {
                showToast('يرجى إدخال رمز جلسة جديد', 'error'); // Please enter a new session code
                resetToPhoneScreen();
            }
        }
    }
}

// Run WebSocket connection on page load
window.onload = () => {
    createHexGrid('hexGridHost', true);
    createHexGrid('hexGridContestant', false);
    updateCodesCount();
    const audio = document.getElementById('buzzerSound');
    audio.load();
    const timeUpAudio = document.getElementById('timeUpSound');
    timeUpAudio.load();
    const winningSound = document.getElementById('winningSound');
    if (winningSound) {
        winningSound.load();
    }
    const goldSound = document.getElementById('goldSound'); // تحميل صوت الحرف الذهبي
    if (goldSound) {
        goldSound.load();
    }
    connectWebSocket(); // Start connection
    window.addEventListener('resize', handleResize);
    initializeShareModal();
    initializeToggle(); // Call initializeToggle here
    document.addEventListener('click', (event) => {
        if (event.target.id === 'nextQuestionButton') {
            console.log('تم النقر على زر السؤال التالي عبر المستند، الحرف الحالي للسؤال:', currentQuestionLetter); // Next question button clicked via document, current question letter
            if (currentQuestionLetter) {
                console.log('استدعاء showQuestionAndAnswer بالحرف:', currentQuestionLetter); // Calling showQuestionAndAnswer with letter
                showQuestionAndAnswer(currentQuestionLetter);
            } else {
                console.log('لم يتم تحديد حرف للسؤال التالي'); // No letter selected for next question
                showToast('الرجاء اختيار حرف أولاً', 'error'); // Please select a letter first
            }
        }
    });

    // Ensure save button is hidden if PWA
    if (isPWA()) {
        const saveButton = document.getElementById('saveButton');
        if (saveButton) {
            saveButton.style.display = 'none';
        }
    }

    // Add event listener for copyGeneralQuestionsButton
    document.getElementById('copyGeneralQuestionsButton').addEventListener('click', async () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast('لا يوجد اتصال بالخادم!', 'error'); // No server connection!
            return;
        }
        const questions = Array.from(document.querySelectorAll('#generalQuestionsList .question-item'))
            .map(div => {
                // Extract letter, question, and answer from the div's text content
                const textContent = div.innerText.trim();
                const parts = textContent.split(' - ');
                // Ensure there are at least 3 parts for letter, question, and answer
                if (parts.length >= 3) {
                    return {
                        letter: parts[0].trim(),
                        question: parts[1].trim(),
                        answer: parts[2].trim()
                    };
                }
                return null; // Return null for malformed items
            })
            .filter(q => q !== null); // Filter out any null entries

        if (questions.length === 0) {
            showToast('لا توجد أسئلة لنسخها!', 'error'); // No questions to copy!
            return;
        }
        // Format the questions as tabular text (letter, question, answer separated by tabs)
        const text = questions.map(q => `${q.letter}\t${q.question}\t${q.answer}`).join('\n');
        try {
            // Attempt to copy using the modern Clipboard API
            await navigator.clipboard.writeText(text);
            showToast('تم نسخ الأسئلة كنص جدولي!', 'success'); // Questions copied as tabular text!
        } catch (err) {
            console.error('فشل في نسخ الأسئلة:', err); // Failed to copy questions
            // Fallback to the old document.execCommand method if Clipboard API fails
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast('تم نسخ الأسئلة كنص جدولي!', 'success'); // Questions copied as tabular text!
            } catch (execErr) {
                console.error('فشل النسخ الاحتياطي:', execErr); // Backup copy failed
                showToast('فشل النسخ، حاول مرة أخرى', 'error'); // Failed to copy, try again
            }
        }
    });

    document.getElementById('addAnnouncementButton').addEventListener('click', () => {
        const title = document.getElementById('announcementTitle').value.trim();
        const text = document.getElementById('announcementText').value.trim();
        const link = document.getElementById('announcementLink').value.trim();
        const button_text = document.getElementById('announcementButtonText').value.trim();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'addAnnouncement', data: { title, text, link, button_text, phoneNumber } }));
            document.getElementById('announcementTitle').value = '';
            document.getElementById('announcementText').value = '';
            document.getElementById('announcementLink').value = '';
            document.getElementById('announcementButtonText').value = '';
        } else {
            showToast('لا يوجد اتصال بالخادم!', 'error'); // No server connection!
        }
    });
};

function handleResize() {
    const sizeSlider = document.getElementById('sizeSlider');
    if (sizeSlider) {
        sizeSlider.value = 100;
        const scaleFactor = sizeSlider.value / 100;
        document.documentElement.style.setProperty('--scale-factor', scaleFactor);
    }
}

function initializeSizeSlider() {
    const sizeSlider = document.getElementById('sizeSlider');
    if (sizeSlider) {
        sizeSlider.max = 100;
        sizeSlider.min = 40;
        sizeSlider.value = 100;
        document.documentElement.style.setProperty('--scale-factor', 1);
        const updateGridScale = () => {
            const scaleFactor = sizeSlider.value / 100;
            console.log('قيمة شريط التمرير:', sizeSlider.value, 'عامل القياس:', scaleFactor); // Slider value, scale factor
            requestAnimationFrame(() => {
                document.documentElement.style.setProperty('--scale-factor', scaleFactor);
            });
        };
        sizeSlider.addEventListener('input', updateGridScale);
        sizeSlider.addEventListener('change', updateGridScale);
    } else {
        console.error('لم يتم العثور على عنصر sizeSlider في DOM'); // sizeSlider element not found in DOM
    }
}

function initializeShareModal() {
    const shareButton = document.getElementById('shareButton');
    const closeModal = document.getElementById('closeModal');
    const copyLinkButton = document.getElementById('copyLinkButton');
    const modal = document.getElementById('shareModal');
    const inviteButton = document.getElementById('inviteFriendsButton'); // Get invite button
    const closeInviteModal = document.getElementById('closeInviteModal'); // Get close button for invite modal
    const copyInviteLinkButton = document.getElementById('copyInviteLinkButton'); // Get copy button for invite link
    const shareInviteLinkButton = document.getElementById('shareInviteLinkButton'); // Get share button for invite link
    const inviteModal = document.getElementById('inviteModal'); // Get invite modal

    // Start of the code block requested by the user
    const saveButton = document.getElementById('saveButton');
    const installModal = document.getElementById('installModal');
    const closeInstallModal = document.getElementById('closeInstallModal');
    const installInstructions = document.getElementById('installInstructions');

    if (saveButton && installModal && installInstructions) {
        saveButton.addEventListener('click', () => {
            installInstructions.innerHTML = `
                <strong>طريقة تثبيت التطبيق:</strong><br>
                - <strong>على آيفون:</strong> اضغط على <span style="color: gold;">مشاركة</span> ثم اختر "إضافة إلى الشاشة الرئيسية".<br>
                - <strong>على أندرويد:</strong> من القائمة، اختر "تثبيت التطبيق".
            `;
            installModal.style.display = 'flex';
        });
    }

    if (closeInstallModal) {
        closeInstallModal.addEventListener('click', () => {
            installModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === installModal) {
            installModal.style.display = 'none';
        }
    });
    // End of the code block requested by the user

    if (shareButton) {
        shareButton.addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'generateDisplayLink', data: { phoneNumber } }));
            } else {
                showToast('لا يوجد اتصال بالخادم!', 'error'); // No server connection!
            }
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (copyLinkButton) {
        copyLinkButton.addEventListener('click', () => {
            const shareLink = document.getElementById('shareLink');
            shareLink.select(); // Select text in input field
            document.execCommand('copy'); // Use document.execCommand for clipboard operations in iFrames
            showToast('تم نسخ الرابط بنجاح!', 'success'); // Link copied successfully!
        });
    }

    if (inviteButton) { // Event listener for invite friends button
        inviteButton.addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'generateInviteLink', data: { phoneNumber } }));
            } else {
                showToast('لا يوجد اتصال بالخادم!', 'error'); // No server connection!
            }
        });
    }

    if (closeInviteModal) { // Event listener to close invite modal
        closeInviteModal.addEventListener('click', () => {
            inviteModal.style.display = 'none';
        });
    }

    if (copyInviteLinkButton) { // Event listener to copy invite link
        copyInviteLinkButton.addEventListener('click', () => {
            const inviteLink = document.getElementById('inviteLink');
            inviteLink.select(); // Select text in input field
            document.execCommand('copy'); // Use document.execCommand for clipboard operations in iFrames
            showToast('تم نسخ رابط الدعوة بنجاح!', 'success'); // Invite link copied successfully!
        });
    }

    if (shareInviteLinkButton) { // Event listener to share invite link
        shareInviteLinkButton.addEventListener('click', () => {
            const inviteLink = document.getElementById('inviteLink').value;
            if (navigator.share) {
                navigator.share({
                    title: 'انضم إلى لعبة الحروف!', // Join the Letters Game!
                    text: 'انضم إلى جلسة لعبة الحروف الخاصة بي!', // Join my Letters Game session!
                    url: inviteLink
                }).then(() => {
                    showToast('تمت المشاركة بنجاح!', 'success'); // Shared successfully!
                }).catch(err => {
                    console.error('خطأ في مشاركة رابط الدعوة:', err); // Error sharing invite link
                    showToast('فشل في المشاركة، حاول مرة أخرى', 'error'); // Failed to share, try again
                });
            } else {
                showToast('المشاركة غير مدعومة في هذا المتصفح', 'error'); // Sharing not supported in this browser
            }
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
        if (event.target === inviteModal) { // Close invite modal if clicked outside
            inviteModal.style.display = 'none';
        }
    });
}

// Function to initialize the toggle switch and its UI
function initializeToggle() {
    const toggle = document.getElementById('toggleQuestions');
    toggle.checked = true; // Enable toggle by default
    const updateToggleUI = (useGeneral) => {
        document.getElementById('questionLetter').style.display = useGeneral ? 'none' : 'inline-block';
        document.getElementById('newQuestionInput').style.display = useGeneral ? 'none' : 'inline-block';
        document.getElementById('newAnswerInput').style.display = useGeneral ? 'none' : 'inline-block';
        document.getElementById('addQuestionButton').style.display = useGeneral ? 'none' : 'inline-block';
        document.getElementById('currentQuestion').innerText = useGeneral ?
            'الرجاء اختيار حرف ثم الضغط على "السؤال التالي"' : // Please select a letter then click "Next Question"
            'السؤال الحالي: لا يوجد سؤال'; // Current question: No question
    };

    updateToggleUI(toggle.checked);
    toggle.addEventListener('change', (event) => {
        updateToggleUI(event.target.checked);
    });
}

document.getElementById('submitPhoneButton').addEventListener('click', () => {
    const input = document.getElementById('phoneNumber').value.trim().toUpperCase();
    if (!input) {
        document.getElementById('phoneError').innerText = 'الرجاء إدخال رمز الجلسة!'; // Please enter session code!
        document.getElementById('phoneError').className = 'error-message';
        showToast('الرجاء إدخال رمز الجلسة!', 'error'); // Please enter session code!
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        document.getElementById('phoneError').innerText = 'جاري التحقق من الرمز...'; // Verifying code...
        document.getElementById('phoneError').className = '';
        document.getElementById('phoneScreen').classList.remove('active');
        document.getElementById('loadingScreen').classList.add('active');
        ws.send(JSON.stringify({
            type: 'verifyPhone',
            data: { phoneNumber: input, isInviteLink: false }
        }));
    } else {
        document.getElementById('phoneError').innerText = 'لا يوجد اتصال بالخادم، جاري إعادة المحاولة...'; // No server connection, retrying...
        document.getElementById('phoneError').className = 'error-message';
        connectWebSocket();
    }
});

document.getElementById('hostButton').addEventListener('click', () => {
    const name = document.getElementById('playerName').value.trim();
    if (name) {
        playerName = name;
        isHost = true;
        document.getElementById('welcomeScreen').classList.remove('active');
        document.getElementById('hostScreen').classList.add('active');
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'join', data: { role: 'host', name, phoneNumber } }));
        }
        initializeSizeSlider();
        // Re-bind event listener for next question button
        const nextQuestionButton = document.getElementById('nextQuestionButton');
        if (nextQuestionButton) {
            console.log('تم العثور على زر السؤال التالي بعد تفعيل شاشة المضيف'); // Next question button found after host screen activated
            nextQuestionButton.addEventListener('click', () => {
                console.log('تم النقر على زر السؤال التالي، الحرف الحالي للسؤال:', currentQuestionLetter); // Next question button clicked, current question letter
                if (currentQuestionLetter) {
                    console.log('استدعاء showQuestionAndAnswer بالحرف:', currentQuestionLetter); // Calling showQuestionAndAnswer with letter
                    showQuestionAndAnswer(currentQuestionLetter);
                } else {
                    console.log('لم يتم تحديد حرف للسؤال التالي'); // No letter selected for next question
                    showToast('الرجاء اختيار حرف أولاً', 'error'); // Please select a letter first
                }
            });
        } else {
            console.error('لم يتم العثور على زر السؤال التالي بعد تفعيل شاشة المضيف'); // Next question button not found after host screen activated
        }
        // Bind event for add question button
        const addQuestionButton = document.getElementById('addQuestionButton');
        if (addQuestionButton) {
            console.log('تم العثور على زر إضافة السؤال بعد تفعيل شاشة المضيف'); // Add question button found after host screen activated
            addQuestionButton.addEventListener('click', () => {
                const question = document.getElementById('newQuestionInput').value.trim();
                const answer = document.getElementById('newAnswerInput').value.trim();
                const letter = document.getElementById('questionLetter').value;
                console.log('محاولة إضافة السؤال:', { question, answer, letter, wsOpen: ws && ws.readyState === WebSocket.OPEN }); // Attempting to add question
                if (question && answer && letter && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'addQuestion', data: { letter, question, answer, phoneNumber } }));
                    document.getElementById('newQuestionInput').value = '';
                    document.getElementById('newAnswerInput').value = '';
                    document.getElementById('questionLetter').value = '';
                    showToast('تم إضافة السؤال بنجاح!', 'success'); // Question added successfully!
                } else {
                    console.warn('فشل إضافة السؤال:', { // Failed to add question
                        hasQuestion: !!question,
                        hasAnswer: !!answer,
                        hasLetter: !!letter,
                        wsExists: !!ws,
                        wsOpen: ws && ws.readyState === WebSocket.OPEN
                    });
                    showToast('يرجى إدخال السؤال والإجابة والحرف أو التحقق من الاتصال بالخادم!', 'error'); // Please enter question, answer, and letter or check server connection!
                }
            });
        } else {
            console.error('لم يتم العثور على زر إضافة السؤال بعد تفعيل شاشة المضيف'); // Add question button not found after host screen activated
        }
    } else {
        document.getElementById('welcomeError').innerText = 'الرجاء إدخال اسمك!'; // Please enter your name!
        document.getElementById('welcomeError').className = 'error-message';
    }
});

document.getElementById('contestantButton').addEventListener('click', () => {
    const name = document.getElementById('playerName').value.trim();
    if (name) {
        playerName = name;
        isHost = false;
        document.getElementById('welcomeScreen').classList.remove('active');
        document.getElementById('contestantScreen').classList.add('active');
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'join', data: { role: 'contestant', name, phoneNumber } }));
        }
    } else {
        document.getElementById('welcomeError').innerText = 'الرجاء إدخال اسمك!'; // Please enter your name!
        document.getElementById('welcomeError').className = 'error-message';
    }
});

document.getElementById('generateCodesButton').addEventListener('click', () => {
    const count = parseInt(document.getElementById('codeCount').value);
    if (count > 0 && count <= 5000 && ws && ws.readyState === WebSocket.OPEN) {
        showToast('جاري التوليد...', 'success'); // Generating...
        ws.send(JSON.stringify({ type: 'generateCodes', data: { count, phoneNumber } }));
    } else {
        showToast('أدخل عدد صحيح بين 1 و5000!', 'error'); // Enter an integer between 1 and 5000!
    }
});

document.getElementById('generateSpecialCodesButton').addEventListener('click', () => {
    const count = parseInt(document.getElementById('specialCodeCount').value);
    if (count > 0 && count <= 5000 && ws && ws.readyState === WebSocket.OPEN) {
        showToast('جاري توليد الرموز الخاصة...', 'success'); // Generating special codes...
        ws.send(JSON.stringify({ type: 'generateSpecialCodes', data: { count, phoneNumber } }));
    } else {
        showToast('أدخل عدد صحيح بين 1 و5000!', 'error'); // Enter an integer between 1 and 5000!
    }
});

document.getElementById('copyCodesButton').addEventListener('click', async () => {
    const codesText = document.getElementById('generatedCodes').innerText.replace('الرموز الجديدة:\n', '').trim(); // New codes
    if (!codesText) {
        showToast('لا توجد رموز لنسخها!', 'error'); // No codes to copy!
        return;
    }
    try {
        // Use Clipboard API
        await navigator.clipboard.writeText(codesText);
        showToast('تم النسخ بنجاح!', 'success'); // Copied successfully!
    } catch (err) {
        console.error('فشل في نسخ الرموز:', err); // Failed to copy codes
        // Fallback to execCommand
        try {
            const textarea = document.createElement('textarea');
            textarea.value = codesText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('تم النسخ بنجاح!', 'success'); // Copied successfully!
        } catch (execErr) {
            console.error('فشل النسخ الاحتياطي:', execErr); // Backup copy failed
            showToast('فشل في النسخ، حاول مرة أخرى', 'error'); // Failed to copy, try again
        }
    }
});

document.getElementById('copySpecialCodesButton').addEventListener('click', async () => {
    const codesText = document.getElementById('specialGeneratedCodes').value.trim();
    if (!codesText) {
        showToast('لا توجد رموز خاصة لنسخها!', 'error'); // No special codes to copy!
        return;
    }
    try {
        // Use Clipboard API
        await navigator.clipboard.writeText(codesText);
        showToast('تم النسخ بنجاح!', 'success'); // Copied successfully!
    } catch (err) {
        console.error('فشل في نسخ الرموز الخاصة:', err); // Failed to copy special codes
        // Fallback to execCommand
        try {
            const textarea = document.getElementById('specialGeneratedCodes');
            textarea.select();
            document.execCommand('copy');
            showToast('تم النسخ بنجاح!', 'success'); // Copied successfully!
        } catch (execErr) {
            console.error('فشل النسخ الاحتياطي:', execErr); // Backup copy failed
            showToast('فشل في النسخ، حاول مرة أخرى', 'error'); // Failed to copy, try again
        }
    }
});

document.getElementById('addManualCodeButton').addEventListener('click', () => {
    const code = document.getElementById('manualCode').value.trim();
    if (code && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addManualCode', data: { code, phoneNumber } }));
        document.getElementById('manualCode').value = '';
    } else {
        showToast('أدخل رمزًا صحيحًا!', 'error'); // Enter a valid code!
    }
});

document.getElementById('deleteCodeButton').addEventListener('click', () => {
    const code = document.getElementById('deleteCode').value.trim();
    if (code && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deleteCode', data: { code, phoneNumber } }));
        document.getElementById('deleteCode').value = '';
    } else {
        showToast('أدخل رمزًا صحيحًا لحذفه!', 'error'); // Enter a valid code to delete!
    }
});

document.getElementById('deleteCodesListButton').addEventListener('click', () => {
    const codesText = document.getElementById('deleteCodesList').value.trim();
    if (codesText && ws && ws.readyState === WebSocket.OPEN) {
        const codes = codesText.split('\n').map(code => code.trim()).filter(code => code);
        ws.send(JSON.stringify({ type: 'deleteCodesList', data: { codes, phoneNumber } }));
        document.getElementById('deleteCodesList').value = '';
    } else {
        showToast('أدخل قائمة رموز صحيحة!', 'error'); // Enter a valid list of codes!
    }
});

document.getElementById('deleteLatestCodesButton').addEventListener('click', () => {
    const count = parseInt(document.getElementById('deleteLatestCount').value);
    if (count > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deleteLatestCodes', data: { count, phoneNumber } }));
        document.getElementById('deleteLatestCount').value = '';
    } else {
        showToast('أدخل عدد صحيح أكبر من 0!', 'error'); // Enter an integer greater than 0!
    }
});

document.getElementById('addGeneralQuestionButton').addEventListener('click', () => {
    const question = document.getElementById('newGeneralQuestion').value.trim();
    const answer = document.getElementById('newGeneralAnswer').value.trim();
    const letter = document.getElementById('generalQuestionLetter').value;
    if (question && answer && letter && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addGeneralQuestion', data: { letter, question, answer, phoneNumber } }));
        document.getElementById('newGeneralQuestion').value = '';
        document.getElementById('newAnswerInput').value = '';
        document.getElementById('generalQuestionLetter').value = '';
    } else {
        showToast('يرجى إدخال السؤال والإجابة والحرف!', 'error'); // Please enter the question, answer, and letter!
    }
});

document.getElementById('uploadExcelButton').addEventListener('click', () => {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    if (file && ws && ws.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: ['letter', 'question', 'answer'] });
            json.shift();
            ws.send(JSON.stringify({ type: 'addGeneralQuestions', data: { fileContent: JSON.stringify(json), phoneNumber } }));
        };
        reader.readAsArrayBuffer(file);
        fileInput.value = '';
    } else {
        showToast('يرجى اختيار ملف Excel صالح!', 'error'); // Please choose a valid Excel file!
    }
});

document.getElementById('deleteGeneralQuestionsButton').addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#generalQuestionsList input[type="checkbox"]:checked'))
        .map(cb => cb.dataset.id);
    if (selected.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deleteGeneralQuestions', data: { ids: selected, phoneNumber } }));
    } else {
        showToast('يرجى تحديد أسئلة لحذفها!', 'error'); // Please select questions to delete!
    }
});

document.getElementById('addToGeneralButton').addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#sessionQuestionsList input[type="checkbox"]:checked'))
        .map(cb => ({ letter: cb.dataset.letter, question: cb.dataset.question, answer: cb.dataset.answer }));
    if (selected.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addToGeneral', data: { questions: selected, phoneNumber } }));
    } else {
        showToast('يرجى تحديد أسئلة لإضافتها!', 'error'); // Please select questions to add!
    }
});

document.getElementById('generalLetterFilter').addEventListener('change', () => {
    fetchGeneralQuestions();
});

document.getElementById('sessionLetterFilter').addEventListener('change', () => {
    fetchSessionQuestions();
});

document.getElementById('backupButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        showToast('جاري نسخ الرموز...', 'success'); // Backing up codes...
        ws.send(JSON.stringify({ type: 'exportCodes', data: { phoneNumber } }));
    } else {
        showToast('فشل الاتصال بالخادم!', 'error'); // Failed to connect to server!
    }
});

document.getElementById('restoreButton').addEventListener('click', () => {
    document.getElementById('restoreFile').click();
});

document.getElementById('restoreFile').addEventListener('change', () => {
    const fileInput = document.getElementById('restoreFile');
    const file = fileInput.files[0];
    if (file && ws && ws.readyState === WebSocket.OPEN) {
        // Confirmation replaced with showToast to display a message instead of a pop-up
        showToast('جاري رفع الرموز... يرجى التأكد من أنك تريد المتابعة، هذا سيحذف الرموز الحالية وقد يؤثر على الجلسات النشطة.', 'warning'); // Uploading codes... Please confirm you want to proceed, this will delete current codes and may affect active sessions.
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const base64Content = btoa(String.fromCharCode.apply(null, data));
            ws.send(JSON.stringify({ type: 'importCodes', data: { content: base64Content, phoneNumber } }));
        };
        reader.readAsArrayBuffer(file);
    } else {
        showToast('يرجى اختيار ملف Excel صالح!', 'error'); // Please choose a valid Excel file!
    }
});

document.getElementById('addAnnouncementButton').addEventListener('click', () => {
    const title = document.getElementById('announcementTitle').value.trim();
    const text = document.getElementById('announcementText').value.trim();
    const link = document.getElementById('announcementLink').value.trim();
    const button_text = document.getElementById('announcementButtonText').value.trim();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addAnnouncement', data: { title, text, link, button_text, phoneNumber } }));
        document.getElementById('announcementTitle').value = '';
        document.getElementById('announcementText').value = '';
        document.getElementById('announcementLink').value = '';
        document.getElementById('announcementButtonText').value = '';
    } else {
        showToast('لا يوجد اتصال بالخادم!', 'error'); // No server connection!
    }
});

function fetchAnnouncements() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('طلب الإعلانات للمسؤول'); // Requesting announcements for admin
        ws.send(JSON.stringify({ type: 'getAnnouncements', data: { phoneNumber } }));
    } else {
        console.error('WebSocket ليس مفتوحًا'); // WebSocket not open
    }
}

function displayAnnouncements(ads) {
    const containers = [
        document.getElementById('announcementsContainer'),
        document.getElementById('welcomeAnnouncementsContainer')
    ].filter(container => container); // Filter existing containers

    if (containers.length === 0) {
        console.error('لم يتم العثور على أي حاويات إعلانات في DOM'); // No announcement containers found in DOM
        return;
    }

    containers.forEach(container => {
        // Clear existing ads to prevent duplicates on update
        container.innerHTML = '';

        const existingAds = new Set(); // Reset for each container

        ads.forEach(ad => {
            if ((ad.title || ad.text || ad.link) && !existingAds.has(ad.id.toString())) {
                const card = document.createElement('div');
                card.className = 'announcements-card';
                card.dataset.id = ad.id;

                if (ad.title) {
                    const title = document.createElement('p');
                    title.className = 'announcement-title';
                    title.textContent = ad.title;
                    card.appendChild(title);
                }

                if (ad.text) {
                    const text = document.createElement('p');
                    text.className = 'announcement-text';
                    text.textContent = ad.text;
                    card.appendChild(text);
                }

                if (ad.link) {
                    const button = document.createElement('a');
                    button.className = 'announcement-button';
                    button.href = ad.link;
                    button.target = '_blank';
                    button.textContent = ad.button_text;
                    card.appendChild(button);
                }

                const closeBtn = document.createElement('button');
                closeBtn.className = 'announcement-close-btn';
                closeBtn.innerHTML = '×';
                closeBtn.addEventListener('click', () => {
                    card.remove();
                    if (!container.hasChildNodes()) {
                        container.classList.add('hidden');
                    }
                });
                card.appendChild(closeBtn);
                container.appendChild(card);
                existingAds.add(ad.id.toString());
            }
        });

        if (ads.length > 0) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    });
}

function displayAdminAnnouncements(ads) {
    const list = document.getElementById('announcementsList');
    if (!list) {
        console.error('لم يتم العثور على عنصر AnnouncementsList في DOM'); // AnnouncementsList element not found in DOM
        return;
    }
    list.innerHTML = '';
    console.log('الإعلانات المستلمة:', ads); // Received announcements
    if (ads.length === 0) {
        list.innerHTML = '<p>لا توجد إعلانات في قاعدة البيانات</p>'; // No announcements in database
        return;
    }
    ads.forEach(ad => {
        const div = document.createElement('div');
        div.className = 'announcements-item';
        const title = ad.title ? ad.title.substring(0, 30) + (ad.title.length > 30 ? '...' : '') : 'بدون عنوان'; // No title
        const status = ad.is_active ? 'نشط' : 'غير نشط'; // Active / Inactive
        div.innerHTML = `<span>${title} (${status})</span>`;
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-announcement-btn';
        deleteBtn.textContent = 'حذف'; // Delete
        deleteBtn.dataset.id = ad.id;
        deleteBtn.addEventListener('click', () => {
            // Confirmation replaced with showToast to display a message instead of a pop-up
            showToast('هل أنت متأكد من حذف هذا الإعلان؟', 'warning'); // Are you sure you want to delete this announcement?
            ws.send(JSON.stringify({ type: 'deleteAnnouncement', data: { id: ad.id, phoneNumber } }));
        });
        div.appendChild(deleteBtn);
        list.appendChild(div);
    });
}

function createHexGrid(gridId, clickable) {
    const grid = document.getElementById(gridId);
    if (!grid) {
        console.error('Grid element not found:', gridId);
        return;
    }

    // Create or find hexGridWrapper
    let wrapper = grid.parentElement;
    if (!wrapper || !wrapper.classList.contains('hexGridWrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'hexGridWrapper';
        grid.parentNode.insertBefore(wrapper, grid);
        wrapper.appendChild(grid);
    }

    // Clear existing content
    grid.innerHTML = '';

    const layout = [
        ['', '', '', '', '', '', ''],
        ['', 'أ', 'ب', 'ت', 'ث', 'ج', ''],
        ['', 'ح', 'خ', 'د', 'ذ', 'ر', ''],
        ['', 'ز', 'س', 'ش', 'ص', 'ض', ''],
        ['', 'ط', 'ظ', 'ع', 'غ', 'ف', ''],
        ['', 'ق', 'ك', 'ل', 'م', 'ن', ''],
        ['', '', '', '', '', 'ه', '']
    ];
    console.log('Grid initialized with layout:', layout);

    layout.forEach((row, rowIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        row.forEach((letter, colIndex) => {
            const hex = document.createElement('div');
            hex.className = `hexagon ${gridId === 'hexGridContestant' ? 'contestant-hex' : ''}`;
            if (rowIndex === 0) {
                if (colIndex === 0 || colIndex === 6) {
                    hex.classList.add('green-fixed');
                    if (colIndex === 0) hex.classList.add('outer-fixed-top-left');
                    else hex.classList.add('outer-fixed-top');
                } else {
                    hex.classList.add('red-fixed');
                    hex.classList.add('outer-fixed-top');
                }
            } else if (rowIndex === 6) {
                if (colIndex === 0 || colIndex === 6) {
                    hex.classList.add('green-fixed');
                    if (colIndex === 0) hex.classList.add('outer-fixed-bottom-left');
                    else hex.classList.add('outer-fixed-bottom');
                } else {
                    hex.classList.add('red-fixed');
                    hex.classList.add('outer-fixed-bottom');
                }
            } else if (colIndex === 0 || colIndex === 6) {
                hex.classList.add('green-fixed');
                if (colIndex === 6 && (rowIndex === 1 || rowIndex === 3 || rowIndex === 5)) hex.classList.add('outer-fixed-odd-right');
                else if (colIndex === 0 && (rowIndex === 2 || rowIndex === 4)) hex.classList.add('outer-fixed-even-left');
            } else if (letter) {
                hex.classList.add('changeable');
                hex.textContent = letter;
                hex.dataset.letter = letter;
                hex.dataset.clickCount = '0';
                if (clickable) hex.addEventListener('click', () => handleHexClick(hex));
            }
            rowDiv.appendChild(hex);
        });
        grid.appendChild(rowDiv);
    });

    console.log('Grid rows created:', document.querySelectorAll(`#${gridId} .row`).length);
    console.log('Changeable hexagons created:', document.querySelectorAll(`#${gridId} .changeable`).length);

    // Create and append party-text and golden-text to wrapper
    const partyText = document.createElement('div');
    partyText.className = 'party-text';
    partyText.id = 'partyText' + (gridId === 'hexGridHost' ? '' : 'Contestant');
    partyText.textContent = 'مبروك';

    const goldenText = document.createElement('div');
    goldenText.className = 'golden-text';
    goldenText.id = 'goldenText' + (gridId === 'hexGridHost' ? '' : 'Contestant');
    goldenText.textContent = '✨حرف ذهبي✨';

    wrapper.appendChild(partyText);
    wrapper.appendChild(goldenText);

    // Initialize grid for host
    if (gridId === 'hexGridHost' && isHost && ws && ws.readyState === WebSocket.OPEN) {
        const hexagons = {};
        const availableLetters = [...letters];
        const shuffled = [];
        for (let i = 0; i < letters.length; i++) {
            const randomIndex = Math.floor(Math.random() * availableLetters.length);
            shuffled.push(availableLetters[randomIndex]);
            hexagons[shuffled[i]] = { color: '#ffffe0', clickCount: '0' };
            availableLetters.splice(randomIndex, 1);
        }
        goldenLetter = shuffled[Math.floor(Math.random() * shuffled.length)];
        console.log('Selected goldenLetter:', goldenLetter);
        updateGrid(hexagons, shuffled, gridId);
        ws.send(JSON.stringify({ type: 'shuffle', data: { lettersOrder: shuffled, hexagons, phoneNumber, goldenLetter } }));
    }
}

function handleHexClick(hex) {
    const letter = hex.dataset.letter;
    let clickCount = parseInt(hex.dataset.clickCount) || 0;
    clickCount = (clickCount + 1) % 5;
    hex.dataset.clickCount = clickCount.toString();

    const colorCycle = getColorCycle();
    const newColor = colorCycle[clickCount];
    hex.style.backgroundColor = newColor;

    console.log('handleHexClick: الحرف=', letter, 'عدد النقرات=', clickCount); // handleHexClick: Letter, click count

    // تفعيل الاحتفالية عند النقر على الحرف الذهبي
    console.log('Checking golden letter:', letter, 'is golden:', letter === goldenLetter);
    if (letter === goldenLetter && clickCount === 1 && isHost) {
        startGoldenLetterCelebration();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'goldenLetterActivated', data: { letter, active: true, phoneNumber } }));
        }
    }

    if (clickCount === 1) {
        currentQuestionLetter = letter;
        document.getElementById('questionLetter').value = letter;
        showQuestionAndAnswer(letter);
    } else if (clickCount === 0) {
        currentQuestionLetter = '';
        document.getElementById('currentQuestion').innerText = '';
        document.getElementById('questionLetter').value = '';
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'updateHexagon', data: { letter, color: newColor, clickCount, phoneNumber } }));
    }
}

function showQuestionAndAnswer(letter) {
    const toggle = document.getElementById('toggleQuestions').checked;
    const questions = toggle ? defaultQuestions.general : defaultQuestions.session;

    // تأكد من وجود الأسئلة لهذا الحرف
    if (!questions[letter] || questions[letter].length === 0) {
        showToast('لا توجد أسئلة متاحة لهذا الحرف', 'warning');
        return;
    }

    // إنشاء قائمة الفهارس العشوائية إذا لم تكن موجودة
    if (!usedQuestions[letter] || usedQuestions[letter].length === 0) {
        const total = questions[letter].length;
        usedQuestions[letter] = shuffleArray([...Array(total).keys()]);
        console.log('تم إنشاء قائمة عشوائية للأسئلة:', usedQuestions[letter]);
    }

    // إذا انتهت القائمة، نعيد خلطها
    if (usedQuestions[letter].length === 0) {
        const total = questions[letter].length;
        usedQuestions[letter] = shuffleArray([...Array(total).keys()]);
        console.log('انتهت الأسئلة، جاري إعادة التكرار:', usedQuestions[letter]);
    }

    // استخراج الفهرس التالي
    const index = usedQuestions[letter].shift();
    const [question, answer] = questions[letter][index];

    // عرض السؤال
    document.getElementById('currentQuestion').innerText = `${question} - ${answer}`;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function rgbToHex(rgb) {
    if (!rgb || rgb === '') return '#ffffe0';
    if (rgb.startsWith('#')) return rgb.toLowerCase();
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return '#ffffe0';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toLowerCase();
}

document.getElementById('shuffleButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const hexagons = {};
        const availableLetters = [...letters];
        const shuffled = [];
        for (let i = 0; i < letters.length; i++) {
            const randomIndex = Math.floor(Math.random() * availableLetters.length);
            shuffled.push(availableLetters[randomIndex]);
            hexagons[shuffled[i]] = { color: '#ffffe0', clickCount: '0' };
            availableLetters.splice(randomIndex, 1);
        }
        goldenLetter = shuffled[Math.floor(Math.random() * shuffled.length)]; // اختيار حرف ذهبي جديد عند الخلط
        console.log('Selected goldenLetter:', goldenLetter);
        ws.send(JSON.stringify({ type: 'shuffle', data: { lettersOrder: shuffled, hexagons, phoneNumber, goldenLetter } }));
    }
});

document.getElementById('swapColorsButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        isSwapped = !isSwapped;
        const hexagons = {};
        document.querySelectorAll('#hexGridHost .changeable').forEach(hex => {
            hexagons[hex.dataset.letter] = { color: rgbToHex(hex.style.backgroundColor), clickCount: hex.dataset.clickCount };
        });
        ws.send(JSON.stringify({
            type: 'swapColors',
            data: {
                isSwapped: isSwapped,
                hexagons,
                lettersOrder: Array.from(document.querySelectorAll('#hexGridHost .changeable')).map(h => h.dataset.letter),
                phoneNumber
            }
        }));
    }
});

document.getElementById('changeColorsButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const newIndex = (currentColorSetIndex + 1) % colorSets.length;
        const hexagons = {};
        document.querySelectorAll('#hexGridHost .changeable').forEach(hex => {
            hexagons[hex.dataset.letter] = { color: rgbToHex(hex.style.backgroundColor), clickCount: hex.dataset.clickCount };
        });
        ws.send(JSON.stringify({
            type: 'changeColors',
            data: {
                colorSetIndex: newIndex,
                hexagons,
                lettersOrder: Array.from(document.querySelectorAll('#hexGridHost .changeable')).map(h => h.dataset.letter),
                phoneNumber
            }
        }));
    }
});

document.getElementById('partyButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'party', data: { active: true, phoneNumber } }));
    }
});

function startPartyMode() {
    const partyText = document.getElementById(isHost ? 'partyText' : 'partyTextContestant');
    const grid = document.getElementById(isHost ? 'hexGridHost' : 'hexGridContestant');
    partyText.style.display = 'block';
    partyText.style.animation = 'shake 0.5s infinite';
    const winningSound = document.getElementById('winningSound');
    if (winningSound) {
        winningSound.play().catch(err => console.error('خطأ في تشغيل صوت الفوز:', err));
    }
    if (!partyInterval) {
        partyInterval = setInterval(() => {
            const currentSet = colorSets[currentColorSetIndex];
            const colors = ['#ffd700', currentSet.red, currentSet.green, '#ff4500', '#00ff00', '#ff69b4'];
            partyText.style.color = colors[Math.floor(Math.random() * colors.length)];
            for (let i = 0; i < 10; i++) {
                const flash = document.createElement('div');
                flash.className = 'flash';
                flash.style.left = Math.random() * 100 + '%';
                flash.style.top = Math.random() * 100 + '%';
                flash.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                flash.style.animationDuration = `${0.5 + Math.random() * 0.5}s`;
                grid.appendChild(flash);
                setTimeout(() => flash.remove(), 1000);
            }
        }, 200);
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'party', data: { active: false, phoneNumber } }));
            }
            if (winningSound) {
                winningSound.pause();
                winningSound.currentTime = 0;
            }
        }, 8500);
    }
}

function stopPartyMode() {
    if (partyInterval) {
        clearInterval(partyInterval);
        partyInterval = null;
        document.getElementById('partyText').style.display = 'none';
        document.getElementById('partyTextContestant').style.display = 'none';
        document.querySelectorAll('.flash').forEach(flash => flash.remove());
    }
}

function startGoldenLetterCelebration() {
    console.log('Golden celebration started');
    const goldenText = document.getElementById(isHost ? 'goldenText' : 'goldenTextContestant');
    const grid = document.getElementById(isHost ? 'hexGridHost' : 'hexGridContestant');
    if (!goldenText || !grid) {
        console.error('Golden text or grid not found:', { goldenText, grid });
        return;
    }
    goldenText.style.display = 'block';
    const goldSound = document.getElementById('goldSound');
    if (goldSound) {
        goldSound.play().catch(err => console.error('خطأ في تشغيل صوت الحرف الذهبي:', err));
    }
    let goldenInterval = setInterval(() => {
        const colors = ['#ffd700', '#ff4500'];
        for (let i = 0; i < 5; i++) {
            const flash = document.createElement('div');
            flash.className = 'flash';
            flash.style.left = Math.random() * 100 + '%';
            flash.style.top = Math.random() * 100 + '%';
            flash.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            flash.style.animationDuration = `${0.5 + Math.random() * 0.5}s`;
            grid.appendChild(flash);
            setTimeout(() => flash.remove(), 1000);
        }
    }, 300);
    setTimeout(() => {
        clearInterval(goldenInterval);
        goldenText.style.display = 'none';
        document.querySelectorAll('.flash').forEach(flash => flash.remove());
        if (goldSound) {
            goldSound.pause();
            goldSound.currentTime = 0;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'goldenLetterActivated', data: { active: false, phoneNumber } }));
        }
    }, 3000);
}

document.getElementById('buzzerButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'buzzer', data: { player: playerName, phoneNumber } }));
        const audio = document.getElementById('buzzerSound');
        audio.play().catch(err => console.error('خطأ في تشغيل صوت الجرس للمتسابق:', err)); // Error playing buzzer sound for contestant
    }
});

document.getElementById('resetBuzzerButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resetBuzzer', data: { phoneNumber } }));
    }
});

// Original nextQuestionButton event listener removed from here as per step 2.
// The listener is now re-bound inside the hostButton click event and also
// a document-level listener is added for reliability.

// addQuestionButton event listener removed from here as per instructions.

function updateGrid(hexagons, lettersOrder, gridId) {
    console.log('تم استدعاء updateGrid بالمعرف:', gridId, 'ترتيب الحروف:', lettersOrder); // updateGrid called with ID, letters order
    const gridHexagons = document.querySelectorAll(`#${gridId} .changeable`);
    gridHexagons.forEach((hex, index) => {
        const letter = lettersOrder[index];
        hex.textContent = letter;
        hex.dataset.letter = letter;
        hex.style.backgroundColor = hexagons[letter].color;
        hex.dataset.clickCount = hexagons[letter].clickCount;
    });

    // Dynamically update CSS variables for team colors
    const currentSet = colorSets[currentColorSetIndex];
    document.documentElement.style.setProperty('--red-color', isSwapped ? currentSet.green : currentSet.red);
    document.documentElement.style.setProperty('--green-color', isSwapped ? currentSet.red : currentSet.green);

    const redHexagons = document.querySelectorAll(`#${gridId} .red-fixed`);
    const greenHexagons = document.querySelectorAll(`#${gridId} .green-fixed`);
    
    redHexagons.forEach(hex => {
        hex.style.backgroundColor = isSwapped ? currentSet.green : currentSet.red;
    });
    greenHexagons.forEach(hex => {
        hex.style.backgroundColor = isSwapped ? currentSet.red : currentSet.green;
    });
}

function updateBuzzer(buzzer) {
    const buzzerButton = document.getElementById('buzzerButton');
    const info = document.getElementById(isHost ? 'buzzerInfo' : 'contestantBuzzerInfo');
    if (buzzer.active && buzzer.player && buzzer.team) {
        const teamName = buzzer.team === 'red' ? 'الأحمر' : 'الأخضر'; // Red / Green
        info.innerText = `${buzzer.player} من الفريق ${teamName}`; // Player from team
        if (!isHost) buzzerButton.disabled = true;
    } else {
        info.innerText = '';
        if (!isHost) buzzerButton.disabled = false;
    }
}

function updateTeams(teams) {
    console.log('تحديث الفرق باستخدام:', teams); // Updating teams using
    ['red', 'green'].forEach(team => {
        const teamList = document.getElementById(`${team}TeamList`);
        teamList.innerHTML = `<h3>الفريق ${team === 'red' ? 'الأحمر' : 'الأخضر'}</h3>`; // Red Team / Green Team
        if (teams[team] && Array.isArray(teams[team])) {
            teams[team].forEach(name => {
                if (!teamList.querySelector(`.player-bubble[data-name="${name}"]`)) {
                    const bubble = document.createElement('div');
                    bubble.className = `player-bubble ${team}`;
                    bubble.textContent = name;
                    bubble.dataset.name = name;
                    if (isHost) {
                        bubble.draggable = true;
                        bubble.addEventListener('dragstart', drag);
                    }
                    teamList.appendChild(bubble);
                }
            });
        }
        if (!isHost && playerName && teams[team].includes(playerName)) {
            document.getElementById('teamInfo').innerText = `أنت في الفريق ${team === 'red' ? 'الأحمر' : 'الأخضر'}`; // You are on the Red Team / Green Team
        }
    });
}

function updateTeamsFromDOM() {
    const teams = { red: [], green: [] };
    ['red', 'green'].forEach(team => {
        document.querySelectorAll(`#${team}TeamList .player-bubble`).forEach(bubble => {
            teams[team].push(bubble.dataset.name);
        });
    });
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'updateTeams', data: { teams, phoneNumber } }));
    }
}

function drag(ev) {
    ev.dataTransfer.setData('text', ev.target.dataset.name);
}

function allowDrop(ev) {
    ev.preventDefault();
}

function drop(ev) {
    ev.preventDefault();
    const name = ev.dataTransfer.getData('text');
    const oldTeam = document.querySelector(`.player-bubble[data-name="${name}"]`).parentElement.id === 'redTeamList' ? 'red' : 'green';
    const newTeam = ev.target.closest('#redTeamList') ? 'red' : 'green';
    if (oldTeam !== newTeam) {
        const bubble = document.querySelector(`.player-bubble[data-name="${name}"]`);
        bubble.classList.remove(oldTeam);
        bubble.classList.add(newTeam);
        ev.target.closest('.team-list').appendChild(bubble);
        updateTeamsFromDOM();
    }
}

function updateCodesCount() {
    if (isAdmin && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getCodesCount', data: { phoneNumber } }));
    }
}

function fetchGeneralQuestions() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const letter = document.getElementById('generalLetterFilter').value;
        ws.send(JSON.stringify({ type: 'getGeneralQuestions', data: { letter, phoneNumber } }));
    }
}

function fetchSessionQuestions() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const letter = document.getElementById('sessionLetterFilter').value;
        ws.send(JSON.stringify({ type: 'getSessionQuestions', data: { letter, phoneNumber } }));
    }
}

function displayGeneralQuestions(questions) {
    const list = document.getElementById('generalQuestionsList');
    list.innerHTML = '';
    questions.forEach(q => {
        const div = document.createElement('div');
        div.className = 'question-item';
        div.innerHTML = `<input type="checkbox" data-id="${q.id}"> ${q.letter} - ${q.question} - ${q.answer}`;
        list.appendChild(div);
    });
    document.getElementById('questionsCount').innerText = `عدد الأسئلة العامة: ${questions.length}`; // Number of general questions
}

function displaySessionQuestions(questions) {
    const list = document.getElementById('sessionQuestionsList');
    list.innerHTML = '';
    questions.forEach(q => {
        const div = document.createElement('div');
        div.className = 'question-item';
        div.innerHTML = `<input type="checkbox" data-letter="${q.letter}" data-question="${q.question}" data-answer="${q.answer}"> ${q.letter} - ${q.question} - ${q.answer}`;
        list.appendChild(div);
    });
}

document.getElementById('connectionLostButton').addEventListener('click', () => {
    if (token && phoneNumber) {
        connectWebSocket();
        showToast('جاري إعادة الاتصال...', 'success'); // Reconnecting...
    } else {
        resetToPhoneScreen();
        showToast('يرجى إدخال رمز الجلسة', 'error'); // Please enter session code
    }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('تم تسجيل Service Worker بالنطاق:', registration.scope); // Service Worker registered with scope
    }).catch(err => {
      console.error('فشل تسجيل Service Worker:', err); // Service Worker registration failed
    });
  });
}

// Event listeners for internet connection status
window.addEventListener('offline', () => {
  document.getElementById('offlineMessage').style.display = 'block';
});

window.addEventListener('online', () => {
  document.getElementById('offlineMessage').style.display = 'none';
  connectWebSocket();
});
