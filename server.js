import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
// In production, restrict CORS to your actual domain
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.ALLOWED_ORIGIN || 'http://localhost:3001']
  : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Serve static files from dist folder (production build)
app.use(express.static(join(__dirname, 'dist')));

// Serve index.html for all routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const DATA_FILE = './data.json';

// Load or initialize data
function loadData() {
  if (existsSync(DATA_FILE)) {
    try {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { users: {}, messages: {}, groups: {} };
    }
  }
  return { users: {}, messages: {}, groups: {} };
}

function saveData() {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Password hashing with salt for security
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = randomBytes(16).toString('hex');
  }
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

// Verify password against stored hash and salt
function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

// Validate image data (must be a valid base64 image)
function isValidImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') return false;
  // Check for valid image data URI prefixes
  const validPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,',
    'data:image/gif;base64,',
    'data:image/webp;base64,',
    'data:image/svg+xml;base64,',
    'data:image/bmp;base64,'
  ];
  return validPrefixes.some(prefix => imageData.startsWith(prefix));
}

// Persistent data
let data = loadData();

// Runtime state (online users)
const onlineUsers = new Map(); // name -> socketId

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  let currentUser = null;

  // Register new user
  socket.on('register', ({ name, password }, callback) => {
    const trimmedName = name.trim();
    const lowerName = trimmedName.toLowerCase();

    if (!trimmedName || !password) {
      callback({ success: false, error: 'Name and password required' });
      return;
    }

    if (password.length < 4) {
      callback({ success: false, error: 'Password must be at least 4 characters' });
      return;
    }

    // Check if name is taken
    if (data.users[lowerName]) {
      callback({ success: false, error: 'Name is already taken' });
      return;
    }

    // Create user with salted password hash
    const { hash, salt } = hashPassword(password);
    data.users[lowerName] = {
      name: trimmedName,
      passwordHash: hash,
      passwordSalt: salt,
      contacts: [],
      createdAt: Date.now()
    };
    saveData();

    // Log them in
    currentUser = trimmedName;
    onlineUsers.set(lowerName, socket.id);

    console.log(`User registered: ${trimmedName}`);
    callback({ success: true, name: trimmedName });

    io.emit('userOnline', { name: trimmedName });
  });

  // Login existing user
  socket.on('login', ({ name, password }, callback) => {
    const trimmedName = name.trim();
    const lowerName = trimmedName.toLowerCase();

    if (!trimmedName || !password) {
      callback({ success: false, error: 'Name and password required' });
      return;
    }

    const user = data.users[lowerName];
    if (!user) {
      callback({ success: false, error: 'User not found' });
      return;
    }

    // Support both old (password) and new (passwordHash + passwordSalt) formats
    let passwordValid = false;
    if (user.passwordHash && user.passwordSalt) {
      // New secure format with salt
      passwordValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    } else if (user.password) {
      // Legacy format (unsalted) - migrate to new format on successful login
      const legacyHash = createHash('sha256').update(password).digest('hex');
      if (user.password === legacyHash) {
        passwordValid = true;
        // Migrate to new secure format
        const { hash, salt } = hashPassword(password);
        user.passwordHash = hash;
        user.passwordSalt = salt;
        delete user.password;
        saveData();
      }
    }

    if (!passwordValid) {
      callback({ success: false, error: 'Incorrect password' });
      return;
    }

    // Log them in
    currentUser = user.name;
    onlineUsers.set(lowerName, socket.id);

    console.log(`User logged in: ${user.name}`);
    callback({ success: true, name: user.name });

    io.emit('userOnline', { name: user.name });
  });

  // Get user data after login
  socket.on('getUserData', (_, callback) => {
    if (!currentUser) {
      callback({ contacts: [], groups: [], messages: {} });
      return;
    }

    const lowerName = currentUser.toLowerCase();
    const user = data.users[lowerName];
    if (!user) {
      callback({ contacts: [], groups: [], messages: {} });
      return;
    }

    // Get contact details with online status
    const contactDetails = (user.contacts || []).map(contactName => {
      const contactLower = contactName.toLowerCase();
      return {
        name: contactName,
        online: onlineUsers.has(contactLower)
      };
    });

    // Get user's groups
    const userGroups = [];
    Object.values(data.groups || {}).forEach(group => {
      if (group.members.some(m => m.toLowerCase() === lowerName)) {
        userGroups.push(group);
      }
    });

    // Get messages for user's chats
    const userMessages = {};

    // Contact messages
    (user.contacts || []).forEach(contactName => {
      const chatId = getChatId(currentUser, contactName);
      if (data.messages[chatId]) {
        userMessages[chatId] = data.messages[chatId];
      }
    });

    // Group messages
    userGroups.forEach(group => {
      const chatId = `group_${group.id}`;
      if (data.messages[chatId]) {
        userMessages[chatId] = data.messages[chatId];
      }
    });

    callback({
      contacts: contactDetails,
      groups: userGroups,
      messages: userMessages
    });
  });

  // Add contact by name
  socket.on('addContact', ({ contactName }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    const trimmedName = contactName.trim();
    const lowerName = trimmedName.toLowerCase();
    const currentLower = currentUser.toLowerCase();

    // Can't add yourself
    if (lowerName === currentLower) {
      callback({ success: false, error: "You can't add yourself" });
      return;
    }

    // Check if user exists
    const targetUser = data.users[lowerName];
    if (!targetUser) {
      callback({ success: false, error: 'User not found' });
      return;
    }

    // Check if already a contact
    const userContacts = data.users[currentLower].contacts || [];
    if (userContacts.some(c => c.toLowerCase() === lowerName)) {
      callback({ success: false, error: 'Already in contacts' });
      return;
    }

    // Add to contacts
    data.users[currentLower].contacts.push(targetUser.name);
    saveData();

    callback({
      success: true,
      contact: {
        name: targetUser.name,
        online: onlineUsers.has(lowerName)
      }
    });
  });

  // Remove contact
  socket.on('removeContact', ({ contactName }) => {
    if (!currentUser) return;

    const currentLower = currentUser.toLowerCase();
    const user = data.users[currentLower];
    if (!user) return;

    user.contacts = (user.contacts || []).filter(
      c => c.toLowerCase() !== contactName.toLowerCase()
    );
    saveData();
  });

  // Create group
  socket.on('createGroup', ({ name, members }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    // Add creator to members
    const allMembers = [currentUser, ...members.filter(m => m.toLowerCase() !== currentUser.toLowerCase())];

    const group = {
      id: Date.now().toString(),
      name: name.trim(),
      creator: currentUser,
      members: allMembers
    };

    data.groups[group.id] = group;
    saveData();

    // Notify all online members
    allMembers.forEach(memberName => {
      const memberSocket = onlineUsers.get(memberName.toLowerCase());
      if (memberSocket) {
        io.to(memberSocket).emit('groupCreated', group);
      }
    });

    callback({ success: true, group });
  });

  // Delete group (only creator can delete)
  socket.on('deleteGroup', ({ groupId }) => {
    if (!currentUser) return;

    const group = data.groups[groupId];
    if (!group) return;

    // Only allow the creator to delete the group
    if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
      socket.emit('error', { message: 'Only the group creator can delete this group' });
      return;
    }

    // Notify all online members
    group.members.forEach(memberName => {
      const memberSocket = onlineUsers.get(memberName.toLowerCase());
      if (memberSocket) {
        io.to(memberSocket).emit('groupDeleted', groupId);
      }
    });

    delete data.groups[groupId];
    delete data.messages[`group_${groupId}`];
    saveData();
  });

  // Send message
  socket.on('sendMessage', ({ chatId, chatType, recipient, message }) => {
    if (!currentUser) return;

    // Validate image if present
    if (message.image) {
      if (!isValidImageData(message.image)) {
        socket.emit('error', { message: 'Invalid image format' });
        return;
      }
      // Limit image size (5MB in base64 is roughly 6.67MB string)
      if (message.image.length > 7 * 1024 * 1024) {
        socket.emit('error', { message: 'Image too large' });
        return;
      }
    }

    // Sanitize text content (prevent any potential script injection)
    const sanitizedText = message.text ? String(message.text).slice(0, 5000) : '';

    // Add sender info to message
    const fullMessage = {
      text: sanitizedText,
      image: message.image || null,
      sent: message.sent,
      time: message.time,
      sender: currentUser
    };

    // Store message
    if (!data.messages[chatId]) {
      data.messages[chatId] = [];
    }
    data.messages[chatId].push(fullMessage);
    saveData();

    if (chatType === 'contact') {
      const recipientLower = recipient.toLowerCase();
      const recipientUser = data.users[recipientLower];

      // Send to sender
      socket.emit('newMessage', { chatId, message: fullMessage });

      if (recipientUser) {
        // Auto-add sender to recipient's contacts if not already there
        const senderLower = currentUser.toLowerCase();
        if (!recipientUser.contacts.some(c => c.toLowerCase() === senderLower)) {
          recipientUser.contacts.push(currentUser);
          saveData();

          // Notify recipient about new contact if online
          const recipientSocket = onlineUsers.get(recipientLower);
          if (recipientSocket) {
            io.to(recipientSocket).emit('contactAdded', {
              name: currentUser,
              online: true
            });
          }
        }

        // Send message to recipient if online
        const recipientSocket = onlineUsers.get(recipientLower);
        if (recipientSocket && recipientSocket !== socket.id) {
          const recipientChatId = getChatId(recipientUser.name, currentUser);
          io.to(recipientSocket).emit('newMessage', {
            chatId: recipientChatId,
            message: { ...fullMessage, sent: false }
          });
        }
      }
    } else if (chatType === 'group') {
      const group = data.groups[recipient];
      if (group) {
        group.members.forEach(memberName => {
          const memberSocket = onlineUsers.get(memberName.toLowerCase());
          if (memberSocket) {
            const isSender = memberName.toLowerCase() === currentUser.toLowerCase();
            io.to(memberSocket).emit('newMessage', {
              chatId,
              message: { ...fullMessage, sent: isSender }
            });
          }
        });
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentUser) {
      onlineUsers.delete(currentUser.toLowerCase());
      io.emit('userOffline', { name: currentUser });
      console.log(`User disconnected: ${currentUser}`);
    }
  });
});

// Helper to create consistent chat IDs between two users
function getChatId(user1, user2) {
  const sorted = [user1.toLowerCase(), user2.toLowerCase()].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
