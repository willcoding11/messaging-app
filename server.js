import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
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

// Simple password hashing
function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
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

    // Create user
    data.users[lowerName] = {
      name: trimmedName,
      password: hashPassword(password),
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

    if (user.password !== hashPassword(password)) {
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

  // Delete group
  socket.on('deleteGroup', ({ groupId }) => {
    const group = data.groups[groupId];
    if (!group) return;

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

    // Add sender info to message
    const fullMessage = {
      ...message,
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
