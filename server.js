const express = require('express');
const { Server, WebSocket } = require('ws');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');

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
let clients = new Map();
let tokens = new Map();

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
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT check_code_length_and_format CHECK (
                        (LENGTH(code) = 6 AND code ~ '^[A-Z0-9]{6}$')
                        OR
                        (LENGTH(code) = 7 AND code ~ '^X[A-Z0-9]{6}$')
                    )
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
            `),
            db.query(`
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    data JSONB NOT NULL,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `),
            db.query(`
                CREATE TABLE IF NOT EXISTS tokens (
                    token TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    player_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL
                )
            `),
            db.query(`
                CREATE TABLE IF NOT EXISTS advertisements (
                    id SERIAL PRIMARY KEY,
                    title TEXT,
                    text TEXT,
                    link TEXT,
                    button_text TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `)
        ]);

        const invalidCodes = await db.query(`
            SELECT code FROM subscribers
            WHERE NOT (
                (LENGTH(code) = 6 AND code ~ '^[A-Z0-9]{6}$')
                OR
                (LENGTH(code) = 7 AND code ~ '^X[A-Z0-9]{6}$')
            )
        `);
        if (invalidCodes.rows.length > 0) {
            console.warn('Invalid codes found:', invalidCodes.rows);
        }

        await db.query(`
            ALTER TABLE subscribers
            ADD CONSTRAINT IF NOT EXISTS check_code_length_and_format
            CHECK (
                (LENGTH(code) = 6 AND code ~ '^[A-Z0-9]{6}$')
                OR
                (LENGTH(code) = 7 AND code ~ '^X[A-Z0-9]{6}$')
            )
        `);

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

async function saveSession(sessionId, sessionData) {
    try {
        await db.query(
            'INSERT INTO sessions (session_id, data, last_activity) VALUES ($1, $2, NOW()) ON CONFLICT (session_id) DO UPDATE SET data = $2, last_activity = NOW()',
            [sessionId, JSON.stringify(sessionData)]
        );
    } catch (err) {
        console.error('Error saving session:', err);
    }
}

async function loadSession(sessionId) {
    try {
        const result = await db.query('SELECT data FROM sessions WHERE session_id = $1', [sessionId]);
        return result.rows.length > 0 ? JSON.parse(result.rows[0].data) : null;
    } catch (err) {
        console.error('Error loading session:', err);
        return null;
    }
}

async function generateToken(sessionId, playerName, role) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
        'INSERT INTO tokens (token, session_id, player_name, role, created_at, expires_at) VALUES ($1, $2, $3, $4, NOW(), $5)',
        [token, sessionId, playerName, role, expiresAt]
    );
    return token;
}

async function verifyToken(token) {
    try {
        const result = await db.query(
            'SELECT session_id, player_name, role FROM tokens WHERE token = $1 AND expires_at > NOW()',
            [token]
        );
        if (result.rows.length > 0) {
            console.log('Token verified successfully:', token);
            return result.rows[0];
        } else {
            console.log('Token invalid or expired:', token);
            return null;
        }
    } catch (err) {
        console.error('Error verifying token:', err);
        return null;
    }
}

async function cleanupSessions() {
    setInterval(async () => {
        try {
            await db.query(
                'DELETE FROM sessions WHERE last_activity < NOW() - INTERVAL \'10 minutes\''
            );
            await db.query(
                'DELETE FROM tokens WHERE expires_at < NOW() OR session_id NOT IN (SELECT session_id FROM sessions)'
            );
            sessions.forEach((_, sessionId) => {
                db.query('SELECT last_activity FROM sessions WHERE session_id = $1', [sessionId]).then(result => {
                    if (result.rows.length === 0) {
                        sessions.delete(sessionId);
                    }
                });
            });
        } catch (err) {
            console.error('Error cleaning up sessions:', err);
        }
    }, 5 * 60 * 1000);
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

function generateSpecialCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'X';
    for (let i = 0; i < 6; i++) {
        code += characters[Math.floor(Math.random() * characters.length)];
    }
    return code;
}

async function generateUniqueSpecialCode() {
    let attempts = 0;
    const maxAttempts = 100;
    let code;
    do {
        if (attempts >= maxAttempts) {
            throw new Error('تعذر توليد رمز خاص فريد بعد عدة محاولات');
        }
        code = generateSpecialCode();
        const result = await db.query('SELECT code FROM subscribers WHERE code = $1', [code]);
        if (result.rows.length === 0) break;
        attempts++;
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

async function generateMultipleSpecialCodes(count) {
    if (count > MAX_CODES_PER_REQUEST) throw new Error('الحد الأقصى 5000 رمز في المرة الواحدة');
    const newCodes = [];
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < count; i++) {
            const code = await generateUniqueSpecialCode();
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
    clients.forEach((client, clientId) => {
        if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN && (!excludeClient || client.ws !== excludeClient.ws)) {
            client.ws.send(JSON.stringify(data));
        }
    });
}

function startPingPong() {
    setInterval(() => {
        clients.forEach((client, clientId) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.ping();
            } else {
                handleClientDisconnect(client);
            }
        });
    }, 10000);
}

async function handleClientDisconnect(client) {
    const session = sessions.get(client.sessionId);
    if (client.role === 'contestant' && session) {
        session.disconnectedClients = session.disconnectedClients || {};
        session.disconnectedClients[client.name] = {
            team: session.teams.red.includes(client.name) ? 'red' : 'green',
            timestamp: Date.now()
        };
        setTimeout(async () => {
            if (session.disconnectedClients[client.name]) {
                session.teams.red = session.teams.red.filter(name => name !== client.name);
                session.teams.green = session.teams.green.filter(name => name !== client.name);
                delete session.disconnectedClients[client.name];
                await saveSession(client.sessionId, session);
                broadcast(client.sessionId, { type: 'updateTeams', data: session.teams }, null);
            }
        }, 30000);
    } else if (client.role === 'display' && session) {
        // إعادة تعيين حالة جهاز العرض عند الانقطاع
        session.displayConnected = false;
        await saveSession(client.sessionId, session);
    }
    clients.delete(client.clientId);
}

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    const clientId = uuidv4();
    ws.clientId = clientId;

    // إرسال الإعلانات النشطة عند الاتصال الأولي
    db.query('SELECT id, title, text, link, button_text FROM advertisements WHERE is_active = TRUE')
        .then(result => {
            ws.send(JSON.stringify({ type: 'activeAdvertisements', data: result.rows }));
        })
        .catch(err => console.error('Error fetching active advertisements:', err));

    ws.on('pong', () => {
        console.log('Received pong from client');
    });

    ws.on('message', async (message) => {
        console.log('Received WebSocket message:', message.toString());
        const { type, data } = JSON.parse(message);

        switch (type) {
            case 'reconnect':
                const tokenData = await verifyToken(data.token);
                if (tokenData) {
                    ws.sessionId = tokenData.session_id;
                    ws.playerName = tokenData.player_name;
                    const role = tokenData.role;
                    const session = sessions.get(ws.sessionId) || await loadSession(ws.sessionId);
                    if (session) {
                        const client = { ws, role, name: ws.playerName, sessionId: ws.sessionId, clientId };
                        if (role === 'display') {
                            // التحقق من عدد الأجهزة المتصلة بدور display
                            if (session.displayConnected) {
                                // تجاهل الاتصال الجديد دون إرسال رد
                                return;
                            }
                            session.displayConnected = true;
                            await saveSession(ws.sessionId, session);
                            clients.set(clientId, client);
                            ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: {} } }));
                        } else if (role === 'host') {
                            const existingHost = Array.from(clients.values()).find(c => c.sessionId === ws.sessionId && c.role === 'host');
                            if (existingHost) {
                                ws.send(JSON.stringify({ type: 'joinError', data: 'يوجد مضيف بالفعل في هذه الجلسة!' }));
                                clients.delete(clientId);
                                return;
                            }
                            clients.set(clientId, client);
                            ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: session.questions } }));
                        } else {
                            if (!session.teams.red.includes(ws.playerName) && !session.teams.green.includes(ws.playerName)) {
                                const redCount = session.teams.red.length;
                                const greenCount = session.teams.green.length;
                                const team = redCount <= greenCount ? 'red' : 'green';
                                session.teams[team].push(ws.playerName);
                                await saveSession(ws.sessionId, session);
                            }
                            clients.set(clientId, client);
                            ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: {} } }));
                            broadcast(ws.sessionId, { type: 'updateTeams', data: session.teams }, null);
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'error', data: 'الجلسة غير موجودة' }));
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'error', data: 'رمز مؤقت غير صالح، أدخل رمز جلسة' }));
                }
                break;

            case 'verifyPhone':
                const inputCode = data.phoneNumber.toUpperCase();
                const result = await db.query('SELECT code, is_admin FROM subscribers WHERE code = $1', [inputCode]);
                if (result.rows.length > 0) {
                    ws.sessionId = inputCode;
                    let session = sessions.get(ws.sessionId) || await loadSession(ws.sessionId);
                    if (!session) {
                        session = {
                            hexagons: {},
                            lettersOrder: ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'],
                            teams: { red: [], green: [] },
                            buzzer: { active: false, player: '', team: null },
                            buzzerLock: false,
                            colorSetIndex: 0,
                            isSwapped: false,
                            partyMode: false,
                            questions: { general: await loadQuestions(null, true), session: await loadQuestions(ws.sessionId, false) },
                            lastActivity: Date.now(),
                            displayConnected: false // متغير جديد لتتبع جهاز العرض
                        };
                        sessions.set(ws.sessionId, session);
                        await saveSession(ws.sessionId, session);
                    }
                    ws.send(JSON.stringify({ type: 'codeVerified' }));
                } else {
                    ws.send(JSON.stringify({ type: 'codeError', data: 'الرمز غير صحيح' }));
                }
                break;

            case 'join':
                if (ws.sessionId) {
                    const role = data.role;
                    const name = data.name;
                    const session = sessions.get(ws.sessionId);
                    const client = { ws, role, name, sessionId: ws.sessionId, clientId };
                    const existingHost = Array.from(clients.values()).find(c => c.sessionId === ws.sessionId && c.role === 'host');

                    if (role === 'host') {
                        if (existingHost) {
                            ws.send(JSON.stringify({ type: 'joinError', data: 'يوجد مضيف بالفعل في هذه الجلسة!' }));
                            return;
                        }
                        clients.set(clientId, client);
                        const token = await generateToken(ws.sessionId, name, role);
                        ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: session.questions, token } }));
                    } else if (role === 'contestant') {
                        clients.set(clientId, client);
                        const redCount = session.teams.red.length;
                        const greenCount = session.teams.green.length;
                        const team = redCount <= greenCount ? 'red' : 'green';
                        if (!session.teams[team].includes(name)) {
                            session.teams[team].push(name);
                        }
                        const token = await generateToken(ws.sessionId, name, role);
                        ws.send(JSON.stringify({ type: 'init', data: { ...session, questions: {}, token } }));
                        await saveSession(ws.sessionId, session);
                        broadcast(ws.sessionId, { type: 'updateTeams', data: session.teams }, null);
                    }
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                } else {
                    ws.send(JSON.stringify({ type: 'error', data: 'يرجى التحقق من الرمز أولاً' }));
                }
                break;

            case 'generateDisplayLink':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    const token = await generateToken(ws.sessionId, 'display', 'display');
                    const displayUrl = `https://hroof-198afbda9986.herokuapp.com/display.html?sessionId=${ws.sessionId}&token=${token}`;
                    ws.send(JSON.stringify({ type: 'displayLink', data: { url: displayUrl } }));
                }
                break;

            case 'updateHexagon':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    session.hexagons[data.letter] = { color: data.color, clickCount: data.clickCount };
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'updateHexagon', data }, null);
                }
                break;

            case 'shuffle':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    session.lettersOrder = data.lettersOrder;
                    session.hexagons = data.hexagons;
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'shuffle', data: { hexagons: session.hexagons, lettersOrder: session.lettersOrder } }, null);
                }
                break;

            case 'swapColors':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    session.isSwapped = data.isSwapped;
                    session.hexagons = data.hexagons;
                    session.lettersOrder = data.lettersOrder;
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'swapColors', data: { isSwapped: session.isSwapped, hexagons: session.hexagons, lettersOrder: session.lettersOrder } }, null);
                }
                break;

            case 'changeColors':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    session.colorSetIndex = data.colorSetIndex;
                    session.hexagons = data.hexagons;
                    session.lettersOrder = data.lettersOrder;
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'changeColors', data: { colorSetIndex: session.colorSetIndex, hexagons: session.hexagons, lettersOrder: session.lettersOrder } }, null);
                }
                break;

            case 'party':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    session.partyMode = data.active;
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'party', data: { active: data.active } }, null);
                }
                break;

            case 'buzzer':
                if (ws.sessionId && !sessions.get(ws.sessionId).buzzer.active && !sessions.get(ws.sessionId).buzzerLock && clients.get(clientId)?.role === 'contestant') {
                    const session = sessions.get(ws.sessionId);
                    const team = session.teams.red.includes(data.player) ? 'red' : session.teams.green.includes(data.player) ? 'green' : null;
                    if (team) {
                        session.buzzer = { active: true, player: data.player, team };
                        session.buzzerLock = true;
                        session.lastActivity = Date.now();
                        await saveSession(ws.sessionId, session);
                        broadcast(ws.sessionId, { type: 'buzzer', data: session.buzzer }, null);
                        setTimeout(() => {
                            broadcast(ws.sessionId, { type: 'timeUpWarning', data: { message: 'انتهى الوقت!' } }, null);
                        }, 6000);
                        setTimeout(() => {
                            session.buzzer = { active: false, player: '', team: null };
                            session.buzzerLock = false;
                            broadcast(ws.sessionId, { type: 'timeUp', data: {} }, null);
                            saveSession(ws.sessionId, session);
                        }, 7000);
                    }
                }
                break;

            case 'resetBuzzer':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    session.buzzer = { active: false, player: '', team: null };
                    session.buzzerLock = false;
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'resetBuzzer', data: {} }, null);
                }
                break;

            case 'updateTeams':
                if (ws.sessionId) {
                    const session = sessions.get(ws.sessionId);
                    session.teams = data.teams;
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'updateTeams', data: session.teams }, null);
                }
                break;

            case 'addQuestion':
                if (ws.sessionId && clients.get(clientId)?.role === 'host') {
                    const session = sessions.get(ws.sessionId);
                    if (!session.questions.session[data.letter]) session.questions.session[data.letter] = [];
                    session.questions.session[data.letter].push([data.question, data.answer]);
                    await db.query(
                        'INSERT INTO session_questions (session_code, letter, question, answer) VALUES ($1, $2, $3, $4)',
                        [ws.sessionId, data.letter, data.question, data.answer]
                    );
                    session.lastActivity = Date.now();
                    await saveSession(ws.sessionId, session);
                    broadcast(ws.sessionId, { type: 'updateQuestions', data: session.questions.session }, null);
                }
                break;

            case 'addAdvertisement':
                const adminCheckAdAdd = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckAdAdd.rows.length > 0) {
                    const { title, text, link, button_text } = data;
                    if (!title && !text && !link && !button_text) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'يجب إدخال حقل واحد على الأقل' }));
                    } else {
                        const validLink = link && (link.startsWith('http://') || link.startsWith('https://')) ? link : null;
                        const result = await db.query(
                            'INSERT INTO advertisements (title, text, link, button_text, is_active) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, title, text, link, button_text',
                            [title || null, text || null, validLink, button_text || 'اضغط هنا']
                        );
                        ws.send(JSON.stringify({ type: 'advertisementAdded', data: 'تم إضافة الإعلان بنجاح' }));
                        broadcast(ws.sessionId, { type: 'activeAdvertisements', data: await db.query('SELECT id, title, text, link, button_text FROM advertisements WHERE is_active = TRUE').then(res => res.rows) }, null);
                    }
                }
                break;

            case 'deleteAdvertisement':
                const adminCheckAdDelete = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckAdDelete.rows.length > 0) {
                    const adId = data.id;
                    const result = await db.query('DELETE FROM advertisements WHERE id = $1', [adId]);
                    if (result.rowCount > 0) {
                        ws.send(JSON.stringify({ type: 'advertisementDeleted', data: 'تم حذف الإعلان بنجاح' }));
                        broadcast(ws.sessionId, { type: 'activeAdvertisements', data: await db.query('SELECT id, title, text, link, button_text FROM advertisements WHERE is_active = TRUE').then(res => res.rows) }, null);
                    } else {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'الإعلان غير موجود' }));
                    }
                }
                break;

            case 'getAdvertisements':
                const adminCheckAdGet = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckAdGet.rows.length > 0) {
                    const result = await db.query('SELECT id, title, text, link, button_text, is_active FROM advertisements');
                    ws.send(JSON.stringify({ type: 'advertisements', data: result.rows }));
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

            case 'generateSpecialCodes':
                const adminCheckSpecial = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckSpecial.rows.length > 0) {
                    try {
                        const newCodes = await generateMultipleSpecialCodes(data.count);
                        ws.send(JSON.stringify({ type: 'specialCodesGenerated', data: newCodes }));
                    } catch (error) {
                        ws.send(JSON.stringify({ type: 'adminError', data: error.message || 'خطأ في توليد الرموز الخاصة' }));
                    }
                }
                break;

            case 'addManualCode':
                const adminCheckAdd = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckAdd.rows.length > 0) {
                    const code = data.code.toUpperCase();
                    if (
                        (code.length === 6 && /^[A-Z0-9]{6}$/.test(code)) ||
                        (code.length === 7 && /^X[A-Z0-9]{6}$/.test(code))
                    ) {
                        const result = await db.query('SELECT code FROM subscribers WHERE code = $1', [code]);
                        if (result.rows.length > 0) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'الرمز موجود مسبقًا' }));
                        } else {
                            await db.query('INSERT INTO subscribers (code) VALUES ($1)', [code]);
                            ws.send(JSON.stringify({ type: 'manualCodeAdded', data: code }));
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'الرمز يجب أن يكون 6 حروف/أرقام (A-Z, 0-9) أو 7 حروف/أرقام يبدأ بـ X' }));
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
                        try {
                            const availableCodes = await db.query(
                                'SELECT COUNT(*) FROM subscribers WHERE is_admin = FALSE'
                            );
                            const availableCount = parseInt(availableCodes.rows[0].count);
                            if (count > availableCount) {
                                ws.send(JSON.stringify({ type: 'adminError', data: `عدد الرموز المطلوبة للحذف (${count}) أكبر من المتاح (${availableCount})` }));
                                return;
                            }
                            const deleted = await db.query(
                                'DELETE FROM subscribers WHERE ctid IN (SELECT ctid FROM subscribers WHERE is_admin = FALSE ORDER BY created_at DESC LIMIT $1) RETURNING code',
                                [count]
                            );
                            ws.send(JSON.stringify({ type: 'codesDeleted', data: deleted.rows.map(row => row.code) }));
                        } catch (err) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'خطأ في حذف الرموز: ' + err.message }));
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

            case 'exportCodes':
                const adminCheckExport = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckExport.rows.length > 0) {
                    try {
                        const result = await db.query('SELECT code FROM subscribers');
                        const codes = result.rows.map(row => row.code);
                        if (codes.length === 0) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'لا توجد رموز للتصدير' }));
                            return;
                        }
                        const today = new Date().toISOString().slice(0, 10);
                        const wsExcel = XLSX.utils.json_to_sheet(codes.map(code => ({ [`Code_${today}`]: code })));
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, wsExcel, 'Codes');
                        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
                        ws.send(JSON.stringify({
                            type: 'codesExported',
                            data: {
                                filename: `codes_${today}.xlsx`,
                                content: excelBuffer.toString('base64')
                            }
                        }));
                    } catch (err) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'فشل نسخ الرموز، حاول مرة أخرى: ' + err.message }));
                    }
                }
                break;

            case 'importCodes':
                const adminCheckImport = await db.query('SELECT code FROM subscribers WHERE code = $1 AND is_admin = TRUE', [ws.sessionId]);
                if (adminCheckImport.rows.length > 0) {
                    try {
                        const buffer = Buffer.from(data.content, 'base64');
                        const workbook = XLSX.read(buffer, { type: 'buffer' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                        if (jsonData.length <= 1) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'الملف فاضي أو لا يحتوي على رموز' }));
                            return;
                        }
                        const codes = jsonData.slice(1).map(row => row[0]?.toString().toUpperCase()).filter(code => code);
                        const invalidCodes = codes.filter(code => !code || (code.length !== 6 && code.length !== 7) || (code.length === 6 && !/^[A-Z0-9]{6}$/.test(code)) || (code.length === 7 && !/^X[A-Z0-9]{6}$/.test(code)));
                        if (invalidCodes.length > 0) {
                            ws.send(JSON.stringify({ type: 'adminError', data: `يوجد رموز غير صالحة (مثل: ${invalidCodes.slice(0, 3).join(', ')})` }));
                            return;
                        }
                        const uniqueCodes = [...new Set(codes)];
                        if (uniqueCodes.length !== codes.length) {
                            ws.send(JSON.stringify({ type: 'adminError', data: 'الملف يحتوي على رموز مكررة' }));
                            return;
                        }
                        if (uniqueCodes.includes('IMWRA143')) {
                            uniqueCodes.splice(uniqueCodes.indexOf('IMWRA143'), 1);
                        }
                        const client = await db.connect();
                        try {
                            await client.query('BEGIN');
                            await client.query('DELETE FROM subscribers WHERE is_admin = FALSE');
                            for (const code of uniqueCodes) {
                                await client.query('INSERT INTO subscribers (code) VALUES ($1)', [code]);
                            }
                            await client.query('COMMIT');
                            ws.send(JSON.stringify({ type: 'codesImported', data: 'تم إدخال الرموز بنجاح' }));
                        } catch (err) {
                            await client.query('ROLLBACK');
                            ws.send(JSON.stringify({ type: 'adminError', data: 'فشل إدخال الرموز، تحقق من الملف وحاول مرة أخرى: ' + err.message }));
                        } finally {
                            client.release();
                        }
                    } catch (err) {
                        ws.send(JSON.stringify({ type: 'adminError', data: 'الملف غير صالح: ' + err.message }));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        const client = clients.get(clientId);
        if (client) {
            handleClientDisconnect(client);
        }
    });
});

server.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    await initDatabase();
    startPingPong();
    cleanupSessions();
});