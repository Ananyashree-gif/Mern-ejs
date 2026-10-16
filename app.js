const express = require('express');
const { MongoClient, ObjectId, Binary } = require('mongodb');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();

const PORT = 3000;
const MONGODB_URI = 'mongodb://ananyaacharya686_db_user:Ananya2006@ac-t582r7p-shard-00-00.lvbb2mn.mongodb.net:27017,ac-t582r7p-shard-00-01.lvbb2mn.mongodb.net:27017,ac-t582r7p-shard-00-02.lvbb2mn.mongodb.net:27017/?ssl=true&replicaSet=atlas-mb05j3-shard-0&authSource=admin';
const SESSION_SECRET = '3e5fde2107dc4581bd8343ee5af692291e908987719c7c14f77ed5213065d420';

const client = new MongoClient(MONGODB_URI);
let users;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 2 * 60 * 60 * 1000
        }
    })
);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png'];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG and PNG images are allowed.'));
        }
    }
});

// Helpers

// Checks that the file content matches the declared image type
function hasValidImageSignature(buffer, mimetype) {
    if (mimetype === 'image/png') {
        const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        return buffer.length > 8 && buffer.subarray(0, 8).equals(signature);
    }

    if (mimetype === 'image/jpeg') {
        return (
            buffer.length > 3 &&
            buffer[0] === 0xff &&
            buffer[1] === 0xd8 &&
            buffer[2] === 0xff
        );
    }

    return false;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidContact(contact) {
    return /^\+?[0-9][0-9\s-]{5,18}[0-9]$/.test(contact);
}

function renderRegister(res, status, error, values) {
    return res.status(status).render('register', {
        error: error || null,
        values: values || { fullname: '', email: '', contact: '' }
    });
}

function renderLogin(res, status, error, email) {
    return res.status(status).render('login', {
        error: error || null,
        values: { email: email || '' }
    });
}

function getInitials(fullname) {
    const parts = fullname.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
}

// A new session ID after login prevents session fixation
function startSession(req, res, next, userId) {
    req.session.regenerate((err) => {
        if (err) {
            return next(err);
        }

        req.session.userId = userId;

        req.session.save((saveError) => {
            if (saveError) {
                return next(saveError);
            }

            res.redirect('/home');
        });
    });
}

// Middleware

function isLoggedIn(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    // Stops the Back button from showing protected pages after logout
    res.set('Cache-Control', 'no-store');
    next();
}

function redirectIfLoggedIn(req, res, next) {
    if (req.session.userId) {
        return res.redirect('/home');
    }

    next();
}

// Routes

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/register', redirectIfLoggedIn, (req, res) => {
    renderRegister(res, 200, null, null);
});

