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

const sanitizedUri = MONGODB_URI.replace(/:([^@]+)@/, ':****@');
console.log('Attempting to connect to MongoDB:', sanitizedUri);

let isDbConnected = false;

// ============ BUILT-IN SUPREME CREDENTIALS ============
const SUPREME_NAME = 'William';
const SUPREME_NAME_LOWER = 'william';
const SUPREME_PASSWORD = 'Isaacwill333';

// ============ Mongoose Schemas ============

const spaceSchema = new mongoose.Schema({
  spaceCode: { type: String, required: true, unique: true }, // 5-digit code
  name: { type: String, required: true },
  adminName: { type: String, required: true }, // admin username
  adminNameLower: { type: String, required: true },
  members: [String], // array of usernames (lowercase)
  banned: [String], // array of banned usernames (lowercase)
  mainGroupId: { type: String, required: true }, // the main group chat id
  createdAt: { type: Number, default: Date.now }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameLower: { type: String, required: true, unique: true },
  passwordHash: String, // only for admin accounts
  passwordSalt: String,
  role: { type: String, enum: ['user', 'admin', 'supreme'], default: 'user' },
  spaceCode: String, // which space they belong to
  avatar: String,
  theme: { type: String, default: 'green' },
  sessionToken: String,
  createdAt: { type: Number, default: Date.now }
});

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  creator: { type: String, required: true },
  members: [String],
  description: String,
  avatar: String,
  spaceCode: String, // which space this group belongs to
  isMainGroup: { type: Boolean, default: false }
});

const messageSchema = new mongoose.Schema({
  chatId: { type: String, required: true, index: true },
  text: String,
  image: String,
  game: mongoose.Schema.Types.Mixed,
  sender: String,
  time: String,
  timestamp: { type: Number, default: Date.now },
  seenBy: { type: [String], default: [] }
});

