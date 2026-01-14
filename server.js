import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging-app';

// Log connection string (hide password for security)
const sanitizedUri = MONGODB_URI.replace(/:([^@]+)@/, ':****@');
console.log('Attempting to connect to MongoDB:', sanitizedUri);

let isDbConnected = false;

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB');
    isDbConnected = true;
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.error('Full error:', err);
  });

mongoose.connection.on('error', err => {
  console.error('MongoDB error:', err.message);
  isDbConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  isDbConnected = false;
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
  isDbConnected = true;
});

// Mongoose Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameLower: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  contacts: [String],
  pendingInvites: [{
    from: String,
    timestamp: Number
  }],
  sentInvites: [String],
  avatar: String,
  theme: { type: String, default: 'green' },
  createdAt: { type: Number, default: Date.now }
});

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  creator: { type: String, required: true },
  members: [String],
  description: String,
  avatar: String
});

const messageSchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  text: String,
  image: String,
  sender: String,
  time: String,
  timestamp: { type: Number, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Group = mongoose.model('Group', groupSchema);
const Message = mongoose.model('Message', messageSchema);

const app = express();
const server = createServer(app);

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.ALLOWED_ORIGIN || 'http://localhost:3001']
  : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Serve static files from dist folder
app.use(express.static(join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Password hashing
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = randomBytes(16).toString('hex');
  }
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

// Validate image data (base64 or URL)
function isValidImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') return false;

  // Check for base64 data URLs
  const validPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,',
    'data:image/gif;base64,',
    'data:image/webp;base64,',
    'data:image/svg+xml;base64,',
    'data:image/bmp;base64,'
  ];
  if (validPrefixes.some(prefix => imageData.startsWith(prefix))) {
    return true;
  }

  // Check for valid image/GIF URLs (from trusted sources like Tenor, Giphy)
  try {
    const url = new URL(imageData);
    if (url.protocol !== 'https:') return false;
    const trustedDomains = ['tenor.com', 'media.tenor.com', 'giphy.com', 'media.giphy.com', 'i.giphy.com'];
    const hostname = url.hostname.toLowerCase();
    return trustedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

// Runtime state (online users)
const onlineUsers = new Map();

// Helper to create consistent chat IDs
function getChatId(user1, user2) {
  const sorted = [user1.toLowerCase(), user2.toLowerCase()].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  let currentUser = null;

  // Register new user
  socket.on('register', async ({ name, password }, callback) => {
    try {
      // Check database connection
      if (mongoose.connection.readyState !== 1) {
        console.error('Register failed: Database not connected. State:', mongoose.connection.readyState);
        callback({ success: false, error: 'Database not connected. Please try again.' });
        return;
      }

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

      const existingUser = await User.findOne({ nameLower: lowerName });
      if (existingUser) {
        callback({ success: false, error: 'Name is already taken' });
        return;
      }

      const { hash, salt } = hashPassword(password);
      const user = new User({
        name: trimmedName,
        nameLower: lowerName,
        passwordHash: hash,
        passwordSalt: salt,
        contacts: [],
        pendingInvites: [],
        sentInvites: [],
        avatar: null,
        theme: 'green'
      });
      await user.save();

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
    } catch (err) {
      console.error('Register error:', err.message);
      console.error('Full register error:', err);
      callback({ success: false, error: 'Registration failed: ' + err.message });
    }
  });

  // Login
  socket.on('login', async ({ name, password }, callback) => {
    try {
      // Check database connection
      if (mongoose.connection.readyState !== 1) {
        console.error('Login failed: Database not connected. State:', mongoose.connection.readyState);
        callback({ success: false, error: 'Database not connected. Please try again.' });
        return;
      }

      const trimmedName = name.trim();
      const lowerName = trimmedName.toLowerCase();

      if (!trimmedName || !password) {
        callback({ success: false, error: 'Name and password required' });
        return;
      }

      const user = await User.findOne({ nameLower: lowerName });
      if (!user) {
        callback({ success: false, error: 'User not found' });
        return;
      }

      if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
        callback({ success: false, error: 'Incorrect password' });
        return;
      }

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
    } catch (err) {
      console.error('Login error:', err.message);
      console.error('Full login error:', err);
      callback({ success: false, error: 'Login failed: ' + err.message });
    }
  });

  // Get user data
  socket.on('getUserData', async (_, callback) => {
    try {
      if (!currentUser) {
        callback({ contacts: [], groups: [], messages: {}, pendingInvites: [] });
        return;
      }

      const lowerName = currentUser.toLowerCase();
      const user = await User.findOne({ nameLower: lowerName });
      if (!user) {
        callback({ contacts: [], groups: [], messages: {}, pendingInvites: [] });
        return;
      }

      // Get contact details
      const contactDetails = [];
      for (const contactName of user.contacts || []) {
        const contactUser = await User.findOne({ nameLower: contactName.toLowerCase() });
        contactDetails.push({
          name: contactName,
          online: onlineUsers.has(contactName.toLowerCase()),
          avatar: contactUser?.avatar || null
        });
      }

      // Get user's groups
      const userGroups = await Group.find({
        members: { $elemMatch: { $regex: new RegExp(`^${lowerName}$`, 'i') } }
      });

      const groupsData = userGroups.map(g => ({
        id: g.groupId,
        name: g.name,
        creator: g.creator,
        members: g.members,
        description: g.description,
        avatar: g.avatar
      }));

      // Get messages
      const userMessages = {};

      // Contact messages
      for (const contactName of user.contacts || []) {
        const chatId = getChatId(currentUser, contactName);
        const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        if (msgs.length > 0) {
          userMessages[chatId] = msgs.map(msg => ({
            text: msg.text,
            image: msg.image,
            sender: msg.sender,
            time: msg.time,
            sent: msg.sender?.toLowerCase() === currentUser.toLowerCase()
          }));
        }
      }

      // Group messages
      for (const group of userGroups) {
        const chatId = `group_${group.groupId}`;
        const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        if (msgs.length > 0) {
          userMessages[chatId] = msgs.map(msg => ({
            text: msg.text,
            image: msg.image,
            sender: msg.sender,
            time: msg.time,
            sent: msg.sender?.toLowerCase() === currentUser.toLowerCase()
          }));
        }
      }

      // Get pending invites
      const pendingInvites = [];
      for (const invite of user.pendingInvites || []) {
        const inviterUser = await User.findOne({ nameLower: invite.from.toLowerCase() });
        pendingInvites.push({
          from: invite.from,
          timestamp: invite.timestamp,
          avatar: inviterUser?.avatar || null
        });
      }

      callback({
        contacts: contactDetails,
        groups: groupsData,
        messages: userMessages,
        pendingInvites
      });
    } catch (err) {
      console.error('getUserData error:', err);
      callback({ contacts: [], groups: [], messages: {}, pendingInvites: [] });
    }
  });

  // Add contact (send invite)
  socket.on('addContact', async ({ contactName }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const trimmedName = contactName.trim();
      const lowerName = trimmedName.toLowerCase();
      const currentLower = currentUser.toLowerCase();

      if (lowerName === currentLower) {
        callback({ success: false, error: "You can't add yourself" });
        return;
      }

      const targetUser = await User.findOne({ nameLower: lowerName });
      if (!targetUser) {
        callback({ success: false, error: 'User not found' });
        return;
      }

      const currentUserData = await User.findOne({ nameLower: currentLower });

      // Already a contact?
      if (currentUserData.contacts.some(c => c.toLowerCase() === lowerName)) {
        callback({ success: false, error: 'Already in contacts' });
        return;
      }

      // Invite already sent?
      if (currentUserData.sentInvites.some(i => i.toLowerCase() === lowerName)) {
        callback({ success: false, error: 'Invite already sent' });
        return;
      }

      // Check if they sent us an invite (auto-accept)
      const existingInvite = currentUserData.pendingInvites.find(i => i.from.toLowerCase() === lowerName);
      if (existingInvite) {
        currentUserData.contacts.push(targetUser.name);
        targetUser.contacts.push(currentUser);
        currentUserData.pendingInvites = currentUserData.pendingInvites.filter(i => i.from.toLowerCase() !== lowerName);
        targetUser.sentInvites = targetUser.sentInvites.filter(i => i.toLowerCase() !== currentLower);

        await currentUserData.save();
        await targetUser.save();

        callback({
          success: true,
          contact: {
            name: targetUser.name,
            online: onlineUsers.has(lowerName),
            avatar: targetUser.avatar || null
          },
          message: 'Contact added!'
        });

        const targetSocket = onlineUsers.get(lowerName);
        if (targetSocket) {
          io.to(targetSocket).emit('contactAdded', {
            name: currentUser,
            online: true,
            avatar: currentUserData.avatar || null
          });
          io.to(targetSocket).emit('inviteAccepted', { by: currentUser });
        }
        return;
      }

      // Create invite
      targetUser.pendingInvites.push({
        from: currentUser,
        timestamp: Date.now()
      });
      currentUserData.sentInvites.push(targetUser.name);

      await currentUserData.save();
      await targetUser.save();

      const targetSocket = onlineUsers.get(lowerName);
      if (targetSocket) {
        io.to(targetSocket).emit('newInvite', {
          from: currentUser,
          timestamp: Date.now(),
          avatar: currentUserData.avatar || null
        });
      }

      callback({ success: true, message: 'Invite sent!' });
    } catch (err) {
      console.error('addContact error:', err);
      callback({ success: false, error: 'Failed to add contact' });
    }
  });

  // Accept invite
  socket.on('acceptInvite', async ({ fromName }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const currentLower = currentUser.toLowerCase();
      const fromLower = fromName.toLowerCase();

      const currentUserData = await User.findOne({ nameLower: currentLower });
      const fromUser = await User.findOne({ nameLower: fromLower });

      if (!fromUser) {
        callback({ success: false, error: 'User not found' });
        return;
      }

      const invite = currentUserData.pendingInvites.find(i => i.from.toLowerCase() === fromLower);
      if (!invite) {
        callback({ success: false, error: 'Invite not found' });
        return;
      }

      currentUserData.contacts.push(fromUser.name);
      fromUser.contacts.push(currentUser);
      currentUserData.pendingInvites = currentUserData.pendingInvites.filter(i => i.from.toLowerCase() !== fromLower);
      fromUser.sentInvites = fromUser.sentInvites.filter(i => i.toLowerCase() !== currentLower);

      await currentUserData.save();
      await fromUser.save();

      const fromSocket = onlineUsers.get(fromLower);
      if (fromSocket) {
        io.to(fromSocket).emit('contactAdded', {
          name: currentUser,
          online: true,
          avatar: currentUserData.avatar || null
        });
        io.to(fromSocket).emit('inviteAccepted', { by: currentUser });
      }

      callback({
        success: true,
        contact: {
          name: fromUser.name,
          online: onlineUsers.has(fromLower),
          avatar: fromUser.avatar || null
        }
      });
    } catch (err) {
      console.error('acceptInvite error:', err);
      callback({ success: false, error: 'Failed to accept invite' });
    }
  });

  // Decline invite
  socket.on('declineInvite', async ({ fromName }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const currentLower = currentUser.toLowerCase();
      const fromLower = fromName.toLowerCase();

      const currentUserData = await User.findOne({ nameLower: currentLower });
      const fromUser = await User.findOne({ nameLower: fromLower });

      currentUserData.pendingInvites = currentUserData.pendingInvites.filter(i => i.from.toLowerCase() !== fromLower);
      if (fromUser) {
        fromUser.sentInvites = fromUser.sentInvites.filter(i => i.toLowerCase() !== currentLower);
        await fromUser.save();
      }

      await currentUserData.save();

      callback({ success: true });
    } catch (err) {
      console.error('declineInvite error:', err);
      callback({ success: false, error: 'Failed to decline invite' });
    }
  });

  // Remove contact
  socket.on('removeContact', async ({ contactName }) => {
    try {
      if (!currentUser) return;

      const currentLower = currentUser.toLowerCase();
      await User.updateOne(
        { nameLower: currentLower },
        { $pull: { contacts: { $regex: new RegExp(`^${contactName}$`, 'i') } } }
      );
    } catch (err) {
      console.error('removeContact error:', err);
    }
  });

  // Create group
  socket.on('createGroup', async ({ name, members }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const allMembers = [currentUser, ...members.filter(m => m.toLowerCase() !== currentUser.toLowerCase())];
      const groupId = Date.now().toString();

      const group = new Group({
        groupId,
        name: name.trim(),
        creator: currentUser,
        members: allMembers
      });
      await group.save();

      const groupData = {
        id: groupId,
        name: group.name,
        creator: group.creator,
        members: group.members
      };

      allMembers.forEach(memberName => {
        const memberSocket = onlineUsers.get(memberName.toLowerCase());
        if (memberSocket) {
          io.to(memberSocket).emit('groupCreated', groupData);
        }
      });

      callback({ success: true, group: groupData });
    } catch (err) {
      console.error('createGroup error:', err);
      callback({ success: false, error: 'Failed to create group' });
    }
  });

  // Delete group
  socket.on('deleteGroup', async ({ groupId }) => {
    try {
      if (!currentUser) return;

      const group = await Group.findOne({ groupId });
      if (!group) return;

      if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
        socket.emit('error', { message: 'Only the group creator can delete this group' });
        return;
      }

      group.members.forEach(memberName => {
        const memberSocket = onlineUsers.get(memberName.toLowerCase());
        if (memberSocket) {
          io.to(memberSocket).emit('groupDeleted', groupId);
        }
      });

      await Group.deleteOne({ groupId });
      await Message.deleteMany({ chatId: `group_${groupId}` });
    } catch (err) {
      console.error('deleteGroup error:', err);
    }
  });

  // Send message
  socket.on('sendMessage', async ({ chatId, chatType, recipient, message }) => {
    try {
      if (!currentUser) return;

      if (message.image) {
        if (!isValidImageData(message.image)) {
          socket.emit('error', { message: 'Invalid image format' });
          return;
        }
        // Size check only for base64 images, not URLs
        if (message.image.startsWith('data:') && message.image.length > 7 * 1024 * 1024) {
          socket.emit('error', { message: 'Image too large' });
          return;
        }
      }

      const sanitizedText = message.text ? String(message.text).slice(0, 5000) : '';

      const msg = new Message({
        chatId,
        text: sanitizedText,
        image: message.image || null,
        sender: currentUser,
        time: message.time
      });
      await msg.save();

      const fullMessage = {
        text: sanitizedText,
        image: message.image || null,
        sent: true,
        time: message.time,
        sender: currentUser
      };

      if (chatType === 'contact') {
        const recipientLower = recipient.toLowerCase();
        socket.emit('newMessage', { chatId, message: fullMessage });

        const recipientUser = await User.findOne({ nameLower: recipientLower });
        if (recipientUser) {
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
        const group = await Group.findOne({ groupId: recipient });
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
    } catch (err) {
      console.error('sendMessage error:', err);
    }
  });

  // Update profile
  socket.on('updateProfile', async ({ avatar, theme, currentPassword, newPassword, newUsername }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const lowerName = currentUser.toLowerCase();
      const user = await User.findOne({ nameLower: lowerName });
      if (!user) {
        callback({ success: false, error: 'User not found' });
        return;
      }

      let nameChanged = false;
      let newName = currentUser;

      // Update username
      if (newUsername && newUsername.trim() !== currentUser) {
        const trimmedNewName = newUsername.trim();
        const newLowerName = trimmedNewName.toLowerCase();

        if (trimmedNewName.length < 2) {
          callback({ success: false, error: 'Username must be at least 2 characters' });
          return;
        }

        if (newLowerName !== lowerName) {
          const existingUser = await User.findOne({ nameLower: newLowerName });
          if (existingUser) {
            callback({ success: false, error: 'Username is already taken' });
            return;
          }
        }

        user.name = trimmedNewName;
        user.nameLower = newLowerName;

        // Update in all contacts' lists
        await User.updateMany(
          { contacts: { $regex: new RegExp(`^${currentUser}$`, 'i') } },
          { $set: { 'contacts.$[elem]': trimmedNewName } },
          { arrayFilters: [{ elem: { $regex: new RegExp(`^${currentUser}$`, 'i') } }] }
        );

        // Update in all groups
        await Group.updateMany(
          { creator: { $regex: new RegExp(`^${currentUser}$`, 'i') } },
          { $set: { creator: trimmedNewName } }
        );
        await Group.updateMany(
          { members: { $regex: new RegExp(`^${currentUser}$`, 'i') } },
          { $set: { 'members.$[elem]': trimmedNewName } },
          { arrayFilters: [{ elem: { $regex: new RegExp(`^${currentUser}$`, 'i') } }] }
        );

        // Update sender in messages
        await Message.updateMany(
          { sender: { $regex: new RegExp(`^${currentUser}$`, 'i') } },
          { $set: { sender: trimmedNewName } }
        );

        nameChanged = true;
        newName = trimmedNewName;
        currentUser = trimmedNewName;

        onlineUsers.delete(lowerName);
        onlineUsers.set(newLowerName, socket.id);
      }

      // Update avatar
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

      // Update theme
      if (theme !== undefined) {
        const validThemes = ['green', 'blue', 'purple', 'orange', 'dark'];
        if (!validThemes.includes(theme)) {
          callback({ success: false, error: 'Invalid theme' });
          return;
        }
        user.theme = theme;
      }

      // Update password
      if (newPassword) {
        if (!currentPassword) {
          callback({ success: false, error: 'Current password required' });
          return;
        }

        if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
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

      await user.save();

      callback({
        success: true,
        avatar: user.avatar,
        theme: user.theme,
        name: newName,
        nameChanged
      });

      // Notify contacts about avatar update
      if (avatar !== undefined) {
        for (const contactName of user.contacts || []) {
          const contactSocket = onlineUsers.get(contactName.toLowerCase());
          if (contactSocket) {
            io.to(contactSocket).emit('contactUpdated', {
              name: currentUser,
              avatar: user.avatar
            });
          }
        }
      }
    } catch (err) {
      console.error('updateProfile error:', err);
      callback({ success: false, error: 'Failed to update profile' });
    }
  });

  // Typing indicators
  socket.on('startTyping', async ({ chatId, chatType, recipient }) => {
    if (!currentUser) return;

    if (chatType === 'contact') {
      const recipientSocket = onlineUsers.get(recipient.toLowerCase());
      if (recipientSocket) {
        io.to(recipientSocket).emit('userTyping', { chatId, user: currentUser, isTyping: true });
      }
    } else if (chatType === 'group') {
      const group = await Group.findOne({ groupId: recipient });
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

  socket.on('stopTyping', async ({ chatId, chatType, recipient }) => {
    if (!currentUser) return;

    if (chatType === 'contact') {
      const recipientSocket = onlineUsers.get(recipient.toLowerCase());
      if (recipientSocket) {
        io.to(recipientSocket).emit('userTyping', { chatId, user: currentUser, isTyping: false });
      }
    } else if (chatType === 'group') {
      const group = await Group.findOne({ groupId: recipient });
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

  // Update group
  socket.on('updateGroup', async ({ groupId, name, description, avatar }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const group = await Group.findOne({ groupId });
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

      await group.save();

      const groupData = {
        id: group.groupId,
        name: group.name,
        creator: group.creator,
        members: group.members,
        description: group.description,
        avatar: group.avatar
      };

      group.members.forEach(memberName => {
        const memberSocket = onlineUsers.get(memberName.toLowerCase());
        if (memberSocket) {
          io.to(memberSocket).emit('groupUpdated', groupData);
        }
      });

      callback({ success: true, group: groupData });
    } catch (err) {
      console.error('updateGroup error:', err);
      callback({ success: false, error: 'Failed to update group' });
    }
  });

  // Add group member
  socket.on('addGroupMember', async ({ groupId, memberName }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const group = await Group.findOne({ groupId });
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

      const targetUser = await User.findOne({ nameLower: lowerName });
      if (!targetUser) {
        callback({ success: false, error: 'User not found' });
        return;
      }

      if (group.members.some(m => m.toLowerCase() === lowerName)) {
        callback({ success: false, error: 'Already a member' });
        return;
      }

      group.members.push(targetUser.name);
      await group.save();

      const groupData = {
        id: group.groupId,
        name: group.name,
        creator: group.creator,
        members: group.members,
        description: group.description,
        avatar: group.avatar
      };

      group.members.forEach(member => {
        const memberSocket = onlineUsers.get(member.toLowerCase());
        if (memberSocket) {
          io.to(memberSocket).emit('groupUpdated', groupData);
        }
      });

      const newMemberSocket = onlineUsers.get(lowerName);
      if (newMemberSocket) {
        io.to(newMemberSocket).emit('groupCreated', groupData);
      }

      callback({ success: true, group: groupData });
    } catch (err) {
      console.error('addGroupMember error:', err);
      callback({ success: false, error: 'Failed to add member' });
    }
  });

  // Remove group member
  socket.on('removeGroupMember', async ({ groupId, memberName }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const group = await Group.findOne({ groupId });
      if (!group) {
        callback({ success: false, error: 'Group not found' });
        return;
      }

      if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
        callback({ success: false, error: 'Only the group manager can remove members' });
        return;
      }

      const lowerName = memberName.toLowerCase();

      if (lowerName === group.creator.toLowerCase()) {
        callback({ success: false, error: 'Cannot remove the group manager' });
        return;
      }

      const removedSocket = onlineUsers.get(lowerName);
      if (removedSocket) {
        io.to(removedSocket).emit('groupDeleted', groupId);
      }

      group.members = group.members.filter(m => m.toLowerCase() !== lowerName);
      await group.save();

      const groupData = {
        id: group.groupId,
        name: group.name,
        creator: group.creator,
        members: group.members,
        description: group.description,
        avatar: group.avatar
      };

      group.members.forEach(member => {
        const memberSocket = onlineUsers.get(member.toLowerCase());
        if (memberSocket) {
          io.to(memberSocket).emit('groupUpdated', groupData);
        }
      });

      callback({ success: true, group: groupData });
    } catch (err) {
      console.error('removeGroupMember error:', err);
      callback({ success: false, error: 'Failed to remove member' });
    }
  });

  // Leave group
  socket.on('leaveGroup', async ({ groupId }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const group = await Group.findOne({ groupId });
      if (!group) {
        callback({ success: false, error: 'Group not found' });
        return;
      }

      const lowerName = currentUser.toLowerCase();

      if (lowerName === group.creator.toLowerCase()) {
        callback({ success: false, error: 'Group manager cannot leave. Delete the group instead.' });
        return;
      }

      group.members = group.members.filter(m => m.toLowerCase() !== lowerName);
      await group.save();

      socket.emit('groupDeleted', groupId);

      const groupData = {
        id: group.groupId,
        name: group.name,
        creator: group.creator,
        members: group.members,
        description: group.description,
        avatar: group.avatar
      };

      group.members.forEach(member => {
        const memberSocket = onlineUsers.get(member.toLowerCase());
        if (memberSocket) {
          io.to(memberSocket).emit('groupUpdated', groupData);
        }
      });

      callback({ success: true });
    } catch (err) {
      console.error('leaveGroup error:', err);
      callback({ success: false, error: 'Failed to leave group' });
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

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
