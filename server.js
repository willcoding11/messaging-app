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
      avatar: null,
      theme: 'green',
      createdAt: Date.now()
    };
    saveData();

    // Log them in
    currentUser = trimmedName;
    onlineUsers.set(lowerName, socket.id);

    console.log(`User registered: ${trimmedName}`);
    callback({
      success: true,
      name: trimmedName,
      avatar: null,
      theme: 'green'
    });

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
    callback({
      success: true,
      name: user.name,
      avatar: user.avatar || null,
      theme: user.theme || 'green'
    });

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

    // Get contact details with online status and avatar
    const contactDetails = (user.contacts || []).map(contactName => {
      const contactLower = contactName.toLowerCase();
      const contactUser = data.users[contactLower];
      return {
        name: contactName,
        online: onlineUsers.has(contactLower),
        avatar: contactUser?.avatar || null
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

  // Update user profile (avatar, theme, password)
  socket.on('updateProfile', ({ avatar, theme, currentPassword, newPassword }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    const lowerName = currentUser.toLowerCase();
    const user = data.users[lowerName];
    if (!user) {
      callback({ success: false, error: 'User not found' });
      return;
    }

    // Update avatar if provided
    if (avatar !== undefined) {
      if (avatar && !isValidImageData(avatar)) {
        callback({ success: false, error: 'Invalid avatar format' });
        return;
      }
      if (avatar && avatar.length > 500 * 1024) {
        callback({ success: false, error: 'Avatar too large (max 500KB)' });
        return;
      }
      user.avatar = avatar;
    }

    // Update theme if provided
    if (theme !== undefined) {
      const validThemes = ['green', 'blue', 'purple', 'orange', 'dark'];
      if (!validThemes.includes(theme)) {
        callback({ success: false, error: 'Invalid theme' });
        return;
      }
      user.theme = theme;
    }

    // Update password if provided
    if (newPassword) {
      if (!currentPassword) {
        callback({ success: false, error: 'Current password required' });
        return;
      }

      // Verify current password
      let passwordValid = false;
      if (user.passwordHash && user.passwordSalt) {
        passwordValid = verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
      }

      if (!passwordValid) {
        callback({ success: false, error: 'Current password is incorrect' });
        return;
      }

      if (newPassword.length < 4) {
        callback({ success: false, error: 'New password must be at least 4 characters' });
        return;
      }

      const { hash, salt } = hashPassword(newPassword);
      user.passwordHash = hash;
      user.passwordSalt = salt;
    }

    saveData();
    callback({
      success: true,
      avatar: user.avatar,
      theme: user.theme
    });

    // Notify contacts about avatar update
    if (avatar !== undefined) {
      (user.contacts || []).forEach(contactName => {
        const contactSocket = onlineUsers.get(contactName.toLowerCase());
        if (contactSocket) {
          io.to(contactSocket).emit('contactUpdated', {
            name: currentUser,
            avatar: user.avatar
          });
        }
      });
    }
  });

  // Typing indicators
  socket.on('startTyping', ({ chatId, chatType, recipient }) => {
    if (!currentUser) return;

    if (chatType === 'contact') {
      const recipientSocket = onlineUsers.get(recipient.toLowerCase());
      if (recipientSocket) {
        io.to(recipientSocket).emit('userTyping', { chatId, user: currentUser, isTyping: true });
      }
    } else if (chatType === 'group') {
      const group = data.groups[recipient];
      if (group) {
        group.members.forEach(memberName => {
          if (memberName.toLowerCase() !== currentUser.toLowerCase()) {
            const memberSocket = onlineUsers.get(memberName.toLowerCase());
            if (memberSocket) {
              io.to(memberSocket).emit('userTyping', { chatId, user: currentUser, isTyping: true });
            }
          }
        });
      }
    }
  });

  socket.on('stopTyping', ({ chatId, chatType, recipient }) => {
    if (!currentUser) return;

    if (chatType === 'contact') {
      const recipientSocket = onlineUsers.get(recipient.toLowerCase());
      if (recipientSocket) {
        io.to(recipientSocket).emit('userTyping', { chatId, user: currentUser, isTyping: false });
      }
    } else if (chatType === 'group') {
      const group = data.groups[recipient];
      if (group) {
        group.members.forEach(memberName => {
          if (memberName.toLowerCase() !== currentUser.toLowerCase()) {
            const memberSocket = onlineUsers.get(memberName.toLowerCase());
            if (memberSocket) {
              io.to(memberSocket).emit('userTyping', { chatId, user: currentUser, isTyping: false });
            }
          }
        });
      }
    }
  });

  // Update group (manager only)
  socket.on('updateGroup', ({ groupId, name, description, avatar }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    const group = data.groups[groupId];
    if (!group) {
      callback({ success: false, error: 'Group not found' });
      return;
    }

    if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
      callback({ success: false, error: 'Only the group manager can update this group' });
      return;
    }

    if (name !== undefined) {
      group.name = name.trim().slice(0, 50);
    }

    if (description !== undefined) {
      group.description = description.trim().slice(0, 200);
    }

    if (avatar !== undefined) {
      if (avatar && !isValidImageData(avatar)) {
        callback({ success: false, error: 'Invalid avatar format' });
        return;
      }
      if (avatar && avatar.length > 500 * 1024) {
        callback({ success: false, error: 'Avatar too large (max 500KB)' });
        return;
      }
      group.avatar = avatar;
    }

    saveData();

    // Notify all members
    group.members.forEach(memberName => {
      const memberSocket = onlineUsers.get(memberName.toLowerCase());
      if (memberSocket) {
        io.to(memberSocket).emit('groupUpdated', group);
      }
    });

    callback({ success: true, group });
  });

  // Add member to group (manager only)
  socket.on('addGroupMember', ({ groupId, memberName }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    const group = data.groups[groupId];
    if (!group) {
      callback({ success: false, error: 'Group not found' });
      return;
    }

    if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
      callback({ success: false, error: 'Only the group manager can add members' });
      return;
    }

    const trimmedName = memberName.trim();
    const lowerName = trimmedName.toLowerCase();

    // Check if user exists
    const targetUser = data.users[lowerName];
    if (!targetUser) {
      callback({ success: false, error: 'User not found' });
      return;
    }

    // Check if already a member
    if (group.members.some(m => m.toLowerCase() === lowerName)) {
      callback({ success: false, error: 'Already a member' });
      return;
    }

    group.members.push(targetUser.name);
    saveData();

    // Notify all members including new one
    group.members.forEach(member => {
      const memberSocket = onlineUsers.get(member.toLowerCase());
      if (memberSocket) {
        io.to(memberSocket).emit('groupUpdated', group);
      }
    });

    // Send groupCreated to new member so they have the full group
    const newMemberSocket = onlineUsers.get(lowerName);
    if (newMemberSocket) {
      io.to(newMemberSocket).emit('groupCreated', group);
    }

    callback({ success: true, group });
  });

  // Remove member from group (manager only)
  socket.on('removeGroupMember', ({ groupId, memberName }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    const group = data.groups[groupId];
    if (!group) {
      callback({ success: false, error: 'Group not found' });
      return;
    }

    if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
      callback({ success: false, error: 'Only the group manager can remove members' });
      return;
    }

    const lowerName = memberName.toLowerCase();

    // Can't remove the creator
    if (lowerName === group.creator.toLowerCase()) {
      callback({ success: false, error: 'Cannot remove the group manager' });
      return;
    }

    // Notify member being removed
    const removedSocket = onlineUsers.get(lowerName);
    if (removedSocket) {
      io.to(removedSocket).emit('groupDeleted', groupId);
    }

    group.members = group.members.filter(m => m.toLowerCase() !== lowerName);
    saveData();

    // Notify remaining members
    group.members.forEach(member => {
      const memberSocket = onlineUsers.get(member.toLowerCase());
      if (memberSocket) {
        io.to(memberSocket).emit('groupUpdated', group);
      }
    });

    callback({ success: true, group });
  });

  // Leave group (any member)
  socket.on('leaveGroup', ({ groupId }, callback) => {
    if (!currentUser) {
      callback({ success: false, error: 'Not logged in' });
      return;
    }

    const group = data.groups[groupId];
    if (!group) {
      callback({ success: false, error: 'Group not found' });
      return;
    }

    const lowerName = currentUser.toLowerCase();

    // Creator can't leave (must delete group instead)
    if (lowerName === group.creator.toLowerCase()) {
      callback({ success: false, error: 'Group manager cannot leave. Delete the group instead.' });
      return;
    }

    group.members = group.members.filter(m => m.toLowerCase() !== lowerName);
    saveData();

    // Notify user they left
    socket.emit('groupDeleted', groupId);

    // Notify remaining members
    group.members.forEach(member => {
      const memberSocket = onlineUsers.get(member.toLowerCase());
      if (memberSocket) {
        io.to(memberSocket).emit('groupUpdated', group);
      }
    });

    callback({ success: true });
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