const User = mongoose.model('User', userSchema);
const Group = mongoose.model('Group', groupSchema);
const Message = mongoose.model('Message', messageSchema);
const Space = mongoose.model('Space', spaceSchema);

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Successfully connected to MongoDB');
    isDbConnected = true;

    // Ensure supreme account exists
    const supreme = await User.findOne({ nameLower: SUPREME_NAME_LOWER });
    if (!supreme) {
      const { hash, salt } = hashPassword(SUPREME_PASSWORD);
      const supremeUser = new User({
        name: SUPREME_NAME,
        nameLower: SUPREME_NAME_LOWER,
        passwordHash: hash,
        passwordSalt: salt,
        role: 'supreme',
        spaceCode: null,
        avatar: null,
        theme: 'dark'
      });
      await supremeUser.save();
      console.log('Supreme account created: William');
    } else if (supreme.role !== 'supreme') {
      supreme.role = 'supreme';
      const { hash, salt } = hashPassword(SUPREME_PASSWORD);
      supreme.passwordHash = hash;
      supreme.passwordSalt = salt;
      await supreme.save();
      console.log('Supreme account updated: William');
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
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

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

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

// Validate image data
function isValidImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') return false;

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

// Generate a random 5-digit space code
function generateSpaceCode() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Runtime state
const onlineUsers = new Map();
const voiceChannels = new Map();    // groupId → Set of lowercase usernames
const userVoiceChannel = new Map(); // lowercase username → groupId (reverse lookup)

// Helper to broadcast voice state to all group members
async function broadcastVoiceState(groupId) {
  const members = voiceChannels.get(groupId);
  const memberNames = members ? Array.from(members) : [];
  const group = await Group.findOne({ groupId });
  if (!group) return;
  group.members.forEach(memberName => {
    const memberSocket = onlineUsers.get(memberName.toLowerCase());
    if (memberSocket) {
      io.to(memberSocket).emit('voiceStateUpdate', { groupId, members: memberNames });
    }
  });
}

// Helper to remove user from voice channel
async function removeFromVoice(lowerName) {
  const groupId = userVoiceChannel.get(lowerName);
  if (!groupId) return;
  const channel = voiceChannels.get(groupId);
  if (channel) {
    channel.delete(lowerName);
    if (channel.size === 0) {
      voiceChannels.delete(groupId);
    }
  }
  userVoiceChannel.delete(lowerName);
  await broadcastVoiceState(groupId);
}

// Helper to create consistent chat IDs
function getChatId(user1, user2) {
  const sorted = [user1.toLowerCase(), user2.toLowerCase()].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  let currentUser = null;
  let currentUserRole = null;

  // ============ CHECK NAME - determines login flow ============
  socket.on('checkName', async ({ name }, callback) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        callback({ success: false, error: 'Database not connected. Please try again.' });
        return;
      }

      const trimmedName = name.trim();
      const lowerName = trimmedName.toLowerCase();

      if (!trimmedName) {
        callback({ success: false, error: 'Please enter a name' });
        return;
      }

      if (trimmedName.length > 20) {
        callback({ success: false, error: 'Name must be 20 characters or less' });
        return;
      }

      // Check if this is the supreme account
      if (lowerName === SUPREME_NAME_LOWER) {
        callback({ success: true, type: 'supreme' });
        return;
      }

      // Check if user exists
      const existingUser = await User.findOne({ nameLower: lowerName });
      if (existingUser && existingUser.role === 'admin') {
        callback({ success: true, type: 'admin' });
        return;
      }

      // Regular user or new user - needs space code
      callback({ success: true, type: 'user' });
    } catch (err) {
      console.error('checkName error:', err.message);
      callback({ success: false, error: 'Failed to check name' });
    }
  });

  // ============ LOGIN - Supreme account ============
  socket.on('supremeLogin', async ({ name, password }, callback) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        callback({ success: false, error: 'Database not connected.' });
        return;
      }

      const lowerName = name.trim().toLowerCase();
      if (lowerName !== SUPREME_NAME_LOWER) {
        callback({ success: false, error: 'Invalid account' });
        return;
      }

      const user = await User.findOne({ nameLower: SUPREME_NAME_LOWER });
      if (!user) {
        callback({ success: false, error: 'Account not found' });
        return;
      }

      if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
        callback({ success: false, error: 'Incorrect password' });
        return;
      }

      const sessionToken = randomBytes(32).toString('hex');
      user.sessionToken = sessionToken;
      await user.save();

      currentUser = user.name;
      currentUserRole = 'supreme';
      onlineUsers.set(lowerName, socket.id);

      console.log(`Supreme logged in: ${user.name}`);
      callback({
        success: true,
        name: user.name,
        role: 'supreme',
        avatar: user.avatar || null,
        theme: user.theme || 'dark',
        sessionToken
      });
    } catch (err) {
      console.error('supremeLogin error:', err.message);
      callback({ success: false, error: 'Login failed' });
    }
  });

  // ============ LOGIN - Admin account ============
  socket.on('adminLogin', async ({ name, password }, callback) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        callback({ success: false, error: 'Database not connected.' });
        return;
      }

      const trimmedName = name.trim();
      const lowerName = trimmedName.toLowerCase();

      const user = await User.findOne({ nameLower: lowerName });
      if (!user || user.role !== 'admin') {
        callback({ success: false, error: 'Admin account not found' });
        return;
      }

      if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
        callback({ success: false, error: 'Incorrect password' });
        return;
      }

      const sessionToken = randomBytes(32).toString('hex');
      user.sessionToken = sessionToken;
      await user.save();

      currentUser = user.name;
      currentUserRole = 'admin';
      onlineUsers.set(lowerName, socket.id);

      console.log(`Admin logged in: ${user.name}`);
      callback({
        success: true,
        name: user.name,
        role: 'admin',
        spaceCode: user.spaceCode,
        avatar: user.avatar || null,
        theme: user.theme || 'green',
        sessionToken
      });

      io.emit('userOnline', { name: user.name });
    } catch (err) {
      console.error('adminLogin error:', err.message);
      callback({ success: false, error: 'Login failed' });
    }
  });

  // ============ LOGIN - Regular user (name + space code) ============
  socket.on('userLogin', async ({ name, spaceCode }, callback) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        callback({ success: false, error: 'Database not connected.' });
        return;
      }

      const trimmedName = name.trim();
      const lowerName = trimmedName.toLowerCase();

      if (!trimmedName) {
        callback({ success: false, error: 'Please enter a name' });
        return;
      }

      if (trimmedName.length > 20) {
        callback({ success: false, error: 'Name must be 20 characters or less' });
        return;
      }

      if (trimmedName.length < 2) {
        callback({ success: false, error: 'Name must be at least 2 characters' });
        return;
      }

      // Check if name is reserved
      if (lowerName === SUPREME_NAME_LOWER) {
        callback({ success: false, error: 'This name is reserved' });
        return;
      }

      // Find the space
      const space = await Space.findOne({ spaceCode });
      if (!space) {
        callback({ success: false, error: 'Invalid space code' });
        return;
      }

      // Check if banned
      if (space.banned.includes(lowerName)) {
        callback({ success: false, error: 'You have been banned from this space' });
        return;
      }

      // Check if user exists
      let user = await User.findOne({ nameLower: lowerName });

      if (user) {
        // User exists - check they belong to this space
        if (user.role === 'admin' || user.role === 'supreme') {
          callback({ success: false, error: 'This name is reserved for an admin account' });
          return;
        }

        if (user.spaceCode && user.spaceCode !== spaceCode) {
          callback({ success: false, error: 'This name is already taken in another space' });
          return;
        }

        // Existing user in this space - log them in
        const sessionToken = randomBytes(32).toString('hex');
        user.sessionToken = sessionToken;
        user.spaceCode = spaceCode;
        await user.save();

        currentUser = user.name;
        currentUserRole = 'user';
        onlineUsers.set(lowerName, socket.id);

        // Make sure user is in space members
        if (!space.members.includes(lowerName)) {
          space.members.push(lowerName);
          await space.save();
        }

        // Make sure user is in main group
        const mainGroup = await Group.findOne({ groupId: space.mainGroupId });
        if (mainGroup && !mainGroup.members.some(m => m.toLowerCase() === lowerName)) {
          mainGroup.members.push(trimmedName);
          await mainGroup.save();

          // Notify other members
          const groupData = {
            id: mainGroup.groupId,
            name: mainGroup.name,
            creator: mainGroup.creator,
            members: mainGroup.members,
            description: mainGroup.description,
            avatar: mainGroup.avatar,
            isMainGroup: mainGroup.isMainGroup
          };
          mainGroup.members.forEach(member => {
            const memberSocket = onlineUsers.get(member.toLowerCase());
            if (memberSocket && memberSocket !== socket.id) {
              io.to(memberSocket).emit('groupUpdated', groupData);
            }
          });
        }

        console.log(`User logged in: ${user.name} (space: ${space.name})`);
        callback({
          success: true,
          name: user.name,
          role: 'user',
          spaceCode: spaceCode,
          spaceName: space.name,
          avatar: user.avatar || null,
          theme: user.theme || 'green',
          sessionToken
        });

        io.emit('userOnline', { name: user.name });
      } else {
        // New user - auto-create account
        const sessionToken = randomBytes(32).toString('hex');
        user = new User({
          name: trimmedName,
          nameLower: lowerName,
          role: 'user',
          spaceCode: spaceCode,
          avatar: null,
          theme: 'green',
          sessionToken
        });
        await user.save();

        // Add to space
        if (!space.members.includes(lowerName)) {
          space.members.push(lowerName);
          await space.save();
        }

        // Add to main group
        const mainGroup = await Group.findOne({ groupId: space.mainGroupId });
        if (mainGroup && !mainGroup.members.some(m => m.toLowerCase() === lowerName)) {
          mainGroup.members.push(trimmedName);
          await mainGroup.save();

          // Notify other members about new member
          const groupData = {
            id: mainGroup.groupId,
            name: mainGroup.name,
            creator: mainGroup.creator,
            members: mainGroup.members,
            description: mainGroup.description,
            avatar: mainGroup.avatar,
            isMainGroup: mainGroup.isMainGroup
          };
          mainGroup.members.forEach(member => {
            const memberSocket = onlineUsers.get(member.toLowerCase());
            if (memberSocket && memberSocket !== socket.id) {
              io.to(memberSocket).emit('groupUpdated', groupData);
            }
          });
        }

        currentUser = trimmedName;
        currentUserRole = 'user';
        onlineUsers.set(lowerName, socket.id);

        // Notify about new contact for all space members
        for (const memberLower of space.members) {
          if (memberLower !== lowerName) {
            const memberSocket = onlineUsers.get(memberLower);
            if (memberSocket) {
              io.to(memberSocket).emit('contactAdded', {
                name: trimmedName,
                online: true,
                avatar: null
              });
            }
          }
        }

        console.log(`New user created: ${trimmedName} (space: ${space.name})`);
        callback({
          success: true,
          name: trimmedName,
          role: 'user',
          spaceCode: spaceCode,
          spaceName: space.name,
          avatar: null,
          theme: 'green',
          sessionToken,
          isNewUser: true
        });

        io.emit('userOnline', { name: trimmedName });
      }
    } catch (err) {
      console.error('userLogin error:', err.message);
      callback({ success: false, error: 'Login failed: ' + err.message });
    }
  });

  // ============ RESTORE SESSION ============
  socket.on('restoreSession', async ({ sessionToken }, callback) => {
    try {
      if (!sessionToken) {
        callback({ success: false, error: 'No session token' });
        return;
      }

      if (mongoose.connection.readyState !== 1) {
        callback({ success: false, error: 'Database not connected' });
        return;
      }

      const user = await User.findOne({ sessionToken });
      if (!user) {
        callback({ success: false, error: 'Invalid session' });
        return;
      }

      currentUser = user.name;
      currentUserRole = user.role;
      onlineUsers.set(user.nameLower, socket.id);

      let spaceName = null;
      if (user.spaceCode) {
        const space = await Space.findOne({ spaceCode: user.spaceCode });
        spaceName = space?.name || null;
      }

      console.log(`Session restored for: ${user.name} (role: ${user.role})`);
      callback({
        success: true,
        name: user.name,
        role: user.role,
        spaceCode: user.spaceCode || null,
        spaceName,
        avatar: user.avatar || null,
        theme: user.theme || 'green'
      });

      if (user.role !== 'supreme') {
        io.emit('userOnline', { name: user.name });
      }
    } catch (err) {
      console.error('Restore session error:', err.message);
      callback({ success: false, error: 'Session restore failed' });
    }
  });

  // ============ GET USER DATA (for regular users and admins) ============
  socket.on('getUserData', async (_, callback) => {
    try {
      if (!currentUser) {
        callback({ contacts: [], groups: [], messages: {} });
        return;
      }

      const lowerName = currentUser.toLowerCase();
      const user = await User.findOne({ nameLower: lowerName });
      if (!user || !user.spaceCode) {
        callback({ contacts: [], groups: [], messages: {} });
        return;
      }

      const space = await Space.findOne({ spaceCode: user.spaceCode });
      if (!space) {
        callback({ contacts: [], groups: [], messages: {} });
        return;
      }

      // Contacts = all other members in the space
      const contactDetails = [];
      for (const memberLower of space.members) {
        if (memberLower === lowerName) continue;
        const memberUser = await User.findOne({ nameLower: memberLower });
        if (memberUser) {
          contactDetails.push({
            name: memberUser.name,
            online: onlineUsers.has(memberLower),
            avatar: memberUser.avatar || null
          });
        }
      }

      // Also add the admin as a contact if they're not already in members
      const adminUser = await User.findOne({ nameLower: space.adminNameLower });
      if (adminUser && space.adminNameLower !== lowerName) {
        if (!contactDetails.some(c => c.name.toLowerCase() === space.adminNameLower)) {
          contactDetails.push({
            name: adminUser.name,
            online: onlineUsers.has(space.adminNameLower),
            avatar: adminUser.avatar || null
          });
        }
      }

      // If user is admin, add supreme (William) as a contact
      if (user.role === 'admin') {
        const supremeUser = await User.findOne({ nameLower: SUPREME_NAME_LOWER });
        if (supremeUser) {
          contactDetails.push({
            name: supremeUser.name,
            online: onlineUsers.has(SUPREME_NAME_LOWER),
            avatar: supremeUser.avatar || null
          });
        }
      }

      // Get user's groups in this space
      const userGroups = await Group.find({
        spaceCode: user.spaceCode,
        members: { $elemMatch: { $regex: new RegExp(`^${lowerName}$`, 'i') } }
      });

      const groupsData = userGroups.map(g => ({
        id: g.groupId,
        name: g.name,
        creator: g.creator,
        members: g.members,
        description: g.description,
        avatar: g.avatar,
        isMainGroup: g.isMainGroup || false
      }));

      // Get messages
      const userMessages = {};

      // Contact messages
      for (const contact of contactDetails) {
        const chatId = getChatId(currentUser, contact.name);
        const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        if (msgs.length > 0) {
          userMessages[chatId] = msgs.map(msg => ({
            _id: msg._id,
            text: msg.text,
            image: msg.image,
            game: msg.game || null,
            sender: msg.sender,
            time: msg.time,
            sent: msg.sender?.toLowerCase() === currentUser.toLowerCase(),
            seenBy: msg.seenBy || []
          }));
        }
      }

      // Group messages
      for (const group of userGroups) {
        const chatId = `group_${group.groupId}`;
        const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        if (msgs.length > 0) {
          userMessages[chatId] = msgs.map(msg => ({
            _id: msg._id,
            text: msg.text,
            image: msg.image,
            game: msg.game || null,
            sender: msg.sender,
            time: msg.time,
            sent: msg.sender?.toLowerCase() === currentUser.toLowerCase(),
            seenBy: msg.seenBy || []
          }));
        }
      }

      // Space info for admin
      let spaceInfo = null;
      if (user.role === 'admin') {
        spaceInfo = {
          code: space.spaceCode,
          name: space.name,
          memberCount: space.members.length,
          banned: space.banned
        };
      }

      callback({
        contacts: contactDetails,
        groups: groupsData,
        messages: userMessages,
        spaceInfo
      });
    } catch (err) {
      console.error('getUserData error:', err);
      callback({ contacts: [], groups: [], messages: {} });
    }
  });

  // ============ SUPREME: Get all spaces ============
  socket.on('getSpaces', async (_, callback) => {
    try {
      if (currentUserRole !== 'supreme') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const spaces = await Space.find({});
      const spacesData = [];

      for (const space of spaces) {
        const adminUser = await User.findOne({ nameLower: space.adminNameLower });
        spacesData.push({
          code: space.spaceCode,
          name: space.name,
          adminName: adminUser?.name || space.adminName,
          memberCount: space.members.length,
          members: space.members,
          banned: space.banned,
          mainGroupId: space.mainGroupId,
          createdAt: space.createdAt
        });
      }

      callback({ success: true, spaces: spacesData });
    } catch (err) {
      console.error('getSpaces error:', err);
      callback({ success: false, error: 'Failed to get spaces' });
    }
  });

  // ============ SUPREME: Get space details with all chats ============
  socket.on('getSpaceDetails', async ({ spaceCode }, callback) => {
    try {
      if (currentUserRole !== 'supreme') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const space = await Space.findOne({ spaceCode });
      if (!space) {
        callback({ success: false, error: 'Space not found' });
        return;
      }

      // Get all members with details
      const members = [];
      for (const memberLower of space.members) {
        const memberUser = await User.findOne({ nameLower: memberLower });
        if (memberUser) {
          members.push({
            name: memberUser.name,
            role: memberUser.role,
            online: onlineUsers.has(memberLower),
            avatar: memberUser.avatar || null
          });
        }
      }

      // Get admin
      const adminUser = await User.findOne({ nameLower: space.adminNameLower });

      // Get all groups in space
      const groups = await Group.find({ spaceCode });
      const groupsData = groups.map(g => ({
        id: g.groupId,
        name: g.name,
        creator: g.creator,
        members: g.members,
        isMainGroup: g.isMainGroup || false
      }));

      // Get all DM chat IDs between space members
      const dmChats = [];
      const allMembers = [...space.members];
      if (!allMembers.includes(space.adminNameLower)) {
        allMembers.push(space.adminNameLower);
      }

      for (let i = 0; i < allMembers.length; i++) {
        for (let j = i + 1; j < allMembers.length; j++) {
          const user1 = await User.findOne({ nameLower: allMembers[i] });
          const user2 = await User.findOne({ nameLower: allMembers[j] });
          if (user1 && user2) {
            const chatId = getChatId(user1.name, user2.name);
            const msgCount = await Message.countDocuments({ chatId });
            if (msgCount > 0) {
              dmChats.push({
                chatId,
                user1: user1.name,
                user2: user2.name,
                messageCount: msgCount
              });
            }
          }
        }
      }

      callback({
        success: true,
        space: {
          code: space.spaceCode,
          name: space.name,
          adminName: adminUser?.name || space.adminName,
          members,
          banned: space.banned,
          groups: groupsData,
          dmChats
        }
      });
    } catch (err) {
      console.error('getSpaceDetails error:', err);
      callback({ success: false, error: 'Failed to get space details' });
    }
  });

  // ============ SUPREME: Read any chat ============
  socket.on('readChat', async ({ chatId }, callback) => {
    try {
      if (currentUserRole !== 'supreme') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
      const messages = msgs.map(msg => ({
        text: msg.text,
        image: msg.image,
        game: msg.game || null,
        sender: msg.sender,
        time: msg.time,
        sent: false,
        seenBy: msg.seenBy || []
      }));

      callback({ success: true, messages });
    } catch (err) {
      console.error('readChat error:', err);
      callback({ success: false, error: 'Failed to read chat' });
    }
  });

  // ============ SUPREME: Get admin contacts and messages ============
  socket.on('getSupremeContacts', async (_, callback) => {
    try {
      if (currentUserRole !== 'supreme') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const admins = await User.find({ role: 'admin' });
      const contacts = [];
      const messages = {};

      for (const admin of admins) {
        const space = await Space.findOne({ adminNameLower: admin.nameLower });
        contacts.push({
          name: admin.name,
          online: onlineUsers.has(admin.nameLower),
          avatar: admin.avatar || null,
          spaceName: space ? space.name : 'Unknown'
        });

        const chatId = getChatId(SUPREME_NAME, admin.name);
        const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        if (msgs.length > 0) {
          messages[chatId] = msgs.map(msg => ({
            _id: msg._id,
            text: msg.text,
            image: msg.image,
            game: msg.game || null,
            sender: msg.sender,
            time: msg.time,
            sent: msg.sender?.toLowerCase() === SUPREME_NAME_LOWER,
            seenBy: msg.seenBy || []
          }));
        }
      }

      callback({ success: true, contacts, messages });
    } catch (err) {
      console.error('getSupremeContacts error:', err);
      callback({ success: false, error: 'Failed to get contacts' });
    }
  });

  // ============ SUPREME: Create a space ============
  socket.on('createSpace', async ({ name, adminName, adminPassword }, callback) => {
    try {
      if (currentUserRole !== 'supreme') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!name || !adminName || !adminPassword) {
        callback({ success: false, error: 'Space name, admin name, and admin password required' });
        return;
      }

      const adminNameLower = adminName.trim().toLowerCase();

      // Check if admin name is reserved
      if (adminNameLower === SUPREME_NAME_LOWER) {
        callback({ success: false, error: 'Cannot use the supreme account name as admin' });
        return;
      }

      // Check if admin already exists with different role
      const existingAdmin = await User.findOne({ nameLower: adminNameLower });
      if (existingAdmin && existingAdmin.role !== 'admin') {
        callback({ success: false, error: 'This username is already taken by a regular user' });
        return;
      }

      // Generate unique space code
      let spaceCode;
      let codeExists = true;
      while (codeExists) {
        spaceCode = generateSpaceCode();
        codeExists = await Space.findOne({ spaceCode });
      }

      // Create main group
      const mainGroupId = `main_${Date.now()}`;
      const mainGroup = new Group({
        groupId: mainGroupId,
        name: `${name.trim()} - Main Chat`,
        creator: adminName.trim(),
        members: [adminName.trim()],
        description: `Main chat for ${name.trim()}`,
        spaceCode,
        isMainGroup: true
      });
      await mainGroup.save();

      // Create or update admin account
      const { hash, salt } = hashPassword(adminPassword);
      if (existingAdmin) {
        existingAdmin.passwordHash = hash;
        existingAdmin.passwordSalt = salt;
        existingAdmin.spaceCode = spaceCode;
        existingAdmin.role = 'admin';
        await existingAdmin.save();
      } else {
        const adminUser = new User({
          name: adminName.trim(),
          nameLower: adminNameLower,
          passwordHash: hash,
          passwordSalt: salt,
          role: 'admin',
          spaceCode,
          avatar: null,
          theme: 'green'
        });
        await adminUser.save();
      }

      // Create space
      const space = new Space({
        spaceCode,
        name: name.trim(),
        adminName: adminName.trim(),
        adminNameLower,
        members: [adminNameLower],
        banned: [],
        mainGroupId
      });
      await space.save();

      console.log(`Space created: ${name.trim()} (code: ${spaceCode}, admin: ${adminName.trim()})`);
      callback({
        success: true,
        space: {
          code: spaceCode,
          name: name.trim(),
          adminName: adminName.trim(),
          memberCount: 1
        }
      });
    } catch (err) {
      console.error('createSpace error:', err);
      callback({ success: false, error: 'Failed to create space: ' + err.message });
    }
  });

  // ============ SUPREME: Delete a space ============
  socket.on('deleteSpace', async ({ spaceCode }, callback) => {
    try {
      if (currentUserRole !== 'supreme') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const space = await Space.findOne({ spaceCode });
      if (!space) {
        callback({ success: false, error: 'Space not found' });
        return;
      }

      // Delete all groups in space
      const groups = await Group.find({ spaceCode });
      for (const group of groups) {
        // Clean up voice channels for this group
        const voiceMembers = voiceChannels.get(group.groupId);
        if (voiceMembers) {
          for (const member of voiceMembers) {
            userVoiceChannel.delete(member);
          }
          voiceChannels.delete(group.groupId);
          await broadcastVoiceState(group.groupId);
        }
        await Message.deleteMany({ chatId: `group_${group.groupId}` });
      }
      await Group.deleteMany({ spaceCode });

      // Delete all DM messages between space members
      for (let i = 0; i < space.members.length; i++) {
        for (let j = i + 1; j < space.members.length; j++) {
          const user1 = await User.findOne({ nameLower: space.members[i] });
          const user2 = await User.findOne({ nameLower: space.members[j] });
          if (user1 && user2) {
            const chatId = getChatId(user1.name, user2.name);
            await Message.deleteMany({ chatId });
          }
        }
      }

      // Delete users in space (except admin who might manage other things)
      await User.deleteMany({ spaceCode, role: 'user' });

      // Delete admin account
      await User.deleteOne({ nameLower: space.adminNameLower, role: 'admin' });

      // Delete space
      await Space.deleteOne({ spaceCode });

      console.log(`Space deleted: ${space.name}`);
      callback({ success: true });
    } catch (err) {
      console.error('deleteSpace error:', err);
      callback({ success: false, error: 'Failed to delete space' });
    }
  });

  // ============ ADMIN: Ban user from space ============
  socket.on('banUser', async ({ userName: targetName }, callback) => {
    try {
      if (currentUserRole !== 'admin') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const admin = await User.findOne({ nameLower: currentUser.toLowerCase() });
      if (!admin || !admin.spaceCode) {
        callback({ success: false, error: 'No space found' });
        return;
      }

      const space = await Space.findOne({ spaceCode: admin.spaceCode });
      if (!space) {
        callback({ success: false, error: 'Space not found' });
        return;
      }

      const targetLower = targetName.toLowerCase();

      if (targetLower === currentUser.toLowerCase()) {
        callback({ success: false, error: 'Cannot ban yourself' });
        return;
      }

      if (targetLower === SUPREME_NAME_LOWER) {
        callback({ success: false, error: 'Cannot ban the supreme account' });
        return;
      }

      // Add to banned list
      if (!space.banned.includes(targetLower)) {
        space.banned.push(targetLower);
      }

      // Remove from members
      space.members = space.members.filter(m => m !== targetLower);
      await space.save();

      // Remove from all groups in space and get updated groups
      const spaceGroups = await Group.find({ spaceCode: space.spaceCode });
      for (const group of spaceGroups) {
        const hadMember = group.members.some(m => m.toLowerCase() === targetLower);
        if (hadMember) {
          group.members = group.members.filter(m => m.toLowerCase() !== targetLower);
          await group.save();

          // Broadcast updated group to remaining members
          const groupData = {
            id: group.groupId,
            name: group.name,
            creator: group.creator,
            members: group.members,
            description: group.description,
            avatar: group.avatar,
            isMainGroup: group.isMainGroup || false
          };
          group.members.forEach(member => {
            const memberSocket = onlineUsers.get(member.toLowerCase());
            if (memberSocket) {
              io.to(memberSocket).emit('groupUpdated', groupData);
            }
          });
        }
      }

      // Tell all space members to remove this contact
      for (const memberLower of space.members) {
        const memberSocket = onlineUsers.get(memberLower);
        if (memberSocket) {
          io.to(memberSocket).emit('contactRemoved', { name: targetName });
        }
      }
      // Also tell admin
      const adminSocket = onlineUsers.get(space.adminNameLower);
      if (adminSocket) {
        io.to(adminSocket).emit('contactRemoved', { name: targetName });
      }

      // Remove from voice channel if active
      await removeFromVoice(targetLower);

      // Kick them if online
      const targetSocket = onlineUsers.get(targetLower);
      if (targetSocket) {
        io.to(targetSocket).emit('banned', { spaceName: space.name });
      }

      console.log(`User banned: ${targetName} from ${space.name}`);
      callback({ success: true });
    } catch (err) {
      console.error('banUser error:', err);
      callback({ success: false, error: 'Failed to ban user' });
    }
  });

  // ============ ADMIN: Unban user ============
  socket.on('unbanUser', async ({ userName: targetName }, callback) => {
    try {
      if (currentUserRole !== 'admin') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const admin = await User.findOne({ nameLower: currentUser.toLowerCase() });
      const space = await Space.findOne({ spaceCode: admin.spaceCode });
      if (!space) {
        callback({ success: false, error: 'Space not found' });
        return;
      }

      const targetLower = targetName.toLowerCase();
      space.banned = space.banned.filter(b => b !== targetLower);
      await space.save();

      callback({ success: true });
    } catch (err) {
      console.error('unbanUser error:', err);
      callback({ success: false, error: 'Failed to unban user' });
    }
  });

  // ============ ADMIN: Change space code ============
  socket.on('changeSpaceCode', async (_, callback) => {
    try {
      if (currentUserRole !== 'admin') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const admin = await User.findOne({ nameLower: currentUser.toLowerCase() });
      const space = await Space.findOne({ spaceCode: admin.spaceCode });
      if (!space) {
        callback({ success: false, error: 'Space not found' });
        return;
      }

      // Generate new code
      let newCode;
      let codeExists = true;
      while (codeExists) {
        newCode = generateSpaceCode();
        codeExists = await Space.findOne({ spaceCode: newCode });
      }

      const oldCode = space.spaceCode;
      space.spaceCode = newCode;
      await space.save();

      // Update all users in this space
      await User.updateMany({ spaceCode: oldCode }, { spaceCode: newCode });

      // Update all groups in this space
      await Group.updateMany({ spaceCode: oldCode }, { spaceCode: newCode });

      console.log(`Space code changed: ${oldCode} -> ${newCode}`);
      callback({ success: true, newCode });
    } catch (err) {
      console.error('changeSpaceCode error:', err);
      callback({ success: false, error: 'Failed to change space code' });
    }
  });

  // ============ ADMIN: Get space info ============
  socket.on('getSpaceInfo', async (_, callback) => {
    try {
      if (currentUserRole !== 'admin') {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      const admin = await User.findOne({ nameLower: currentUser.toLowerCase() });
      const space = await Space.findOne({ spaceCode: admin.spaceCode });
      if (!space) {
        callback({ success: false, error: 'Space not found' });
        return;
      }

      callback({
        success: true,
        spaceInfo: {
          code: space.spaceCode,
          name: space.name,
          memberCount: space.members.length,
          members: space.members,
          banned: space.banned
        }
      });
    } catch (err) {
      console.error('getSpaceInfo error:', err);
      callback({ success: false, error: 'Failed to get space info' });
    }
  });

  // ============ DELETE ACCOUNT (regular users only) ============
  socket.on('deleteAccount', async (_, callback) => {
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

      if (user.role === 'supreme') {
        callback({ success: false, error: 'Cannot delete the supreme account' });
        return;
      }

      if (user.role === 'admin') {
        callback({ success: false, error: 'Admin accounts cannot be self-deleted' });
        return;
      }

      const deletedName = currentUser;

      // Remove from space
      if (user.spaceCode) {
        const space = await Space.findOne({ spaceCode: user.spaceCode });
        if (space) {
          space.members = space.members.filter(m => m !== lowerName);
          await space.save();

          // Remove from all groups in space
          const spaceGroups = await Group.find({ spaceCode: user.spaceCode });
          for (const group of spaceGroups) {
            const hadMember = group.members.some(m => m.toLowerCase() === lowerName);
            if (hadMember) {
              group.members = group.members.filter(m => m.toLowerCase() !== lowerName);
              await group.save();

              const groupData = {
                id: group.groupId,
                name: group.name,
                creator: group.creator,
                members: group.members,
                description: group.description,
                avatar: group.avatar,
                isMainGroup: group.isMainGroup || false
              };
              group.members.forEach(member => {
                const memberSocket = onlineUsers.get(member.toLowerCase());
                if (memberSocket) {
                  io.to(memberSocket).emit('groupUpdated', groupData);
                }
              });
            }
          }

          // Tell all space members to remove this contact
          for (const memberLower of space.members) {
            const memberSocket = onlineUsers.get(memberLower);
            if (memberSocket) {
              io.to(memberSocket).emit('contactRemoved', { name: deletedName });
            }
          }
          const adminSocket = onlineUsers.get(space.adminNameLower);
          if (adminSocket) {
            io.to(adminSocket).emit('contactRemoved', { name: deletedName });
          }
        }
      }

      // Delete the user document
      await User.deleteOne({ nameLower: lowerName });

      onlineUsers.delete(lowerName);
      io.emit('userOffline', { name: deletedName });

      currentUser = null;
      currentUserRole = null;

      console.log(`Account deleted: ${deletedName}`);
      callback({ success: true });
    } catch (err) {
      console.error('deleteAccount error:', err);
      callback({ success: false, error: 'Failed to delete account' });
    }
  });

  // ============ SEND MESSAGE ============
  socket.on('sendMessage', async ({ chatId, chatType, recipient, message }) => {
    try {
      if (!currentUser) {
        console.log('sendMessage: No current user');
        return;
      }

      if (message.image) {
        if (!isValidImageData(message.image)) {
          socket.emit('error', { message: 'Invalid image format' });
          return;
        }
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
        game: message.game || null,
        sender: currentUser,
        time: message.time,
        seenBy: [currentUser]
      });

      try {
        await msg.save();
      } catch (saveErr) {
        console.error('Error saving message:', saveErr);
        socket.emit('error', { message: 'Failed to save message' });
        return;
      }

      const fullMessage = {
        _id: msg._id,
        text: sanitizedText,
        image: message.image || null,
        game: message.game || null,
        sent: true,
        time: message.time,
        sender: currentUser,
        seenBy: [currentUser]
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
      socket.emit('error', { message: 'Failed to send message: ' + err.message });
    }
  });

  // ============ MARK MESSAGES SEEN ============
  socket.on('markSeen', async ({ chatId, chatType, recipient }) => {
    try {
      if (!currentUser) return;

      const result = await Message.updateMany(
        { chatId, sender: { $ne: currentUser }, seenBy: { $ne: currentUser } },
        { $addToSet: { seenBy: currentUser } }
      );

      if (result.modifiedCount > 0) {
        // Notify the other user(s) that messages were seen
        if (chatType === 'contact') {
          const recipientLower = recipient.toLowerCase();
          const recipientSocket = onlineUsers.get(recipientLower);
          if (recipientSocket) {
            io.to(recipientSocket).emit('messagesSeen', { chatId: getChatId(recipient, currentUser), seenBy: currentUser });
          }
        } else if (chatType === 'group') {
          const group = await Group.findOne({ groupId: recipient });
          if (group) {
            group.members.forEach(memberName => {
              const memberSocket = onlineUsers.get(memberName.toLowerCase());
              if (memberSocket && memberName.toLowerCase() !== currentUser.toLowerCase()) {
                io.to(memberSocket).emit('messagesSeen', { chatId, seenBy: currentUser });
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('markSeen error:', err);
    }
  });

  // ============ UPDATE GAME STATE ============
  socket.on('updateGame', async ({ chatId, gameId, game }) => {
    try {
      if (!currentUser) return;

      const messages = await Message.find({ chatId });
      const message = messages.find(m => m.game && m.game.id === gameId);

      if (!message) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (!game.players.some(p => p.toLowerCase() === currentUser.toLowerCase())) {
        socket.emit('error', { message: 'You are not part of this game' });
        return;
      }

      message.game = game;
      message.markModified('game');
      await message.save();

      for (const playerName of game.players) {
        const playerSocket = onlineUsers.get(playerName.toLowerCase());
        if (playerSocket) {
          io.to(playerSocket).emit('gameUpdated', { chatId, gameId, game });
        }
      }
    } catch (err) {
      console.error('updateGame error:', err);
      socket.emit('error', { message: 'Failed to update game' });
    }
  });

  // ============ UPDATE PROFILE ============
  socket.on('updateProfile', async ({ avatar, theme, newUsername }, callback) => {
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

      // Update username (only name change, no password change for regular users)
      if (newUsername && newUsername.trim() !== currentUser) {
        const trimmedNewName = newUsername.trim();
        const newLowerName = trimmedNewName.toLowerCase();

        if (trimmedNewName.length < 2) {
          callback({ success: false, error: 'Name must be at least 2 characters' });
          return;
        }

        if (trimmedNewName.length > 20) {
          callback({ success: false, error: 'Name must be 20 characters or less' });
          return;
        }

        if (newLowerName === SUPREME_NAME_LOWER) {
          callback({ success: false, error: 'This name is reserved' });
          return;
        }

        if (newLowerName !== lowerName) {
          const existingUser = await User.findOne({ nameLower: newLowerName });
          if (existingUser) {
            callback({ success: false, error: 'Name is already taken' });
            return;
          }
        }

        user.name = trimmedNewName;
        user.nameLower = newLowerName;

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

        // Update space member list
        if (user.spaceCode) {
          const space = await Space.findOne({ spaceCode: user.spaceCode });
          if (space) {
            space.members = space.members.map(m => m === lowerName ? newLowerName : m);
            await space.save();
          }
        }

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

      await user.save();

      callback({
        success: true,
        avatar: user.avatar,
        theme: user.theme,
        name: newName,
        nameChanged
      });

      // Notify contacts about avatar update
      if (avatar !== undefined && user.spaceCode) {
        const space = await Space.findOne({ spaceCode: user.spaceCode });
        if (space) {
          for (const memberLower of space.members) {
            if (memberLower !== currentUser.toLowerCase()) {
              const memberSocket = onlineUsers.get(memberLower);
              if (memberSocket) {
                io.to(memberSocket).emit('contactUpdated', {
                  name: currentUser,
                  avatar: user.avatar
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('updateProfile error:', err);
      callback({ success: false, error: 'Failed to update profile' });
    }
  });

  // ============ TYPING INDICATORS ============
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

  // ============ GROUP MANAGEMENT (for admins within their space) ============
  socket.on('createGroup', async ({ name, members }, callback) => {
    try {
      if (!currentUser) {
        callback({ success: false, error: 'Not logged in' });
        return;
      }

      const user = await User.findOne({ nameLower: currentUser.toLowerCase() });
      if (!user || !user.spaceCode) {
        callback({ success: false, error: 'No space found' });
        return;
      }

      const allMembers = [currentUser, ...members.filter(m => m.toLowerCase() !== currentUser.toLowerCase())];
      const groupId = Date.now().toString();

      const group = new Group({
        groupId,
        name: name.trim(),
        creator: currentUser,
        members: allMembers,
        spaceCode: user.spaceCode
      });
      await group.save();

      const groupData = {
        id: groupId,
        name: group.name,
        creator: group.creator,
        members: group.members,
        isMainGroup: false
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

  socket.on('deleteGroup', async ({ groupId }) => {
    try {
      if (!currentUser) return;

      const group = await Group.findOne({ groupId });
      if (!group) return;

      if (group.isMainGroup) {
        socket.emit('error', { message: 'Cannot delete the main group chat' });
        return;
      }

      if (group.creator.toLowerCase() !== currentUser.toLowerCase()) {
        socket.emit('error', { message: 'Only the group creator can delete this group' });
        return;
      }

      // Remove all users from voice channel if active
      const voiceMembers = voiceChannels.get(groupId);
      if (voiceMembers) {
        for (const member of voiceMembers) {
          userVoiceChannel.delete(member);
        }
        voiceChannels.delete(groupId);
        // Notify clients that voice channel is empty so they clean up their peers
        await broadcastVoiceState(groupId);
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

      if (name !== undefined) group.name = name.trim().slice(0, 50);
      if (description !== undefined) group.description = description.trim().slice(0, 200);
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
        avatar: group.avatar,
        isMainGroup: group.isMainGroup || false
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
        avatar: group.avatar,
        isMainGroup: group.isMainGroup || false
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

      // Remove from voice if in this channel
      if (userVoiceChannel.get(lowerName) === groupId) {
        await removeFromVoice(lowerName);
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
        avatar: group.avatar,
        isMainGroup: group.isMainGroup || false
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

      if (group.isMainGroup) {
        callback({ success: false, error: 'Cannot leave the main group chat' });
        return;
      }

      const lowerName = currentUser.toLowerCase();

      if (lowerName === group.creator.toLowerCase()) {
        callback({ success: false, error: 'Group manager cannot leave. Delete the group instead.' });
        return;
      }

      // Remove from voice if in this channel
      if (userVoiceChannel.get(lowerName) === groupId) {
        await removeFromVoice(lowerName);
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
        avatar: group.avatar,
        isMainGroup: group.isMainGroup || false
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

  // ============ DISCONNECT ============
  // ============ DM CALLS ============
  socket.on('startCall', ({ targetUser, chatId }) => {
    if (!currentUser) return;
    const targetSocket = onlineUsers.get(targetUser.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('incomingCall', { from: currentUser, chatId });
    }
  });

  socket.on('answerCall', ({ targetUser, chatId }) => {
    if (!currentUser) return;
    const targetSocket = onlineUsers.get(targetUser.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('callAnswered', { by: currentUser, chatId });
    }
  });

  socket.on('rejectCall', ({ targetUser }) => {
    if (!currentUser) return;
    const targetSocket = onlineUsers.get(targetUser.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('callRejected', { by: currentUser });
    }
  });

  socket.on('endCall', ({ targetUser }) => {
    if (!currentUser) return;
    const targetSocket = onlineUsers.get(targetUser.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('callEnded', { by: currentUser });
    }
  });

  socket.on('callSignal', ({ targetUser, signal }) => {
    if (!currentUser) return;
    const targetSocket = onlineUsers.get(targetUser.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('callSignal', { from: currentUser, signal });
    }
  });

  // ============ VOICE CHAT ============
  socket.on('joinVoice', async ({ groupId }, callback) => {
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
      if (!group.members.some(m => m.toLowerCase() === lowerName)) {
        callback({ success: false, error: 'Not a member of this group' });
        return;
      }

      // Leave current voice channel if in one
      await removeFromVoice(lowerName);

      // Join new voice channel
      if (!voiceChannels.has(groupId)) {
        voiceChannels.set(groupId, new Set());
      }
      voiceChannels.get(groupId).add(lowerName);
      userVoiceChannel.set(lowerName, groupId);

      const members = Array.from(voiceChannels.get(groupId));
      await broadcastVoiceState(groupId);

      callback({ success: true, members });
    } catch (err) {
      console.error('joinVoice error:', err);
      callback({ success: false, error: 'Failed to join voice' });
    }
  });

  socket.on('leaveVoice', async ({ groupId }) => {
    try {
      if (!currentUser) return;
      await removeFromVoice(currentUser.toLowerCase());
    } catch (err) {
      console.error('leaveVoice error:', err);
    }
  });

  socket.on('voiceSignal', ({ groupId, targetUser, signal }) => {
    if (!currentUser) return;
    const targetSocket = onlineUsers.get(targetUser.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('voiceSignal', {
        groupId,
        fromUser: currentUser,
        signal
      });
    }
  });

  socket.on('getVoiceMembers', ({ groupId }, callback) => {
    const members = voiceChannels.get(groupId);
    callback({ success: true, members: members ? Array.from(members) : [] });
  });

  // ============ DISCONNECT ============
  socket.on('disconnect', async () => {
    if (currentUser) {
      await removeFromVoice(currentUser.toLowerCase());
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