app.post('/register', redirectIfLoggedIn, (req, res, next) => {
    // The field name must match the file input name in register.ejs
    upload.single('profilePicture')(req, res, async (uploadError) => {
        const body = req.body || {};

        const fullname = (body.fullname || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const contact = (body.contact || '').trim();
        const password = body.password || '';

        // The password is never sent back to the form
        const values = { fullname, email, contact };

        if (uploadError) {
            const message =
                uploadError.code === 'LIMIT_FILE_SIZE'
                    ? 'The profile picture must be smaller than 2 MB.'
                    : uploadError.message;

            return renderRegister(res, 400, message, values);
        }

        try {
            if (!fullname || !email || !contact || !password) {
                return renderRegister(res, 400, 'Please fill in all required fields.', values);
            }

            if (fullname.length < 2 || fullname.length > 80) {
                return renderRegister(res, 400, 'Full name must be between 2 and 80 characters.', values);
            }

            if (!isValidEmail(email)) {
                return renderRegister(res, 400, 'Please enter a valid email address.', values);
            }

            if (!isValidContact(contact)) {
                return renderRegister(res, 400, 'Please enter a valid contact number (7 to 15 digits).', values);
            }

            if (password.length < 8) {
                return renderRegister(res, 400, 'Password must be at least 8 characters long.', values);
            }

            // bcrypt ignores everything after 72 bytes
            if (Buffer.byteLength(password, 'utf8') > 72) {
                return renderRegister(res, 400, 'Password must be 72 characters or fewer.', values);
            }

            if (req.file && !hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
                return renderRegister(res, 400, 'The uploaded file is not a valid JPEG or PNG image.', values);
            }

            const existing = await users.findOne({ email });

            if (existing) {
                return renderRegister(res, 409, 'Email already exists. Please log in.', values);
            }

            const hashedPwd = await bcrypt.hash(password, 12);

            const result = await users.insertOne({
                fullname,
                email,
                contact,
                password: hashedPwd,
                profilePicture: req.file
                    ? {
                        data: new Binary(req.file.buffer),
                        contentType: req.file.mimetype
                    }
                    : null,
                createdAt: new Date()
            });

            startSession(req, res, next, result.insertedId.toString());
        } catch (error) {
            // 11000 is the duplicate key error from the unique email index
            if (error.code === 11000) {
                return renderRegister(res, 409, 'Email already exists. Please log in.', values);
            }

            next(error);
        }
    });
});

app.get('/login', redirectIfLoggedIn, (req, res) => {
    renderLogin(res, 200, null, '');
});

app.post('/login', redirectIfLoggedIn, async (req, res, next) => {
    try {
        const body = req.body || {};
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password || '';

        if (!email || !password) {
            return renderLogin(res, 400, 'Please enter your email and password.', email);
        }

        const user = await users.findOne({ email });

        // One message for both an unknown email and a wrong password
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return renderLogin(res, 401, 'Invalid email or password.', email);
        }

        startSession(req, res, next, user._id.toString());
    } catch (error) {
        next(error);
    }
});

app.get('/home', isLoggedIn, async (req, res, next) => {
    try {
        const userId = req.session.userId;

        if (!ObjectId.isValid(userId)) {
            return req.session.destroy(() => {
                res.redirect('/login');
            });
        }

        // The password hash is not selected
        const user = await users.findOne(
            { _id: new ObjectId(userId) },
            {
                projection: {
                    fullname: 1,
                    email: 1,
                    contact: 1,
                    createdAt: 1,
                    profilePicture: 1
                }
            }
        );

        if (!user) {
            return req.session.destroy(() => {
                res.redirect('/login');
            });
        }

        const registeredOn = user.createdAt
            ? new Date(user.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            })
            : 'Not available';

        res.render('home', {
            fullname: user.fullname,
            email: user.email,
            contact: user.contact || 'Not provided',
            registeredOn,
            initials: getInitials(user.fullname),
            hasProfilePicture: Boolean(user.profilePicture)
        });
    } catch (error) {
        next(error);
    }
});

app.get('/profile-picture', isLoggedIn, async (req, res, next) => {
    try {
        const userId = req.session.userId;

        if (!ObjectId.isValid(userId)) {
            return res.sendStatus(404);
        }

        const user = await users.findOne(
            { _id: new ObjectId(userId) },
            { projection: { profilePicture: 1 } }
        );

        if (!user || !user.profilePicture) {
            return res.sendStatus(404);
        }

        res.set('X-Content-Type-Options', 'nosniff');
        res.type(user.profilePicture.contentType);
        res.send(Buffer.from(user.profilePicture.data.buffer));
    } catch (error) {
        next(error);
    }
});

app.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            return next(err);
        }

        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

app.use((req, res) => {
    res.status(404).send('Page not found.');
});

app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).send('Something went wrong. Please try again later.');
});

async function startServer() {
    try {
        await client.connect();

        users = client.db('auth-demo').collection('users');
        await users.createIndex({ email: 1 }, { unique: true });

        console.log('Connected to MongoDB Atlas');

        app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Server startup failed:', error.message);
        process.exit(1);
    }
}

startServer();

module.exports = app;