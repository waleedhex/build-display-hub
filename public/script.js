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
let isHost = false;
let partyInterval = null;
let currentQuestionLetter = '';
const usedQuestions = {};
let phoneNumber = null;
let isAdmin = false;
let playerName = '';
let token = localStorage.getItem('sessionToken') || null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectInterval = 3000;

function connectWebSocket() {
    try {
        ws = new WebSocket(window.location.protocol === 'https:' ? 'wss://' + window.location.host : 'ws://' + window.location.host);
        ws.onopen = () => {
            console.log('Connected to WebSocket');
            reconnectAttempts = 0;
            hideConnectionLost();
            if (token) {
                console.log('Attempting to reconnect with token:', token);
                ws.send(JSON.stringify({ type: 'reconnect', data: { token } }));
            } else if (phoneNumber && playerName) {
                console.log('Joining with phoneNumber and playerName:', phoneNumber, playerName);
                ws.send(JSON.stringify({ type: 'join', data: { role: isHost ? 'host' : 'contestant', name: playerName, phoneNumber } }));
            }
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            showConnectionLost();
        };
        ws.onclose = () => {
            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Reconnection attempt ${reconnectAttempts}`);
                    showConnectionLost();
                    connectWebSocket();
                }, reconnectInterval);
            } else {
                console.log('Max reconnection attempts reached, showing return button');
                showConnectionLost(true);
            }
        };
        ws.onmessage = handleMessages;
        ws.onpong = () => {
            console.log('Received pong from server');
        };
    } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        showConnectionLost();
    }
}

function showConnectionLost(showButton = false) {
    let connectionLostDiv = document.getElementById('connectionLost');
    if (!connectionLostDiv) {
        connectionLostDiv = document.createElement('div');
        connectionLostDiv.id = 'connectionLost';
        connectionLostDiv.className = 'connection-lost';
        connectionLostDiv.innerHTML = `
            <div class="spinner"></div>
            <p>جاري إعادة الاتصال...</p>
            <button id="returnToSession" onclick="resetToPhoneScreen()">العودة للجلسة</button>
        `;
        document.body.appendChild(connectionLostDiv);
    }
    const button = connectionLostDiv.querySelector('#returnToSession');
    button.style.display = showButton ? 'block' : 'none';
    connectionLostDiv.style.display = 'flex';
}

function hideConnectionLost() {
    const connectionLostDiv = document.getElementById('connectionLost');
    if (connectionLostDiv) {
        connectionLostDiv.style.display = 'none';
    }
}

function resetToPhoneScreen() {
    document.getElementById('hostScreen').classList.remove('active');
    document.getElementById('contestantScreen').classList.remove('active');
    document.getElementById('welcomeScreen').classList.remove('active');
    document.getElementById('phoneScreen').classList.add('active');
    localStorage.removeItem('sessionToken');
    token = null;
    phoneNumber = null;
    playerName = '';
    isHost = false;
    isAdmin = false;
    reconnectAttempts = 0;
    hideConnectionLost();
}

function showToast(message, type = 'success') {
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
    }, 3000);
}

function handleMessages(event) {
    const { type, data } = JSON.parse(event.data);
    if (type === 'codeVerified') {
        phoneNumber = document.getElementById('phoneNumber').value.trim().toUpperCase();
        isAdmin = (phoneNumber === 'IMWRA143');
        document.getElementById('phoneScreen').classList.remove('active');
        document.getElementById('welcomeScreen').classList.add('active');
        document.getElementById('phoneError').innerText = '';
        document.getElementById('phoneNumber').value = '';
        if (isAdmin) {
            document.getElementById('adminPanel').style.display = 'block';
            fetchGeneralQuestions();
            fetchSessionQuestions();
            updateCodesCount();
            fetchAdvertisements();
        }
    } else if (type === 'codeError') {
        document.getElementById('phoneError').innerText = data;
        document.getElementById('phoneError').className = 'error-message';
    } else if (type === 'init') {
        token = data.token || token;
        if (token) {
            localStorage.setItem('sessionToken', token);
            console.log('Token saved to localStorage:', token);
        }
        defaultQuestions = data.questions || {};
        currentColorSetIndex = data.colorSetIndex;
        isSwapped = data.isSwapped;
        updateGrid(data.hexagons, data.lettersOrder, isHost ? 'hexGridHost' : 'hexGridContestant');
        updateTeams(data.teams);
        updateBuzzer(data.buzzer);
    } else if (type === 'codesGenerated') {
        const generatedCodesDiv = document.getElementById('generatedCodes');
        generatedCodesDiv.innerHTML = 'الرموز الجديدة:<br>' + data.join('<br>');
        showToast('تم توليد الرموز بنجاح', 'success');
        document.getElementById('copyCodesButton').style.display = 'inline';
        updateCodesCount();
    } else if (type === 'specialCodesGenerated') {
        const specialCodesTextarea = document.getElementById('specialGeneratedCodes');
        specialCodesTextarea.value = data.join('\n');
        showToast('تم توليد الرموز الخاصة بنجاح', 'success');
        document.getElementById('copySpecialCodesButton').style.display = 'inline';
        updateCodesCount();
    } else if (type === 'manualCodeAdded') {
        document.getElementById('generatedCodes').innerHTML = `تم إضافة الرمز: ${data}`;
        showToast('تمت الإضافة بنجاح', 'success');
        document.getElementById('copyCodesButton').style.display = 'none';
        updateCodesCount();
    } else if (type === 'codeDeleted') {
        document.getElementById('generatedCodes').innerHTML = `تم حذف الرمز: ${data}`;
        showToast('تم الحذف بنجاح', 'success');
        document.getElementById('copyCodesButton').style.display = 'none';
        updateCodesCount();
    } else if (type === 'codesDeleted') {
        showToast(`تم حذف ${data.length} رمز`, 'success');
        document.getElementById('generatedCodes').innerHTML = '';
        updateCodesCount();
    } else if (type === 'adminError') {
        showToast(data, 'error');
        document.getElementById('adminStatus').innerText = '';
    } else if (type === 'generalQuestions') {
        displayGeneralQuestions(data);
        document.getElementById('questionsCount').innerText = `عدد الأسئلة العامة: ${data.length}`;
    } else if (type === 'sessionQuestions') {
        displaySessionQuestions(data);
    } else if (type === 'generalQuestionAdded' || type === 'generalQuestionsAdded') {
        showToast(data, 'success');
        fetchGeneralQuestions();
    } else if (type === 'generalQuestionsDeleted') {
        showToast('تم حذف الأسئلة المحددة', 'success');
        fetchGeneralQuestions();
    } else if (type === 'addedToGeneral') {
        showToast('تم إضافة الأسئلة المحددة إلى العام', 'success');
        fetchGeneralQuestions();
        fetchSessionQuestions();
    } else if (type === 'codesCount') {
        document.getElementById('codesCount').innerText = `إجمالي عدد الرموز: ${data}`;
    } else if (type === 'codesExported') {
        showToast('تم نسخ الرموز بنجاح، الملف محفوظ', 'success');
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
    } else if (type === 'activeAdvertisements') {
        displayAdvertisements(data);
    } else if (type === 'advertisements') {
        displayAdminAdvertisements(data);
    } else if (type === 'advertisementAdded') {
        showToast(data, 'success');
        fetchAdvertisements();
    } else if (type === 'advertisementDeleted') {
        showToast(data, 'success');
        fetchAdvertisements();
    } else if (type === 'updateHexagon') {
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
    } else if (type === 'buzzer') {
        updateBuzzer(data);
        if (data.active && isHost) {
            const audio = document.getElementById('buzzerSound');
            audio.play().catch(err => console.error('Error playing buzzer sound:', err));
        }
    } else if (type === 'timeUpWarning') {
        const info = document.getElementById(isHost ? 'buzzerInfo' : 'contestantBuzzerInfo');
        info.innerText = data.message;
        const audio = document.getElementById('timeUpSound');
        audio.play().catch(err => console.error('Error playing time up sound:', err));
    } else if (type === 'timeUp') {
        updateBuzzer({ active: false, player: '', team: null });
    } else if (type === 'resetBuzzer') {
        updateBuzzer({ active: false, player: '', team: null });
    } else if (type === 'updateTeams') {
        updateTeams(data);
    } else if (type === 'updateQuestions') {
        defaultQuestions.session = data;
    } else if (type === 'joinError') {
        document.getElementById('welcomeScreen').classList.add('active');
        document.getElementById('hostScreen').classList.remove('active');
        document.getElementById('contestantScreen').classList.remove('active');
        document.getElementById('welcomeError').innerText = data;
        document.getElementById('welcomeError').className = 'error-message';
    } else if (type === 'error') {
        if (data.includes('رمز مؤقت غير صالح') || data.includes('الجلسة غير موجودة')) {
            resetToPhoneScreen();
        }
    }
}

window.onload = () => {
    createHexGrid('hexGridHost', true);
    createHexGrid('hexGridContestant', false);
    updateCodesCount();
    const audio = document.getElementById('buzzerSound');
    audio.load();
    const timeUpAudio = document.getElementById('timeUpSound');
    timeUpAudio.load();
    connectWebSocket();
};

function initializeSizeSlider() {
    const sizeSlider = document.getElementById('sizeSlider');
    if (sizeSlider) {
        sizeSlider.max = 100;
        sizeSlider.min = 40;
        sizeSlider.value = 100;
        document.documentElement.style.setProperty('--grid-width', 1);
        const updateGridWidth = () => {
            const widthScale = sizeSlider.value / 100;
            console.log('Slider value:', sizeSlider.value, 'Width scale:', widthScale);
            requestAnimationFrame(() => {
                document.documentElement.style.setProperty('--grid-width', widthScale);
            });
        };
        sizeSlider.addEventListener('input', updateGridWidth);
        sizeSlider.addEventListener('change', updateGridWidth);
    } else {
        console.error('sizeSlider element not found in DOM');
    }
}

document.getElementById('submitPhoneButton').addEventListener('click', () => {
    const input = document.getElementById('phoneNumber').value.trim().toUpperCase();
    if (!input) {
        document.getElementById('phoneError').innerText = 'الرجاء إدخال رمز الجلسة!';
        document.getElementById('phoneError').className = 'error-message';
        return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        document.getElementById('phoneError').innerText = 'جاري التحقق من الرمز...';
        document.getElementById('phoneError').className = '';
        ws.send(JSON.stringify({ type: 'verifyPhone', data: { phoneNumber: input } }));
    } else {
        document.getElementById('phoneError').innerText = 'لا يوجد اتصال بالخادم، جاري إعادة المحاولة...';
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
    } else {
        document.getElementById('welcomeError').innerText = 'الرجاء إدخال اسمك!';
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
        document.getElementById('welcomeError').innerText = 'الرجاء إدخال اسمك!';
        document.getElementById('welcomeError').className = 'error-message';
    }
});

document.getElementById('generateCodesButton').addEventListener('click', () => {
    const count = parseInt(document.getElementById('codeCount').value);
    if (count > 0 && count <= 5000 && ws && ws.readyState === WebSocket.OPEN) {
        showToast('جاري التوليد...', 'success');
        ws.send(JSON.stringify({ type: 'generateCodes', data: { count, phoneNumber } }));
    } else {
        showToast('أدخل عدد صحيح بين 1 و5000!', 'error');
    }
});

document.getElementById('generateSpecialCodesButton').addEventListener('click', () => {
    const count = parseInt(document.getElementById('specialCodeCount').value);
    if (count > 0 && count <= 5000 && ws && ws.readyState === WebSocket.OPEN) {
        showToast('جاري توليد الرموز الخاصة...', 'success');
        ws.send(JSON.stringify({ type: 'generateSpecialCodes', data: { count, phoneNumber } }));
    } else {
        showToast('أدخل عدد صحيح بين 1 و5000!', 'error');
    }
});

document.getElementById('copyCodesButton').addEventListener('click', () => {
    const codesText = document.getElementById('generatedCodes').innerText.replace('الرموز الجديدة:\n', '');
    navigator.clipboard.writeText(codesText).then(() => {
        showToast('تم النسخ بنجاح!', 'success');
    }).catch(err => {
        console.error('فشل النسخ:', err);
        showToast('فشل نسخ الرموز!', 'error');
    });
});

document.getElementById('copySpecialCodesButton').addEventListener('click', () => {
    const codesText = document.getElementById('specialGeneratedCodes').value;
    navigator.clipboard.writeText(codesText).then(() => {
        showToast('تم نسخ الرموز الخاصة بنجاح!', 'success');
    }).catch(err => {
        console.error('فشل النسخ:', err);
        showToast('فشل نسخ الرموز الخاصة!', 'error');
    });
});

document.getElementById('addManualCodeButton').addEventListener('click', () => {
    const code = document.getElementById('manualCode').value.trim();
    if (code && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addManualCode', data: { code, phoneNumber } }));
        document.getElementById('manualCode').value = '';
    } else {
        showToast('أدخل رمزًا صحيحًا!', 'error');
    }
});

document.getElementById('deleteCodeButton').addEventListener('click', () => {
    const code = document.getElementById('deleteCode').value.trim();
    if (code && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deleteCode', data: { code, phoneNumber } }));
        document.getElementById('deleteCode').value = '';
    } else {
        showToast('أدخل رمزًا صحيحًا لحذفه!', 'error');
    }
});

document.getElementById('deleteCodesListButton').addEventListener('click', () => {
    const codesText = document.getElementById('deleteCodesList').value.trim();
    if (codesText && ws && ws.readyState === WebSocket.OPEN) {
        const codes = codesText.split('\n').map(code => code.trim()).filter(code => code);
        ws.send(JSON.stringify({ type: 'deleteCodesList', data: { codes, phoneNumber } }));
        document.getElementById('deleteCodesList').value = '';
    } else {
        showToast('أدخل قائمة رموز صحيحة!', 'error');
    }
});

document.getElementById('deleteLatestCodesButton').addEventListener('click', () => {
    const count = parseInt(document.getElementById('deleteLatestCount').value);
    if (count > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deleteLatestCodes', data: { count, phoneNumber } }));
        document.getElementById('deleteLatestCount').value = '';
    } else {
        showToast('أدخل عدد صحيح أكبر من 0!', 'error');
    }
});

document.getElementById('addGeneralQuestionButton').addEventListener('click', () => {
    const question = document.getElementById('newGeneralQuestion').value.trim();
    const answer = document.getElementById('newGeneralAnswer').value.trim();
    const letter = document.getElementById('generalQuestionLetter').value;
    if (question && answer && letter && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addGeneralQuestion', data: { letter, question, answer, phoneNumber } }));
        document.getElementById('newGeneralQuestion').value = '';
        document.getElementById('newGeneralAnswer').value = '';
        document.getElementById('generalQuestionLetter').value = '';
    } else {
        showToast('يرجى إدخال السؤال والإجابة والحرف!', 'error');
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
        showToast('يرجى اختيار ملف Excel!', 'error');
    }
});

document.getElementById('deleteGeneralQuestionsButton').addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#generalQuestionsList input[type="checkbox"]:checked'))
        .map(cb => cb.dataset.id);
    if (selected.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'deleteGeneralQuestions', data: { ids: selected, phoneNumber } }));
    } else {
        showToast('يرجى تحديد أسئلة لحذفها!', 'error');
    }
});

document.getElementById('addToGeneralButton').addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('#sessionQuestionsList input[type="checkbox"]:checked'))
        .map(cb => ({ letter: cb.dataset.letter, question: cb.dataset.question, answer: cb.dataset.answer }));
    if (selected.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addToGeneral', data: { questions: selected, phoneNumber } }));
    } else {
        showToast('يرجى تحديد أسئلة لإضافتها!', 'error');
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
        showToast('جاري نسخ الرموز...', 'success');
        ws.send(JSON.stringify({ type: 'exportCodes', data: { phoneNumber } }));
    } else {
        showToast('فشل الاتصال بالخادم!', 'error');
    }
});

document.getElementById('restoreButton').addEventListener('click', () => {
    document.getElementById('restoreFile').click();
});

document.getElementById('restoreFile').addEventListener('change', () => {
    const fileInput = document.getElementById('restoreFile');
    const file = fileInput.files[0];
    if (file && ws && ws.readyState === WebSocket.OPEN) {
        if (confirm('هل أنت متأكد؟ هذا سيحذف الرموز الحالية وقد يؤثر على الجلسات النشطة.')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const base64Content = btoa(String.fromCharCode.apply(null, data));
                showToast('جاري رفع الرموز...', 'success');
                ws.send(JSON.stringify({ type: 'importCodes', data: { content: base64Content, phoneNumber } }));
            };
            reader.readAsArrayBuffer(file);
        } else {
            fileInput.value = '';
        }
    } else {
        showToast('يرجى اختيار ملف Excel صالح!', 'error');
    }
});

document.getElementById('addAdButton').addEventListener('click', () => {
    const title = document.getElementById('adTitle').value.trim();
    const text = document.getElementById('adText').value.trim();
    const link = document.getElementById('adLink').value.trim();
    const button_text = document.getElementById('adButtonText').value.trim();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addAdvertisement', data: { title, text, link, button_text, phoneNumber } }));
        document.getElementById('adTitle').value = '';
        document.getElementById('adText').value = '';
        document.getElementById('adLink').value = '';
        document.getElementById('adButtonText').value = '';
    } else {
        showToast('لا يوجد اتصال بالخادم!', 'error');
    }
});

function fetchAdvertisements() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'getAdvertisements', data: { phoneNumber } }));
    }
}

function displayAdvertisements(ads) {
    const container = document.getElementById('advertisementsContainer');
    container.innerHTML = '';
    ads.forEach(ad => {
        if (ad.title || ad.text || ad.link) {
            const card = document.createElement('div');
            card.className = 'advertisement-card';
            if (ad.title) {
                const title = document.createElement('p');
                title.className = 'ad-title';
                title.textContent = ad.title;
                card.appendChild(title);
            }
            if (ad.text) {
                const text = document.createElement('p');
                text.className = 'ad-text';
                text.textContent = ad.text;
                card.appendChild(text);
            }
            if (ad.link) {
                const button = document.createElement('a');
                button.className = 'ad-button';
                button.href = ad.link;
                button.target = '_blank';
                button.textContent = ad.button_text;
                card.appendChild(button);
            }
            container.appendChild(card);
        }
    });
}

function displayAdminAdvertisements(ads) {
    const list = document.getElementById('advertisementsList');
    list.innerHTML = '';
    ads.forEach(ad => {
        const div = document.createElement('div');
        div.className = 'advertisement-item';
        const title = ad.title ? ad.title.substring(0, 30) + (ad.title.length > 30 ? '...' : '') : 'بدون عنوان';
        div.innerHTML = `<span>${title}</span>`;
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-ad-btn';
        deleteBtn.textContent = 'حذف';
        deleteBtn.dataset.id = ad.id;
        deleteBtn.addEventListener('click', () => {
            if (confirm('هل أنت متأكد من حذف هذا الإعلان؟')) {
                ws.send(JSON.stringify({ type: 'deleteAdvertisement', data: { id: ad.id, phoneNumber } }));
            }
        });
        div.appendChild(deleteBtn);
        list.appendChild(div);
    });
}

function createHexGrid(gridId, clickable) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '<div class="party-text" id="partyText' + (gridId === 'hexGridHost' ? '' : 'Contestant') + '">مبروك</div>';
    const layout = [
        ['', '', '', '', '', '', ''],
        ['', 'أ', 'ب', 'ت', 'ث', 'ج', ''],
        ['', 'ح', 'خ', 'د', 'ذ', 'ر', ''],
        ['', 'ز', 'س', 'ش', 'ص', 'ض', ''],
        ['', 'ط', 'ظ', 'ع', 'غ', 'ف', ''],
        ['', 'ق', 'ك', 'ل', 'م', 'ن', ''],
        ['', '', '', '', '', 'ه', '']
    ];

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
        updateGrid(hexagons, shuffled, gridId);
        ws.send(JSON.stringify({ type: 'shuffle', data: { lettersOrder: shuffled, hexagons, phoneNumber } }));
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

    if (clickCount === 1) {
        currentQuestionLetter = letter;
        document.getElementById('questionLetter').value = letter;
        showQuestionAndAnswer(letter);
    } else if (clickCount === 0) {
        document.getElementById('currentQuestion').innerText = '';
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'updateHexagon', data: { letter, color: newColor, clickCount, phoneNumber } }));
    }
}

function showQuestionAndAnswer(letter) {
    const toggle = document.getElementById('toggleQuestions').checked;
    const questions = toggle ? defaultQuestions.general : defaultQuestions.session;
    if (!questions || !questions[letter]) {
        document.getElementById('currentQuestion').innerText = toggle ? 
            'لا توجد أسئلة عامة لهذا الحرف' : 
            'لم تضف سؤالًا لهذا الحرف، جرب تفعيل الأسئلة العامة';
        return;
    }
    if (!usedQuestions[letter]) usedQuestions[letter] = [];
    const availableQuestions = questions[letter];
    let availableIndexes = [];
    if (usedQuestions[letter].length < availableQuestions.length) {
        availableIndexes = availableQuestions.map((_, index) => index).filter(i => !usedQuestions[letter].includes(i));
    } else {
        usedQuestions[letter] = [];
        availableIndexes = availableQuestions.map((_, index) => index);
    }
    const randomIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    const [question, answer] = availableQuestions[randomIndex];
    usedQuestions[letter].push(randomIndex);
    document.getElementById('currentQuestion').innerText = `${question} - ${answer}`;
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
        ws.send(JSON.stringify({ type: 'shuffle', data: { lettersOrder: shuffled, hexagons, phoneNumber } }));
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
    if (!partyInterval) {
        partyInterval = setInterval(() => {
            const currentSet = colorSets[currentColorSetIndex];
            const currentTextColor = rgbToHex(partyText.style.color);
            partyText.style.color = (currentTextColor === '#ffd700') ? currentSet.red : '#ffd700';
            for (let i = 0; i < 5; i++) {
                const flash = document.createElement('div');
                flash.className = 'flash';
                flash.style.left = Math.random() * 100 + '%';
                flash.style.top = Math.random() * 100 + '%';
                flash.style.backgroundColor = ['#ffd700', '#ff4500', '#00ff00'][Math.floor(Math.random() * 3)];
                grid.appendChild(flash);
                setTimeout(() => flash.remove(), 1000);
            }
        }, 300);
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'party', data: { active: false, phoneNumber } }));
            }
        }, 5000);
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

document.getElementById('buzzerButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'buzzer', data: { player: playerName, phoneNumber } }));
        const audio = document.getElementById('buzzerSound');
        audio.play().catch(err => console.error('Error playing buzzer sound on contestant:', err));
    }
});

document.getElementById('resetBuzzerButton').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resetBuzzer', data: { phoneNumber } }));
    }
});

document.getElementById('nextQuestionButton').addEventListener('click', () => {
    if (currentQuestionLetter) showQuestionAndAnswer(currentQuestionLetter);
});

document.getElementById('addQuestionButton').addEventListener('click', () => {
    const question = document.getElementById('newQuestionInput').value.trim();
    const answer = document.getElementById('newAnswerInput').value.trim();
    const letter = document.getElementById('questionLetter').value;
    if (question && answer && letter && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'addQuestion', data: { letter, question, answer, phoneNumber } }));
        document.getElementById('newQuestionInput').value = '';
        document.getElementById('newAnswerInput').value = '';
        document.getElementById('questionLetter').value = '';
        showToast('تم إضافة السؤال بنجاح!', 'success');
    } else {
        showToast('يرجى إدخال السؤال والإجابة وحرف السؤال!', 'error');
    }
});

function updateGrid(hexagons, lettersOrder, gridId) {
    const gridHexagons = document.querySelectorAll(`#${gridId} .changeable`);
    gridHexagons.forEach((hex, index) => {
        const letter = lettersOrder[index];
        hex.textContent = letter;
        hex.dataset.letter = letter;
        hex.style.backgroundColor = hexagons[letter].color;
        hex.dataset.clickCount = hexagons[letter].clickCount;
    });

    const redHexagons = document.querySelectorAll(`#${gridId} .red-fixed`);
    const greenHexagons = document.querySelectorAll(`#${gridId} .green-fixed`);
    const currentSet = colorSets[currentColorSetIndex];
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
        const teamName = buzzer.team === 'red' ? 'الأحمر' : 'الأخضر';
        info.innerText = `${buzzer.player} من الفريق ${teamName}`;
        if (!isHost) buzzerButton.disabled = true;
    } else {
        info.innerText = '';
        if (!isHost) buzzerButton.disabled = false;
    }
}

function updateTeams(teams) {
    console.log('تحديث الفرق باستخدام:', teams);
    ['red', 'green'].forEach(team => {
        const teamList = document.getElementById(`${team}TeamList`);
        teamList.innerHTML = `<h3>الفريق ${team === 'red' ? 'الأحمر' : 'الأخضر'}</h3>`;
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
            document.getElementById('teamInfo').innerText = `أنت في الفريق ${team === 'red' ? 'الأحمر' : 'الأخضر'}`;
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
    document.getElementById('questionsCount').innerText = `عدد الأسئلة العامة: ${questions.length}`;
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