const express = require('express');
const onFinished = require('on-finished');
const bodyParser = require('body-parser');
const uuid = require('uuid');
const axios = require('axios');
const port = 3000;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const SESSION_KEY = 'Authorization';

class Session {
    #sessions = {}

    constructor() {
        try {
            this.#sessions = JSON.parse(require('fs').readFileSync('./sessions.json', 'utf8').trim());
        } catch(e) {
            this.#sessions = {};
        }
    }

    #storeSessions() {
        require('fs').writeFileSync('./sessions.json', JSON.stringify(this.#sessions), 'utf-8');
    }

    set(key, value) {
        this.#sessions[key] = value || {};
        this.#storeSessions();
    }

    get(key) {
        return this.#sessions[key];
    }

    init() {
        const sessionId = uuid.v4();
        this.set(sessionId);
        return sessionId;
    }

    destroy(sessionId) {
        delete this.#sessions[sessionId];
        this.#storeSessions();
    }
}

const sessions = new Session();

app.use((req, res, next) => {
    let sessionId = req.get(SESSION_KEY);

    if (!sessionId) {
        sessionId = sessions.init();
        res.set(SESSION_KEY, sessionId);
    }

    req.session = sessions.get(sessionId) || {};
    req.sessionId = sessionId;

    onFinished(req, () => {
        sessions.set(sessionId, req.session);
    });

    next();
});

app.get('/', (req, res) => {
    if (req.session.username) {
        res.send(`<h1>Welcome ${req.session.username}</h1><a href="/logout">Logout</a>`);
    } else {
        res.send('<a href="/login">Login with Auth0</a>');
    }
});

app.get('/login', (req, res) => {
    res.redirect(`https://dev-33sah3q16ckz1ify.us.auth0.com/authorize?response_type=code&client_id=05guwmgaLBEsF0mOZA5mBomo2XDXTzPc&redirect_uri=http://localhost:3000/callback&scope=openid%20profile%20email&state=${uuid.v4()}`);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    try {
        const tokenResponse = await axios.post('https://dev-33sah3q16ckz1ify.us.auth0.com/oauth/token', {
            grant_type: 'authorization_code',
            client_id: '05guwmgaLBEsF0mOZA5mBomo2XDXTzPc',
            client_secret: 'mC3PNd-ot3AGHRdS4NASW6C-disuFESiRAOvmE4uU_w0MRtxnBaq-bUHuvfiCn07',
            code: code,
            redirect_uri: 'http://localhost:3000/callback'
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token } = tokenResponse.data;
        req.session.access_token = access_token;
        req.session.username = "Extracted Username";
        res.redirect('/');
    } catch (error) {
        console.error('Error during token exchange:', error);
        res.redirect('/?error=access_denied');
    }
});

app.get('/logout', (req, res) => {
    sessions.destroy(req.sessionId);
    res.redirect('/');
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
