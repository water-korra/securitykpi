const uuid = require('uuid');
const express = require('express');
const onFinished = require('on-finished');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const SESSION_KEY = 'Authorization';

const jwks = jwksClient({
    jwksUri: 'https://dev-33sah3q16ckz1ify.us.auth0.com/.well-known/jwks.json'
});

function getKey(header, callback){
    jwks.getSigningKey(header.kid, function(err, key) {
        var signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}

class Session {
    #sessions = {}

    constructor() {
        try {
            this.#sessions = JSON.parse(fs.readFileSync('./sessions.json', 'utf8').trim());
        } catch(e) {
            this.#sessions = {};
        }
    }

    #storeSessions() {
        fs.writeFileSync('./sessions.json', JSON.stringify(this.#sessions), 'utf-8');
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
        return res.json({
            username: req.session.username,
            logout: 'http://localhost:3000/logout'
        });
    }
    res.sendFile(path.join(__dirname+'/index.html'));
});

app.get('/logout', (req, res) => {
    sessions.destroy(req.sessionId);
    res.redirect('/');
});

async function authenticateUser(username, password) {
    const url = 'https://dev-33sah3q16ckz1ify.us.auth0.com/oauth/token';
    const data = new URLSearchParams({
        grant_type: 'password',
        username: username,
        password: password,
        audience: 'https://dev-33sah3q16ckz1ify.us.auth0.com/api/v2/',
        scope: 'openid profile email offline_access',
        client_id: '05guwmgaLBEsF0mOZA5mBomo2XDXTzPc',
        client_secret: 'mC3PNd-ot3AGHRdS4NASW6C-disuFESiRAOvmE4uU_w0MRtxnBaq-bUHuvfiCn07',
        connection: 'Username-Password-Authentication'
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    try {
        const response = await axios.post(url, data.toString(), { headers });
        return response.data;
    } catch (error) {
        console.error('Error during user authentication:', error);
        throw error;
    }
}

app.post('/api/login', async (req, res) => {
    const { login: username, password } = req.body;

    try {
        const authResult = await authenticateUser(username, password);
        if (authResult && authResult.access_token) {
            jwt.verify(authResult.access_token, getKey, { algorithms: ['RS256'] }, function(err, decoded) {
                if (err) {
                    console.log('Token verification error:', err);
                    return res.status(401).send({ message: "Invalid token" });
                }
                console.log('JWT Token:', authResult.access_token);
                req.session.username = username;
                req.session.jwtToken = authResult.access_token; // Save the token in the session
                res.sendFile(path.join(__dirname+'/index.html'));
            });
        } else {
            res.status(401).send({ message: "Invalid credentials" });
        }
    } catch (error) {
        res.status(500).send({ message: "An error occurred during login" });
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
