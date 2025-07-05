const colorSets = [
    { red: '#ff4081', green: '#81c784' },
    { red: '#f8bbd0', green: '#4dd0e1' },
    { red: '#d32f2f', green: '#0288d1' },
    { red: '#ff5722', green: '#388e3c' }
];
let currentColorSetIndex = 0;
let isSwapped = false;
let goldenLetter = null; // New global variable for golden letter

let ws = null;
let partyInterval = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectInterval = 3000;

// استخراج sessionId و token من الرابط
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('sessionId');
const token = urlParams.get('token');

function connectWebSocket() {
    try {
        ws = new WebSocket(window.location.protocol === 'https:' ? 'wss://' + window.location.host : 'ws://' + window.location.host);
        ws.onopen = () => {
            console.log('Connected to WebSocket (Display)');
            reconnectAttempts = 0;
            if (token) {
                ws.send(JSON.stringify({ type: 'reconnect', data: { token } }));
            }
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        ws.onclose = () => {
            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Reconnection attempt ${reconnectAttempts}`);
                    connectWebSocket();
                }, reconnectInterval);
            } else {
                console.log('Max reconnection attempts reached');
            }
        };
        ws.onmessage = handleMessages;
        ws.onpong = () => {
            console.log('Received pong from server');
        };
    } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
    }
}

function handleMessages(event) {
    const { type, data } = JSON.parse(event.data);
    if (type === 'init') {
        currentColorSetIndex = data.colorSetIndex;
        isSwapped = data.isSwapped;
        goldenLetter = data.goldenLetter; // Store goldenLetter from init message
        updateGrid(data.hexagons, data.lettersOrder, 'hexGridDisplay');
        updateBuzzer(data.buzzer);
    } else if (type === 'updateHexagon') {
        const hex = document.querySelector(`#hexGridDisplay .changeable[data-letter="${data.letter}"]`);
        if (hex) {
            hex.style.backgroundColor = data.color;
            hex.dataset.clickCount = data.clickCount;
        }
    } else if (type === 'shuffle') {
        goldenLetter = data.goldenLetter; // Update goldenLetter on shuffle
        updateGrid(data.hexagons, data.lettersOrder, 'hexGridDisplay');
        stopPartyMode();
    } else if (type === 'swapColors') {
        isSwapped = data.isSwapped;
        updateGrid(data.hexagons, data.lettersOrder, 'hexGridDisplay');
    } else if (type === 'changeColors') {
        currentColorSetIndex = data.colorSetIndex;
        updateGrid(data.hexagons, data.lettersOrder, 'hexGridDisplay');
        stopPartyMode();
    } else if (type === 'party') {
        if (data.active) startPartyMode(); else stopPartyMode();
    } else if (type === 'goldenLetterActivated') { // New handler for goldenLetterActivated
        console.log('Received goldenLetterActivated:', data);
        if (data.active && data.letter === goldenLetter) {
            startGoldenLetterCelebration();
        }
    } else if (type === 'buzzer') {
        updateBuzzer(data);
    } else if (type === 'timeUpWarning') {
        const info = document.getElementById('buzzerInfoDisplay');
        info.innerText = data.message;
        const audio = document.getElementById('timeUpSound');
        audio.play().catch(err => console.error('Error playing time up sound:', err));
    } else if (type === 'timeUp') {
        updateBuzzer({ active: false, player: '', team: null });
    } else if (type === 'resetBuzzer') {
        updateBuzzer({ active: false, player: '', team: null });
    }
}

window.onload = () => {
    createHexGrid('hexGridDisplay', false);
    const buzzerSound = document.getElementById('buzzerSound');
    if (buzzerSound) buzzerSound.load();
    const timeUpSound = document.getElementById('timeUpSound');
    if (timeUpSound) timeUpSound.load();
    const goldSound = document.getElementById('goldSound'); // Preload goldSound
    if (goldSound) goldSound.load();
    const winningSound = document.getElementById('winningSound'); // Preload winningSound
    if (winningSound) winningSound.load();
    connectWebSocket();
};

function createHexGrid(gridId, clickable) {
    const grid = document.getElementById(gridId);
    if (!grid) {
        console.error('Grid element not found:', gridId);
        return;
    }

    let wrapper = grid.parentElement;
    if (!wrapper || !wrapper.classList.contains('hexGridWrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'hexGridWrapper';
        grid.parentNode.insertBefore(wrapper, grid);
        wrapper.appendChild(grid);
    }

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

    layout.forEach((row, rowIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        row.forEach((letter, colIndex) => {
            const hex = document.createElement('div');
            hex.className = `hexagon display-hex`;
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
            }
            rowDiv.appendChild(hex);
        });
        grid.appendChild(rowDiv);
    });

    // Create partyText and goldenText dynamically and append to wrapper
    const partyText = document.createElement('div');
    partyText.className = 'party-text';
    partyText.id = 'partyTextDisplay';
    partyText.textContent = 'مبروك';

    const goldenText = document.createElement('div');
    goldenText.className = 'golden-text';
    goldenText.id = 'goldenText';
    goldenText.textContent = '✨حرف ذهبي✨';

    wrapper.appendChild(partyText);
    wrapper.appendChild(goldenText);
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
    const info = document.getElementById('buzzerInfoDisplay');
    const container = document.querySelector('.container'); // Get the container element
    if (buzzer.active && buzzer.player && buzzer.team) {
        const teamName = buzzer.team === 'red' ? 'الأحمر' : 'الأخضر';
        info.innerText = `${buzzer.player} من الفريق ${teamName}`;
        // Add class to change background color
        container.classList.add(`buzzer-active-${buzzer.team}`);
        setTimeout(() => {
            container.classList.remove(`buzzer-active-${buzzer.team}`);
            container.classList.add('buzzer-reset');
            setTimeout(() => {
                container.classList.remove('buzzer-reset');
            }, 100); // Small delay to allow transition back to original color
        }, 1000); // Remove after 1 second
    } else {
        info.innerText = '';
        // Ensure classes are removed when buzzer is inactive
        container.classList.remove('buzzer-active-red', 'buzzer-active-green', 'buzzer-reset');
    }
    const buzzerSound = document.getElementById('buzzerSound');
    if (buzzer.active && buzzerSound) {
        buzzerSound.play().catch(err => console.error('خطأ في تشغيل صوت الجرس:', err));
    }
}

function startPartyMode() {
    const partyText = document.getElementById('partyTextDisplay');
    const grid = document.getElementById('hexGridDisplay');
    if (!partyText || !grid) { // Add null checks
        console.error('Party text or grid not found:', { partyText, grid });
        return;
    }
    partyText.style.display = 'block';
    const winningSound = document.getElementById('winningSound'); // Get winning sound element
    if (winningSound) {
        winningSound.play().catch(err => console.error('خطأ في تشغيل صوت الاحتفالية:', err));
    }
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
                const colors = ['#ffd700', '#ff4500', '#00ff00']; // Define colors for flashes
                flash.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                grid.appendChild(flash);
                setTimeout(() => flash.remove(), 1000);
            }
        }, 300);
        setTimeout(() => {
            stopPartyMode();
            if (winningSound) { // Stop winning sound after party mode
                winningSound.pause();
                winningSound.currentTime = 0;
            }
        }, 8500); // Party mode duration set to 8.5 seconds
    }
}

