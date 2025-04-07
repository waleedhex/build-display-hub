const express = require('express');
const { Server, WebSocket } = require('ws');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = process.env.PORT || 8080;

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, 'public')));

const server = require('http').createServer(app);
const wss = new Server({ server });

const MAX_CODES_PER_REQUEST = 5000;

let sessions = new Map();
let clients = [];

const colorSets = [
    { red: '#ff4081', green: '#81c784' },
    { red: '#f8bbd0', green: '#4dd0e1' },
    { red: '#d32f2f', green: '#0288d1' },
    { red: '#ff5722', green: '#388e3c' }
];

async function initDatabase() {
    try {
        await db.connect();
        console.log('Connected to PostgreSQL database');
        await Promise.all([
            db.query(`
                CREATE TABLE IF NOT EXISTS subscribers (
                    code TEXT PRIMARY KEY,
                    is_admin BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `),
            db.query(`
                CREATE TABLE IF NOT EXISTS general_questions (
                    id SERIAL PRIMARY KEY,
                    letter TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `),
            db.query(`
                CREATE TABLE IF NOT EXISTS session_questions (
                    id SERIAL PRIMARY KEY,
                    session_code TEXT NOT NULL,
                    letter TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `)
        ]);

        const adminCheck = await db.query('SELECT code FROM subscribers WHERE is_admin = TRUE');
        if (adminCheck.rows.length === 0) {
            const adminCode = process.env.ADMIN_CODE || 'IMWRA143';
            await db.query('INSERT INTO subscribers (code, is_admin) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [adminCode, true]);
            console.log(`Admin code ${adminCode} added to subscribers`);
        }

        const questionsExist = await db.query('SELECT COUNT(*) FROM general_questions');
        if (parseInt(questionsExist.rows[0].count) === 0) {
            try {
                const data = await fs.readFile(path.join(__dirname, 'public', 'questions.json'), 'utf8');
                const questions = JSON.parse(data);
                const client = await db.connect();
                try {
                    await client.query('BEGIN');
                    for (const letter in questions) {
                        for (const [question, answer] of questions[letter]) {
                            await client.query(
                                'INSERT INTO general_questions (letter, question, answer) VALUES ($1, $2, $3)',
                                [letter, question, answer]
                            );
                        }
                    }
                    await client.query('COMMIT');
                    console.log('Initial general questions loaded from questions.json');
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                } finally {
                    client.release();
                }
            } catch (err) {
                console.error('Error loading initial questions:', err);
            }
        }

        console.log('Database tables initialized');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

async function loadQuestions(sessionId = null, useGeneral = true) {
    try {
        let query, params;
        if (useGeneral) {
            query = 'SELECT letter, question, answer FROM general_questions';
            params = [];
        } else {
            query = 'SELECT letter, question, answer FROM session_questions WHERE session_code = $1';
            params = [sessionId];
        }
        const result = await db.query(query, params);
        const questions = {};
        result.rows.forEach(row => {
            if (!questions[row.letter]) questions[row.letter] = [];
            questions[row.letter].push([row.question, row.answer]);
        });
        return questions;
    } catch (error) {
        console.error('Error loading questions:', error);
        return {};
    }
}

function generateRandomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters[Math.floor(Math.random() * characters.length)];
    }
    return code;
}

async function generateUniqueCode() {
    let code;
    do {
        code = generateRandomCode();
        const result = await db.query('SELECT code FROM subscribers WHERE code = $1', [code]);
        if (result.rows.length === 0) break;
    } while (true);
    return code;
}

async function generateMultipleCodes(count) {
    if (count > MAX_CODES_PER_REQUEST) throw new Error('الحد الأقصى 5000 رمز في المرة الواحدة');
    const newCodes = [];
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < count; i++) {
            const code = await generateUniqueCode();
            await client.query('INSERT INTO subscribers (code) VALUES ($1)', [code]);
            newCodes.push(code);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return newCodes;
}

function broadcast(sessionId, data, excludeClient) {
    clients.forEach(client => {
        if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN && (!excludeClient || client.ws !== excludeClient.ws)) {
            client.ws.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    ws.on('message', async (message) => {
        console.log('Received WebSocket message:', message.toString());
        const { type, data } = JSON.parse(message);

        switch (type) {
            case 'verifyPhone':
                const inputCode = data.phoneNumber.toUpperCase();
                const result = await db.query('SELECT code, is_admin FROM subscribers WHERE code = $1', [inputCode]);
                if (result.rows.length > 0) {
                    ws.sessionId = inputCode;
                    const isAdmin = result.rows[0].is_admin;
                    if (!sessions.has(ws.sessionId)) {
                        sessions.set(ws.sessionId, {
                            hexagons: {},
                            lettersOrder: ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'],
                            teams: { red: [], green: [] },
                            buzzer: { active: false, player: '' },
                            buzzerLock: false,
                            colorSetIndex: 0,
                            isSwapped: false,
                            partyMode: false,
                            questions: { general: await loadQuestions(null, true), session: await loadQuestions(ws.sessionId, false) }
                        });
                    }
                    ws.send(JSON.stringify({ type: 'codeVerified' }));
                } else {
                    ws.send(JSON.stringify({ type: 'codeError', data: 'الرمز غير صحيح' }));
                }
                break;

            case 'join':
                if (ws.sessionId) {
                    const client = { ws, role: data.role, name: data.name, sessionId: ws.sessionId };
                    const session = sessions.get(ws.sessionId);
                    const existingHost = clients.find(c => c.sessionId === ws.sessionId && c.role === 'host');

                    if (data.role === 'host') {
                        if (existingHost) {
                            ws.send(JSON.stringify({ type: 'joinError', data: 'يوجد مضيف بالفعل في هذه الجلسة!' }));
                            return;
                        }
                        clients.push(client);
                        ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: session.questions } }));
                    } else if (data.role === 'contestant') {
                        clients.push(client);
                        // التعديل هنا: اختيار الفريق الذي يحتوي على عدد أقل من اللاعبين
                        const redCount = session.teams.red.length;
                        const greenCount = session.teams.green.length;
                        const team = redCount <= greenCount ? 'red' : 'green';
                        if (!session.teams[team].includes(data.name)) {
                            session.teams[team].push(data.name);
                        }
                        ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: {} } }));
                        console.log('Broadcasting teams:', session.teams);
                        broadcast(ws.sessionId, { type: 'updateTeams', data: session.teams }, null);
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'error', data: 'يرجى التحقق من الرمز أولاً' }));
                }
                break;

            case 'updateHexagon':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    session.hexagons[data.letter] = { color: data.color, clickCount: data.clickCount };
                    broadcast(ws.sessionId, { type: 'updateHexagon', data }, null);
                }
                break;

            case 'shuffle':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    session.lettersOrder = data.lettersOrder;
                    session.hexagons = data.hexagons;
                    broadcast(ws.sessionId, { type: 'shuffle', data: { hexagons: session.hexagons, lettersOrder: session.lettersOrder } }, null);
                }
                break;

            case 'swapColors':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    session.isSwapped = data.isSwapped;
                    const updatedHexagons = {};
                    for (const letter in session.hexagons) {
                        const { color, clickCount } = session.hexagons[letter];
                        let newColor = color;
                        if (color === colorSets[session.colorSetIndex].red) {
                            newColor = colorSets[session.colorSetIndex].green;
                        } else if (color === colorSets[session.colorSetIndex].green) {
                            newColor = colorSets[session.colorSetIndex].red;
                        }
                        updatedHexagons[letter] = { color: newColor, clickCount };
                    }
                    session.hexagons = updatedHexagons;
                    session.lettersOrder = data.lettersOrder;
                    broadcast(ws.sessionId, {
                        type: 'swapColors',
                        data: {
                            isSwapped: session.isSwapped,
                            hexagons: session.hexagons,
                            lettersOrder: session.lettersOrder
                        }
                    }, null);
                }
                break;

            case 'changeColors':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    const oldColorSetIndex = session.colorSetIndex;
                    session.colorSetIndex = data.colorSetIndex;
                    const updatedHexagons = {};
                    for (const letter in session.hexagons) {
                        const { color, clickCount } = session.hexagons[letter];
                        let newColor = color;
                        for (let i = 0; i < colorSets.length; i++) {
                            if (color === colorSets[i].red) {
                                newColor = session.isSwapped ? colorSets[session.colorSetIndex].green : colorSets[session.colorSetIndex].red;
                                break;
                            } else if (color === colorSets[i].green) {
                                newColor = session.isSwapped ? colorSets[session.colorSetIndex].red : colorSets[session.colorSetIndex].green;
                                break;
                            }
                        }
                        updatedHexagons[letter] = { color: newColor, clickCount };
                    }
                    session.hexagons = updatedHexagons;
                    session.lettersOrder = data.lettersOrder;
                    broadcast(ws.sessionId, {
                        type: 'changeColors',
                        data: {
                            colorSetIndex: session.colorSetIndex,
                            hexagons: session.hexagons,
                            lettersOrder: session.lettersOrder
                        }
                    }, null);
                }
                break;

            case 'party':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    session.partyMode = data.active;
                    broadcast(ws.sessionId, { type: 'party', data: { active: data.active } }, null);
                }
                break;

            case 'buzzer':
                if (ws.sessionId && !sessions.get(ws.sessionId).buzzer.active && !sessions.get(ws.sessionId).buzzerLock && clients.find(c => c.ws === ws && c.role === 'contestant')) {
                    const session = sessions.get(ws.sessionId);
                    session.buzzer = { active: true, player: data.player };
                    session.buzzerLock = true;
                    console.log(`Buzzer activated by ${data.player} in session ${ws.sessionId}`);
                    broadcast(ws.sessionId, { type: 'buzzer', data: session.buzzer }, null);
                    setTimeout(() => {
                        session.buzzer = { active: false, player: '' };
                        session.buzzerLock = false;
                        broadcast(ws.sessionId, { type: 'timeUp', data: {} }, null);
                    }, 6000);
                }
                break;

            case 'resetBuzzer':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    session.buzzer = { active: false, player: '' };
                    session.buzzerLock = false;
                    broadcast(ws.sessionId, { type: 'resetBuzzer', data: {} }, null);
                }
                break;

            case 'updateTeams':
                if (ws.sessionId) {
                    const session = sessions.get(ws.sessionId);
                    session.teams = data.teams;
                    console.log('Broadcasting teams from updateTeams:', session.teams);
                    broadcast(ws.sessionId, { type: 'updateTeams', data: session.teams }, null);
                }
                break;

            case 'addQuestion':
                if (ws.sessionId && clients.find(c => c.ws === ws && c.role === 'host')) {
                    const session = sessions.get(ws.sessionId);
                    if (!session.questions.session[data.letter]) session.questions.session[data.letter] = [];
                    session.questions.session[data.letter].push([data.question, data.answer]);
                    await db.query(
                        'INSERT INTO session_questions (session_code, letter, question, answer) VALUES ($1, $2, $3, $4)',
                        [ws.sessionId, data.letter, data.question, data.answer]
                    );
                    broadcast(ws.sessionId, { type: 'updateQuestions', data: session.questions.session }, null);
                }
                break;

            case 'generateCodes':
                const adminCheckGenerate = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckGenerate.rows.length > 0) {
                    try {
                        const newCodes = await generateMultipleCodes(data.count);
                        ws.send(JSON.stringify({ type: 'codesGenerated', data: newCodes }));
                    } catch (error) {
                        ws.send(JSON.stringify({ type: 'adminError', data: error.message || 'خطأ في توليد الرموز' }));
                    }
                }
                break;

            case 'addManualCode':
                const adminCheckAdd = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckAdd.rows.length > 0) {
                    const code = data.code.toUpperCase();
                    if (code.length !== 6 || !/^[A-Z0-9]+$/.test(code)) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'الرمز يجب أن يكون 6 حروف/أرقام (A-Z, 0-9)' }));
                    } else {
                        const result = await db.query('SELECT code FROM subscribers WHERE code = $1', [code]);
                        if (result.rows.length > 0) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'الرمز موجود مسبقًا' }));
                        } else {
                            await db.query('INSERT INTO subscribers (code) VALUES ($1)', [code]);
                            ws.send(JSON.stringify({ type: 'manualCodeAdded', data: code }));
                        }
                    }
                }
                break;

            case 'deleteCode':
                const adminCheckDelete = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckDelete.rows.length > 0) {
                    const code = data.code.toUpperCase();
                    const adminResult = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [code]);
                    if (adminResult.rows.length > 0) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'لا يمكن حذف رمز المسؤول!' }));
                    } else {
                        const result = await db.query('SELECT code FROM subscribers WHERE code = $1', [code]);
                        if (result.rows.length === 0) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'الرمز غير موجود' }));
                        } else {
                            await db.query('DELETE FROM subscribers WHERE code = $1', [code]);
                            ws.send(JSON.stringify({ type: 'codeDeleted', data: code }));
                        }
                    }
                }
                break;

            case 'deleteCodesList':
                const adminCheckList = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckList.rows.length > 0) {
                    const codes = data.codes;
                    if (!Array.isArray(codes)) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'القائمة غير صالحة' }));
                    } else {
                        const client = await db.connect();
                        try {
                            await client.query('BEGIN');
                            const deletedCodes = [];
                            for (const code of codes) {
                                const upperCode = code.toUpperCase();
                                const adminCheck = await client.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [upperCode]);
                                if (adminCheck.rows.length === 0) {
                                    const result = await client.query('DELETE FROM subscribers WHERE code = $1 RETURNING code', [upperCode]);
                                    if (result.rowCount > 0) deletedCodes.push(code);
                                }
                            }
                            await client.query('COMMIT');
                            ws.send(JSON.stringify({ type: 'codesDeleted', data: deletedCodes }));
                        } catch (err) {
                            await client.query('ROLLBACK');
                            ws.send(JSON.stringify({ type: 'adminError', data: 'خطأ في حذف الرموز: ' + err.message }));
                        } finally {
                            client.release();
                        }
                    }
                }
                break;

            case 'deleteLatestCodes':
                const adminCheckLatest = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckLatest.rows.length > 0) {
                    const count = parseInt(data.count);
                    if (count > 0) {
                        const client = await db.connect();
                        try {
                            await client.query('BEGIN');
                            const deleted = await client.query(
                                'DELETE FROM subscribers WHERE code NOT IN (SELECT code FROM subscribers WHERE is_admin = TRUE) ORDER BY created_at DESC LIMIT $1 RETURNING code',
                                [count]
                            );
                            await client.query('COMMIT');
                            ws.send(JSON.stringify({ type: 'codesDeleted', data: deleted.rows.map(row => row.code) }));
                        } catch (err) {
                            await client.query('ROLLBACK');
                            ws.send(JSON.stringify({ type: 'adminError', data: 'خطأ في حذف الرموز: ' + err.message }));
                        } finally {
                            client.release();
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'أدخل عدد صحيح أكبر من 0' }));
                    }
                }
                break;

            case 'getCodesCount':
                const adminCheckCount = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckCount.rows.length > 0) {
                    const countResult = await db.query('SELECT COUNT(*) FROM subscribers');
                    ws.send(JSON.stringify({ type: 'codesCount', data: countResult.rows[0].count }));
                }
                break;

            case 'addGeneralQuestion':
                const adminCheckGeneral = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckGeneral.rows.length > 0) {
                    const { letter, question, answer } = data;
                    if (!letter || !question || !answer) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'يرجى إدخال الحرف والسؤال والإجابة' }));
                    } else {
                        await db.query(
                            'INSERT INTO general_questions (letter, question, answer) VALUES ($1, $2, $3)',
                            [letter, question, answer]
                        );
                        ws.send(JSON.stringify({ type: 'generalQuestionAdded', data: 'تم إضافة السؤال العام بنجاح' }));
                    }
                }
                break;

            case 'addGeneralQuestions':
                const adminCheckExcel = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckExcel.rows.length > 0) {
                    try {
                        const newQuestions = JSON.parse(data.fileContent);
                        const client = await db.connect();
                        try {
                            await client.query('BEGIN');
                            for (const q of newQuestions) {
                                await client.query(
                                    'INSERT INTO general_questions (letter, question, answer) VALUES ($1, $2, $3)',
                                    [q.letter, q.question, q.answer]
                                );
                            }
                            await client.query('COMMIT');
                            ws.send(JSON.stringify({ type: 'generalQuestionsAdded', data: 'تم إضافة الأسئلة العامة بنجاح' }));
                        } catch (err) {
                            await client.query('ROLLBACK');
                            throw err;
                        } finally {
                            client.release();
                        }
                    } catch (error) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'خطأ في إضافة الأسئلة: ' + error.message }));
                    }
                }
                break;

            case 'getGeneralQuestions':
                const adminCheckGetGeneral = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckGetGeneral.rows.length > 0) {
                    const letter = data.letter || '';
                    const query = letter ?
                        'SELECT id, letter, question, answer FROM general_questions WHERE letter = $1' :
                        'SELECT id, letter, question, answer FROM general_questions';
                    const result = await db.query(query, letter ? [letter] : []);
                    ws.send(JSON.stringify({ type: 'generalQuestions', data: result.rows }));
                }
                break;

            case 'deleteGeneralQuestions':
                const adminCheckDeleteGeneral = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckDeleteGeneral.rows.length > 0) {
                    const ids = data.ids;
                    if (ids && ids.length > 0) {
                        await db.query('DELETE FROM general_questions WHERE id = ANY($1::int[])', [ids]);
                        ws.send(JSON.stringify({ type: 'generalQuestionsDeleted', data: 'تم حذف الأسئلة المحددة' }));
                    } else {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'يرجى تحديد أسئلة لحذفها' }));
                    }
                }
                break;

            case 'getSessionQuestions':
                const adminCheckGetSession = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckGetSession.rows.length > 0) {
                    const letter = data.letter || '';
                    const query = letter ?
                        'SELECT letter, question, answer FROM session_questions WHERE letter = $1' :
                        'SELECT letter, question, answer FROM session_questions';
                    const result = await db.query(query, letter ? [letter] : []);
                    ws.send(JSON.stringify({ type: 'sessionQuestions', data: result.rows }));
                }
                break;

            case 'addToGeneral':
                const adminCheckAddToGeneral = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckAddToGeneral.rows.length > 0) {
                    const questions = data.questions;
                    if (questions && questions.length > 0) {
                        const client = await db.connect();
                        try {
                            await client.query('BEGIN');
                            for (const q of questions) {
                                await client.query(
                                    'INSERT INTO general_questions (letter, question, answer) VALUES ($1, $2, $3)',
                                    [q.letter, q.question, q.answer]
                                );
                            }
                            await client.query('COMMIT');
                            ws.send(JSON.stringify({ type: 'addedToGeneral', data: 'تم إضافة الأسئلة المحددة إلى العام' }));
                        } catch (err) {
                            await client.query('ROLLBACK');
                            ws.send(JSON.stringify({ type: 'adminError', data: 'خطأ في إضافة الأسئلة: ' + err.message }));
                        } finally {
                            client.release();
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'يرجى تحديد أسئلة لإضافتها' }));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        const index = clients.findIndex(client => client.ws === ws);
        if (index !== -1) {
            const client = clients[index];
            if (client.role === 'contestant' && client.sessionId) {
                const session = sessions.get(client.sessionId);
                session.teams.red = session.teams.red.filter(name => name !== client.name);
                session.teams.green = session.teams.green.filter(name => name !== client.name);
                console.log('Broadcasting teams after disconnect:', session.teams);
                broadcast(client.sessionId, { type: 'updateTeams', data: session.teams }, null);
            }
            clients.splice(index, 1);
            console.log('عميل انقطع اتصاله');
        }
    });
});

server.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    console.log(`HTTP server: http://localhost:${port}`);
    console.log(`WebSocket server: ws://localhost:${port}`);
    await initDatabase();
});