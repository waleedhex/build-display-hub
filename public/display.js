const colorSets = [
    { red: '#ff4081', green: '#81c784' },
    { red: '#f8bbd0', green: '#4dd0e1' },
    { red: '#d32f2f', green: '#0288d1' },
    { red: '#ff5722', green: '#388e3c' }
];
let currentColorSetIndex = 0;
let isSwapped = false;

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
        updateGrid(data.hexagons, data.lettersOrder, 'hexGridDisplay');
        updateBuzzer(data.buzzer);
    } else if (type === 'updateHexagon') {
        const hex = document.querySelector(`#hexGridDisplay .changeable[data-letter="${data.letter}"]`);
        if (hex) {
            hex.style.backgroundColor = data.color;
            hex.dataset.clickCount = data.clickCount;
        }
    } else if (type === 'shuffle') {
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
    const audio = document.getElementById('buzzerSound');
    audio.load();
    const timeUpAudio = document.getElementById('timeUpSound');
    timeUpAudio.load();
    connectWebSocket();
};

function createHexGrid(gridId, clickable) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '<div class="party-text" id="partyTextDisplay">مبروك</div>';
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
    if (buzzer.active && buzzer.player && buzzer.team) {
        const teamName = buzzer.team === 'red' ? 'الأحمر' : 'الأخضر';
        info.innerText = `${buzzer.player} من الفريق ${teamName}`;
    } else {
        info.innerText = '';
    }
}

function startPartyMode() {
    const partyText = document.getElementById('partyTextDisplay');
    const grid = document.getElementById('hexGridDisplay');
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
            stopPartyMode();
        }, 5000);
    }
}

function stopPartyMode() {
    if (partyInterval) {
        clearInterval(partyInterval);
        partyInterval = null;
        document.getElementById('partyTextDisplay').style.display = 'none';
        document.querySelectorAll('.flash').forEach(flash => flash.remove());
    }
}