function stopPartyMode() {
    if (partyInterval) {
        clearInterval(partyInterval);
        partyInterval = null;
        const partyText = document.getElementById('partyTextDisplay'); // Get partyText element
        if (partyText) partyText.style.display = 'none'; // Null check for partyText
        document.querySelectorAll('.flash').forEach(flash => flash.remove());
        const winningSound = document.getElementById('winningSound'); // Get winning sound element
        if (winningSound) { // Stop winning sound if it's playing
            winningSound.pause();
            winningSound.currentTime = 0;
        }
    }
}

// New function for golden letter celebration
function startGoldenLetterCelebration() {
    console.log('Golden celebration started');
    const goldenText = document.getElementById('goldenText');
    const grid = document.getElementById('hexGridDisplay');
    if (!goldenText || !grid) { // Add null checks
        console.error('Golden text or grid not found:', { goldenText, grid });
        return;
    }
    goldenText.style.display = 'block';
    const goldSound = document.getElementById('goldSound'); // Get gold sound element
    if (goldSound) {
        goldSound.play().catch(err => console.error('خطأ في تشغيل صوت الحرف الذهبي:', err));
    }
    let goldenInterval = setInterval(() => {
        const colors = ['#ffd700', '#ff4500']; // Colors for golden flashes
        for (let i = 0; i < 5; i++) {
            const flash = document.createElement('div');
            flash.className = 'flash';
            flash.style.left = Math.random() * 100 + '%';
            flash.style.top = Math.random() * 100 + '%';
            flash.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            flash.style.animationDuration = `${0.5 + Math.random() * 0.5}s`; // Randomize flash duration
            grid.appendChild(flash);
            setTimeout(() => flash.remove(), 1000);
        }
    }, 300);
    setTimeout(() => {
        clearInterval(goldenInterval);
        goldenText.style.display = 'none';
        document.querySelectorAll('.flash').forEach(flash => flash.remove());
        if (goldSound) { // Stop gold sound after celebration
            goldSound.pause();
            goldSound.currentTime = 0;
        }
    }, 3000); // Golden letter celebration duration set to 3 seconds
}
