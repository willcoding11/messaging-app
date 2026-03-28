import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import cameraIcon from '../assets/camera.png';
import emojiIcon from '../assets/happy.png';
import gifIcon from '../assets/gif.png';
import gamesIcon from '../assets/console.png';
import cameraIconDark from '../assets/camera - dark mode.png';
import emojiIconDark from '../assets/happy - dark mode.png';
import gifIconDark from '../assets/gif - dark mode.png';
import gamesIconDark from '../assets/console - dark mode.png';
import infoIcon from '../assets/info.png';
import infoIconDark from '../assets/info - dark mode.png';
import notificationSound from '../assets/new-notification.mp3';

const isCapacitor = window.location.protocol === 'capacitor:' ||
                    window.location.protocol === 'file:' ||
                    (window.location.hostname === 'localhost' && !window.location.port);
const isDev = window.location.port === '3000' || window.location.port === '5173';

let serverUrl;
if (isCapacitor) {
  serverUrl = 'https://messaging-app-2lzh.onrender.com';
} else if (isDev) {
  serverUrl = `http://${window.location.hostname}:3001`;
} else {
  serverUrl = undefined;
}

const socket = io(serverUrl);

function App() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginStep, setLoginStep] = useState('name'); // 'name', 'password', 'spaceCode'
  const [loginType, setLoginType] = useState(null); // 'supreme', 'admin', 'user'
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [spaceCodeInput, setSpaceCodeInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Space state
  const [spaceCode, setSpaceCode] = useState(null);
  const [spaceName, setSpaceName] = useState('');

  // Chat state
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState({});
  const [currentChat, setCurrentChat] = useState(null);
  const [currentTab, setCurrentTab] = useState('contacts');
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Settings state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [userTheme, setUserTheme] = useState('green');
  const [userAvatar, setUserAvatar] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [settingsError, setSettingsError] = useState('');
  const [tempAvatar, setTempAvatar] = useState(null);
  const [tempTheme, setTempTheme] = useState('green');
  const [settingsNewUsername, setSettingsNewUsername] = useState('');

  // Group settings state
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [tempGroupAvatar, setTempGroupAvatar] = useState(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [groupSettingsError, setGroupSettingsError] = useState('');

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Image cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [cropperImage, setCropperImage] = useState(null);
  const [cropperIsGroup, setCropperIsGroup] = useState(false);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [minCropScale, setMinCropScale] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Emoji and GIF picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

  // Sound notification state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tempSoundEnabled, setTempSoundEnabled] = useState(true);

  // Game state
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [showMobileAttach, setShowMobileAttach] = useState(false);
  const [activeGame, setActiveGame] = useState(null);

  // Unread messages
  const [unreadMessages, setUnreadMessages] = useState({});

  // Mobile state
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Group modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Admin state
  const [spaceInfo, setSpaceInfo] = useState(null);
  const [showSpaceSettings, setShowSpaceSettings] = useState(false);
  const [banNameInput, setBanNameInput] = useState('');

  // Supreme dashboard state
  const [allSpaces, setAllSpaces] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [spaceDetails, setSpaceDetails] = useState(null);
  const [supremeViewChat, setSupremeViewChat] = useState(null);
  const [supremeChatMessages, setSupremeChatMessages] = useState([]);
  const [createSpaceForm, setCreateSpaceForm] = useState({ name: '', adminName: '', adminPassword: '' });
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [supremeError, setSupremeError] = useState('');

  const messagesEndRef = useRef(null);
  const currentChatRef = useRef(null);
  const soundEnabledRef = useRef(true);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const groupAvatarInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const cropperRef = useRef(null);
  const canvasRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userTheme);
  }, [userTheme]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio(notificationSound);
      audio.volume = 0.5;
      audio.play();
    } catch (e) {}
  }, []);

  // Track socket connection
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Restore session on load
  useEffect(() => {
    const sessionToken = localStorage.getItem('sessionToken');
    if (sessionToken && !isLoggedIn) {
      socket.emit('restoreSession', { sessionToken }, (response) => {
        if (response.success) {
          setUserName(response.name);
          setUserRole(response.role);
          setUserAvatar(response.avatar);
          setUserTheme(response.theme || 'green');
          setSpaceCode(response.spaceCode);
          setSpaceName(response.spaceName || '');
          setIsLoggedIn(true);
          if (response.role === 'supreme') {
            loadSpaces();
          } else {
            socket.emit('getUserData', null, (data) => {
              setContacts(data.contacts);
              setGroups(data.groups);
              setMessages(data.messages);
              if (data.spaceInfo) setSpaceInfo(data.spaceInfo);
            });
          }
        } else {
          localStorage.removeItem('sessionToken');
        }
      });
    }
  }, []);

  // Poll server every 10 seconds to sync data
  useEffect(() => {
    if (!isLoggedIn || userRole === 'supreme') return;

    const interval = setInterval(() => {
      socket.emit('getUserData', null, (data) => {
        if (data) {
          setContacts(data.contacts || []);
          setGroups(data.groups || []);
          setMessages(data.messages || {});
          if (data.spaceInfo) setSpaceInfo(data.spaceInfo);
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [isLoggedIn, userRole]);

  // Poll spaces for supreme dashboard
  useEffect(() => {
    if (!isLoggedIn || userRole !== 'supreme') return;

    const interval = setInterval(() => {
      loadSpaces();
    }, 10000);

    return () => clearInterval(interval);
  }, [isLoggedIn, userRole]);

  // Keep currentChatRef in sync
  useEffect(() => {
    currentChatRef.current = currentChat;
    if (currentChat?.id) {
      setUnreadMessages(prev => {
        const updated = { ...prev };
        delete updated[currentChat.id];
        return updated;
      });
    }
  }, [currentChat]);

  // Sync currentChat with contacts/groups
  useEffect(() => {
    if (currentChat?.type === 'contact') {
      const contact = contacts.find(c => c.name.toLowerCase() === currentChat.name.toLowerCase());
      if (contact && (contact.online !== currentChat.online || contact.avatar !== currentChat.avatar)) {
        setCurrentChat(prev => ({ ...prev, online: contact.online, avatar: contact.avatar }));
      }
    } else if (currentChat?.type === 'group') {
      const group = groups.find(g => g.id === currentChat.groupId);
      if (group && (group.avatar !== currentChat.avatar || group.name !== currentChat.name || group.members?.length !== currentChat.members?.length)) {
        setCurrentChat(prev => ({ ...prev, avatar: group.avatar, name: group.name, members: group.members }));
      }
    }
  }, [contacts, groups, currentChat]);

  const formatMessageTime = useCallback((timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    if (date.toDateString() === now.toDateString()) return timeStr;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`;
    if (diffDays < 7) {
      const dayName = date.toLocaleDateString([], { weekday: 'long' });
      return `${dayName} ${timeStr}`;
    }
    const monthDay = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const year = date.getFullYear();
    const dayName = date.toLocaleDateString([], { weekday: 'long' });
    return `${monthDay} ${year}, ${dayName}, ${timeStr}`;
  }, []);

  // Socket event listeners
  useEffect(() => {
    socket.on('userOnline', ({ name }) => {
      setContacts(prev => prev.map(c =>
        c.name.toLowerCase() === name.toLowerCase() ? { ...c, online: true } : c
      ));
    });

    socket.on('userOffline', ({ name }) => {
      setContacts(prev => prev.map(c =>
        c.name.toLowerCase() === name.toLowerCase() ? { ...c, online: false } : c
      ));
    });

    socket.on('newMessage', ({ chatId, message }) => {
      setMessages(prev => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), message]
      }));
      if (!message.sent && soundEnabledRef.current) {
        playNotificationSound();
      }
      if (!message.sent && currentChatRef.current?.id !== chatId) {
        setUnreadMessages(prev => ({
          ...prev,
          [chatId]: (prev[chatId] || 0) + 1
        }));
      }
      // Auto mark seen if this chat is currently open
      if (!message.sent && currentChatRef.current?.id === chatId) {
        const chat = currentChatRef.current;
        socket.emit('markSeen', {
          chatId,
          chatType: chat.type,
          recipient: chat.type === 'group' ? chat.id.replace('group_', '') : chat.name
        });
      }
    });

    socket.on('messagesSeen', ({ chatId, seenBy }) => {
      setMessages(prev => {
        const chatMessages = prev[chatId];
        if (!chatMessages) return prev;
        return {
          ...prev,
          [chatId]: chatMessages.map(msg => {
            if (msg.sent && !(msg.seenBy || []).includes(seenBy)) {
              return { ...msg, seenBy: [...(msg.seenBy || []), seenBy] };
            }
            return msg;
          })
        };
      });
    });

    socket.on('contactAdded', (contact) => {
      setContacts(prev => {
        if (prev.some(c => c.name.toLowerCase() === contact.name.toLowerCase())) return prev;
        return [...prev, contact];
      });
    });

    socket.on('contactUpdated', ({ name, avatar }) => {
      setContacts(prev => prev.map(c =>
        c.name.toLowerCase() === name.toLowerCase() ? { ...c, avatar } : c
      ));
    });

    socket.on('contactRemoved', ({ name }) => {
      setContacts(prev => prev.filter(c => c.name.toLowerCase() !== name.toLowerCase()));
      setCurrentChat(prev => {
        if (prev?.type === 'contact' && prev.name.toLowerCase() === name.toLowerCase()) return null;
        return prev;
      });
    });

    socket.on('groupCreated', (group) => {
      setGroups(prev => {
        if (prev.some(g => g.id === group.id)) return prev;
        return [...prev, group];
      });
    });

    socket.on('groupDeleted', (groupId) => {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      setCurrentChat(prev => prev?.id === `group_${groupId}` ? null : prev);
      setShowGroupSettingsModal(false);
    });

    socket.on('groupUpdated', (group) => {
      setGroups(prev => prev.map(g => g.id === group.id ? group : g));
      setCurrentChat(prev => {
        if (prev?.groupId === group.id) {
          return { ...prev, name: group.name, members: group.members, avatar: group.avatar };
        }
        return prev;
      });
    });

    socket.on('userTyping', ({ chatId, user, isTyping }) => {
      setTypingUsers(prev => {
        const current = prev[chatId] || [];
        if (isTyping) {
          if (!current.includes(user)) {
            return { ...prev, [chatId]: [...current, user] };
          }
        } else {
          return { ...prev, [chatId]: current.filter(u => u !== user) };
        }
        return prev;
      });
    });

    socket.on('error', ({ message }) => {
      showToast(message, 'error');
    });

    socket.on('banned', ({ spaceName }) => {
      showToast(`You have been banned from ${spaceName}`, 'error');
      handleLogout();
    });

    socket.on('gameUpdated', ({ chatId, gameId, game }) => {
      setMessages(prev => {
        const chatMessages = prev[chatId] || [];
        return {
          ...prev,
          [chatId]: chatMessages.map(msg => {
            if (msg.game && msg.game.id === gameId) {
              return { ...msg, game };
            }
            return msg;
          })
        };
      });

      setActiveGame(prev => {
        if (prev && prev.id === gameId) {
          return { ...game, chatId };
        }
        return prev;
      });
    });

    return () => {
      socket.off('userOnline');
      socket.off('userOffline');
      socket.off('newMessage');
      socket.off('contactAdded');
      socket.off('contactUpdated');
      socket.off('contactRemoved');
      socket.off('groupCreated');
      socket.off('groupDeleted');
      socket.off('groupUpdated');
      socket.off('userTyping');
      socket.off('error');
      socket.off('banned');
      socket.off('gameUpdated');
    };
  }, [showToast]);

  const prevChatRef = useRef(null);
  useEffect(() => {
    const isNewChat = prevChatRef.current?.id !== currentChat?.id;
    prevChatRef.current = currentChat;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: isNewChat ? 'instant' : 'smooth' });
    }, isNewChat ? 50 : 0);
  }, [messages, currentChat]);

  // ============ AUTH FUNCTIONS ============

  const handleCheckName = () => {
    if (!nameInput.trim()) {
      setAuthError('Please enter your name');
      return;
    }

    if (!isConnected) {
      setAuthError('Connecting to server... please wait');
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');

    const timeout = setTimeout(() => {
      setIsAuthenticating(false);
      setAuthError('Server is waking up, please try again...');
    }, 15000);

    socket.emit('checkName', { name: nameInput.trim() }, (response) => {
      clearTimeout(timeout);
      setIsAuthenticating(false);

      if (response.success) {
        setLoginType(response.type);
        if (response.type === 'supreme' || response.type === 'admin') {
          setLoginStep('password');
        } else {
          setLoginStep('spaceCode');
        }
      } else {
        setAuthError(response.error);
      }
    });
  };

  const handlePasswordLogin = () => {
    if (!passwordInput) {
      setAuthError('Please enter your password');
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');

    const timeout = setTimeout(() => {
      setIsAuthenticating(false);
      setAuthError('Server is waking up, please try again...');
    }, 15000);

    const event = loginType === 'supreme' ? 'supremeLogin' : 'adminLogin';
    socket.emit(event, { name: nameInput.trim(), password: passwordInput }, (response) => {
      clearTimeout(timeout);
      setIsAuthenticating(false);

      if (response.success) {
        setUserName(response.name);
        setUserRole(response.role);
        setUserAvatar(response.avatar);
        setUserTheme(response.theme || 'green');
        setSpaceCode(response.spaceCode || null);
        setIsLoggedIn(true);
        if (response.sessionToken) {
          localStorage.setItem('sessionToken', response.sessionToken);
        }
        if (response.role === 'supreme') {
          loadSpaces();
        } else {
          socket.emit('getUserData', null, (data) => {
            setContacts(data.contacts);
            setGroups(data.groups);
            setMessages(data.messages);
            if (data.spaceInfo) setSpaceInfo(data.spaceInfo);
          });
        }
      } else {
        setAuthError(response.error);
      }
    });
  };

  const handleSpaceCodeLogin = () => {
    if (!spaceCodeInput || spaceCodeInput.length !== 5) {
      setAuthError('Please enter a valid 5-digit space code');
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');

    const timeout = setTimeout(() => {
      setIsAuthenticating(false);
      setAuthError('Server is waking up, please try again...');
    }, 15000);

    socket.emit('userLogin', { name: nameInput.trim(), spaceCode: spaceCodeInput }, (response) => {
      clearTimeout(timeout);
      setIsAuthenticating(false);

      if (response.success) {
        setUserName(response.name);
        setUserRole('user');
        setUserAvatar(response.avatar);
        setUserTheme(response.theme || 'green');
        setSpaceCode(response.spaceCode);
        setSpaceName(response.spaceName || '');
        setIsLoggedIn(true);
        if (response.sessionToken) {
          localStorage.setItem('sessionToken', response.sessionToken);
        }
        socket.emit('getUserData', null, (data) => {
          setContacts(data.contacts);
          setGroups(data.groups);
          setMessages(data.messages);
        });
        if (response.isNewUser) {
          showToast('Welcome! Your account has been created.', 'success');
        }
      } else {
        setAuthError(response.error);
      }
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    setIsLoggedIn(false);
    setUserName('');
    setUserRole(null);
    setNameInput('');
    setPasswordInput('');
    setSpaceCodeInput('');
    setLoginStep('name');
    setLoginType(null);
    setContacts([]);
    setGroups([]);
    setMessages({});
    setCurrentChat(null);
    setUserAvatar(null);
    setUserTheme('green');
    setSpaceCode(null);
    setSpaceName('');
    setSpaceInfo(null);
    setAllSpaces([]);
    setSelectedSpace(null);
    setSpaceDetails(null);
    setSupremeViewChat(null);
    setSupremeChatMessages([]);
    window.location.reload();
  };

  // ============ SUPREME FUNCTIONS ============

  const loadSpaces = () => {
    socket.emit('getSpaces', null, (response) => {
      if (response.success) {
        setAllSpaces(response.spaces);
      }
    });
  };

  const viewSpaceDetails = (spaceCode) => {
    socket.emit('getSpaceDetails', { spaceCode }, (response) => {
      if (response.success) {
        setSpaceDetails(response.space);
        setSelectedSpace(spaceCode);
        setSupremeViewChat(null);
        setSupremeChatMessages([]);
      }
    });
  };

  const viewChat = (chatId) => {
    socket.emit('readChat', { chatId }, (response) => {
      if (response.success) {
        setSupremeViewChat(chatId);
        setSupremeChatMessages(response.messages);
      }
    });
  };

  const handleCreateSpace = () => {
    if (!createSpaceForm.name || !createSpaceForm.adminName || !createSpaceForm.adminPassword) {
      setSupremeError('All fields required');
      return;
    }

    socket.emit('createSpace', createSpaceForm, (response) => {
      if (response.success) {
        setShowCreateSpace(false);
        setCreateSpaceForm({ name: '', adminName: '', adminPassword: '' });
        setSupremeError('');
        loadSpaces();
        showToast(`Space "${response.space.name}" created! Code: ${response.space.code}`, 'success');
      } else {
        setSupremeError(response.error);
      }
    });
  };

  const handleDeleteSpace = (spaceCode) => {
    socket.emit('deleteSpace', { spaceCode }, (response) => {
      if (response.success) {
        loadSpaces();
        setSelectedSpace(null);
        setSpaceDetails(null);
        showToast('Space deleted', 'info');
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  // ============ ADMIN FUNCTIONS ============

  const handleBanUser = () => {
    if (!banNameInput.trim()) return;
    socket.emit('banUser', { userName: banNameInput.trim() }, (response) => {
      if (response.success) {
        showToast(`${banNameInput.trim()} has been banned`, 'success');
        setBanNameInput('');
        // Refresh space info
        socket.emit('getSpaceInfo', null, (res) => {
          if (res.success) setSpaceInfo(res.spaceInfo);
        });
        // Refresh contacts
        socket.emit('getUserData', null, (data) => {
          setContacts(data.contacts);
        });
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  const handleUnbanUser = (name) => {
    socket.emit('unbanUser', { userName: name }, (response) => {
      if (response.success) {
        showToast(`${name} has been unbanned`, 'success');
        socket.emit('getSpaceInfo', null, (res) => {
          if (res.success) setSpaceInfo(res.spaceInfo);
        });
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  const handleChangeSpaceCode = () => {
    socket.emit('changeSpaceCode', null, (response) => {
      if (response.success) {
        showToast(`Space code changed to: ${response.newCode}`, 'success');
        setSpaceCode(response.newCode);
        socket.emit('getSpaceInfo', null, (res) => {
          if (res.success) setSpaceInfo(res.spaceInfo);
        });
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  // ============ CHAT FUNCTIONS ============

  const getChatId = (contactName) => {
    const sorted = [userName.toLowerCase(), contactName.toLowerCase()].sort();
    return `dm_${sorted[0]}_${sorted[1]}`;
  };

  const openChat = (type, entity) => {
    if (type === 'contact') {
      const chatId = getChatId(entity.name);
      setCurrentChat({ id: chatId, name: entity.name, type: 'contact', online: entity.online, avatar: entity.avatar });
      socket.emit('markSeen', { chatId, chatType: 'contact', recipient: entity.name });
    } else {
      const chatId = `group_${entity.id}`;
      setCurrentChat({ id: chatId, name: entity.name, type: 'group', groupId: entity.id, members: entity.members, creator: entity.creator, avatar: entity.avatar, isMainGroup: entity.isMainGroup });
      socket.emit('markSeen', { chatId, chatType: 'group', recipient: entity.id });
    }
    setMobileShowChat(true);
  };

  const handleMobileBack = () => {
    setMobileShowChat(false);
  };

  const handleTyping = () => {
    if (!currentChat) return;
    const recipient = currentChat.type === 'contact' ? currentChat.name : currentChat.groupId;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('startTyping', { chatId: currentChat.id, chatType: currentChat.type, recipient });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('stopTyping', { chatId: currentChat.id, chatType: currentChat.type, recipient });
    }, 2000);
  };

  const sendMessage = (text = null, image = null) => {
    if (!currentChat) return;
    if (!text && !image && !messageInput.trim()) return;

    if (isTypingRef.current) {
      isTypingRef.current = false;
      const recipient = currentChat.type === 'contact' ? currentChat.name : currentChat.groupId;
      socket.emit('stopTyping', { chatId: currentChat.id, chatType: currentChat.type, recipient });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    const message = {
      text: text || messageInput.trim() || '',
      image: image || null,
      sent: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const recipient = currentChat.type === 'contact' ? currentChat.name : currentChat.groupId;
    socket.emit('sendMessage', {
      chatId: currentChat.id,
      chatType: currentChat.type,
      recipient,
      message
    });

    setMessageInput('');
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image too large. Max size is 5MB.', 'error');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.', 'error');
      e.target.value = '';
      return;
    }
    e.target.value = '';
    uploadAndSendImage(file);
  };

  const uploadAndSendImage = (file) => {
    setIsUploading(true);
    setUploadProgress(0);
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
    };
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setUploadProgress(100);
        try { sendMessage('', base64); } catch (error) {
          showToast('Failed to send image. File may be too large.', 'error');
        }
      }
      setIsUploading(false);
      setUploadProgress(0);
    };
    reader.onerror = () => {
      showToast('Failed to read image. Please try again.', 'error');
      setIsUploading(false);
      setUploadProgress(0);
    };
    reader.onabort = () => { setIsUploading(false); setUploadProgress(0); };
    try { reader.readAsDataURL(file); } catch (error) {
      showToast('Failed to process image.', 'error');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePaste = (e) => {
    if (!currentChat || isUploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            showToast('Image too large. Max size is 5MB.', 'error');
            return;
          }
          uploadAndSendImage(file);
        }
        return;
      }
    }
  };

  const handleAvatarSelect = (e, isGroup = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image too large. Max size is 2MB.', 'error');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.', 'error');
      e.target.value = '';
      return;
    }
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) openCropper(base64, isGroup);
      else showToast('Failed to load image.', 'error');
    };
    reader.onerror = () => showToast('Failed to read image file.', 'error');
    reader.readAsDataURL(file);
  };

  const openCropper = (imageData, isGroup = false) => {
    const img = new Image();
    img.onload = () => {
      const cropSize = 200;
      const smallerDimension = Math.min(img.width, img.height);
      const calculatedMinScale = cropSize / smallerDimension;
      setMinCropScale(Math.min(calculatedMinScale, 1));
      setCropperImage(imageData);
      setCropperIsGroup(isGroup);
      setCropPosition({ x: 0, y: 0 });
      setCropScale(1);
      setShowCropper(true);
    };
    img.src = imageData;
  };

  const editExistingAvatar = (isGroup = false) => {
    const currentImage = isGroup ? tempGroupAvatar : tempAvatar;
    if (currentImage) openCropper(currentImage, isGroup);
  };

  const handleCropMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const handleCropMouseMove = (e) => {
    if (!isDragging) return;
    setCropPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleCropMouseUp = () => setIsDragging(false);

  const applyCrop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const outputSize = 200;
      canvas.width = outputSize;
      canvas.height = outputSize;
      const cropSize = 200;
      const imgCenterX = img.width / 2;
      const imgCenterY = img.height / 2;
      const offsetX = -cropPosition.x / cropScale;
      const offsetY = -cropPosition.y / cropScale;
      const sourceSize = cropSize / cropScale;
      const sourceX = imgCenterX + offsetX - sourceSize / 2;
      const sourceY = imgCenterY + offsetY - sourceSize / 2;
      const clampedSourceX = Math.max(0, Math.min(sourceX, img.width - sourceSize));
      const clampedSourceY = Math.max(0, Math.min(sourceY, img.height - sourceSize));
      const clampedSourceSize = Math.min(sourceSize, img.width, img.height);
      ctx.drawImage(img, clampedSourceX, clampedSourceY, clampedSourceSize, clampedSourceSize, 0, 0, outputSize, outputSize);
      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.8);
      if (cropperIsGroup) setTempGroupAvatar(croppedBase64);
      else setTempAvatar(croppedBase64);
      setShowCropper(false);
      setCropperImage(null);
    };
    img.src = cropperImage;
  };

  // ============ SETTINGS ============

  const openSettingsModal = () => {
    setTempAvatar(userAvatar);
    setTempTheme(userTheme);
    setTempSoundEnabled(soundEnabled);
    setSettingsNewUsername(userName);
    setSettingsError('');
    setShowSettingsModal(true);
  };

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteAccount = () => {
    socket.emit('deleteAccount', null, (response) => {
      if (response.success) {
        localStorage.removeItem('sessionToken');
        showToast('Account deleted', 'info');
        setTimeout(() => window.location.reload(), 500);
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  const saveSettings = () => {
    const updates = {
      avatar: tempAvatar,
      theme: tempTheme,
      newUsername: settingsNewUsername
    };

    socket.emit('updateProfile', updates, (response) => {
      if (response.success) {
        setUserAvatar(response.avatar);
        setUserTheme(response.theme);
        setSoundEnabled(tempSoundEnabled);
        if (response.nameChanged) {
          setUserName(response.name);
          showToast('Name changed successfully', 'success');
        }
        setShowSettingsModal(false);
        showToast('Settings saved', 'success');
      } else {
        setSettingsError(response.error);
      }
    });
  };

  const openGroupSettingsModal = () => {
    if (!currentChat || currentChat.type !== 'group') return;
    const group = groups.find(g => g.id === currentChat.groupId);
    if (!group) return;
    setEditGroupName(group.name);
    setEditGroupDescription(group.description || '');
    setTempGroupAvatar(group.avatar || null);
    setNewMemberName('');
    setGroupSettingsError('');
    setShowGroupSettingsModal(true);
  };

  const saveGroupSettings = () => {
    if (!currentChat || currentChat.type !== 'group') return;
    socket.emit('updateGroup', {
      groupId: currentChat.groupId,
      name: editGroupName,
      description: editGroupDescription,
      avatar: tempGroupAvatar
    }, (response) => {
      if (response.success) {
        setShowGroupSettingsModal(false);
        showToast('Group settings saved', 'success');
      } else {
        setGroupSettingsError(response.error);
      }
    });
  };

  const addGroupMember = () => {
    if (!newMemberName.trim() || !currentChat?.groupId) return;
    socket.emit('addGroupMember', {
      groupId: currentChat.groupId,
      memberName: newMemberName.trim()
    }, (response) => {
      if (response.success) {
        setNewMemberName('');
        setGroupSettingsError('');
        showToast('Member added', 'success');
      } else {
        setGroupSettingsError(response.error);
      }
    });
  };

  const removeGroupMember = (memberName) => {
    if (!currentChat?.groupId) return;
    socket.emit('removeGroupMember', {
      groupId: currentChat.groupId,
      memberName
    }, (response) => {
      if (response.success) showToast('Member removed', 'info');
      else setGroupSettingsError(response.error);
    });
  };

  const leaveGroup = () => {
    if (!currentChat?.groupId) return;
    socket.emit('leaveGroup', { groupId: currentChat.groupId }, (response) => {
      if (response.success) {
        setShowGroupSettingsModal(false);
        setCurrentChat(null);
        showToast('Left group', 'info');
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  const createGroup = () => {
    if (!newGroupName.trim()) return;
    if (selectedMembers.length === 0) return;
    socket.emit('createGroup', { name: newGroupName.trim(), members: selectedMembers }, (response) => {
      if (response.success) {
        setNewGroupName('');
        setSelectedMembers([]);
        setShowGroupModal(false);
        setCurrentTab('groups');
        showToast('Group created', 'success');
      }
    });
  };

  const deleteGroup = (groupId) => {
    socket.emit('deleteGroup', { groupId });
    showToast('Group deleted', 'info');
  };

  const getLastMessage = (chatId) => {
    const chatMessages = messages[chatId] || [];
    if (chatMessages.length === 0) return 'No messages yet';
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg.image) return 'Image';
    return lastMsg.text || 'No messages yet';
  };

  const getTypingText = (chatId) => {
    const users = typingUsers[chatId] || [];
    if (users.length === 0) return null;
    if (users.length === 1) return `${users[0]} is typing`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing`;
    return `${users[0]} and ${users.length - 1} others are typing`;
  };

  const getMemberAvatar = (memberName) => {
    const contact = contacts.find(c => c.name.toLowerCase() === memberName.toLowerCase());
    return contact?.avatar || null;
  };

  // ============ EMOJI DATA ============
  const allEmojis = [
    { emoji: '😀', keywords: 'grin happy smile face' },
    { emoji: '😃', keywords: 'smile happy grin face open' },
    { emoji: '😄', keywords: 'laugh smile happy grin face' },
    { emoji: '😁', keywords: 'grin beam happy smile' },
    { emoji: '😅', keywords: 'sweat smile nervous happy' },
    { emoji: '😂', keywords: 'joy laugh cry tears happy lol' },
    { emoji: '🤣', keywords: 'rofl laugh rolling floor lol' },
    { emoji: '😊', keywords: 'blush smile happy shy' },
    { emoji: '😇', keywords: 'angel innocent halo smile' },
    { emoji: '🙂', keywords: 'smile slight happy' },
    { emoji: '😉', keywords: 'wink flirt smile' },
    { emoji: '😍', keywords: 'love heart eyes smile' },
    { emoji: '🥰', keywords: 'love hearts smile affection' },
    { emoji: '😘', keywords: 'kiss blow love heart' },
    { emoji: '😋', keywords: 'yum delicious tongue tasty food' },
    { emoji: '😛', keywords: 'tongue playful silly' },
    { emoji: '😜', keywords: 'wink tongue crazy silly' },
    { emoji: '🤪', keywords: 'crazy zany wild silly' },
    { emoji: '😎', keywords: 'cool sunglasses awesome' },
    { emoji: '🤓', keywords: 'nerd geek glasses smart' },
    { emoji: '🥳', keywords: 'party celebrate birthday hat' },
    { emoji: '😏', keywords: 'smirk smug flirt' },
    { emoji: '😒', keywords: 'unamused annoyed meh bored' },
    { emoji: '🙄', keywords: 'eyeroll annoyed whatever' },
    { emoji: '😔', keywords: 'sad pensive disappointed' },
    { emoji: '😢', keywords: 'cry sad tear' },
    { emoji: '😭', keywords: 'sob cry loud tears sad' },
    { emoji: '😤', keywords: 'angry huff triumph' },
    { emoji: '😠', keywords: 'angry mad face' },
    { emoji: '😡', keywords: 'rage angry red mad' },
    { emoji: '🤬', keywords: 'swear curse angry symbols' },
    { emoji: '😱', keywords: 'scream fear shock horror' },
    { emoji: '😨', keywords: 'fear scared afraid' },
    { emoji: '😰', keywords: 'anxious sweat worried nervous' },
    { emoji: '😥', keywords: 'sad relieved disappointed' },
    { emoji: '🤔', keywords: 'think hmm wonder curious' },
    { emoji: '🤫', keywords: 'shush quiet secret hush' },
    { emoji: '🤭', keywords: 'oops giggle cover mouth' },
    { emoji: '😴', keywords: 'sleep zzz tired snore' },
    { emoji: '🤤', keywords: 'drool hungry yum' },
    { emoji: '😷', keywords: 'mask sick ill medical' },
    { emoji: '🤒', keywords: 'sick thermometer ill fever' },
    { emoji: '🤕', keywords: 'hurt bandage injured' },
    { emoji: '🤢', keywords: 'nauseated sick green' },
    { emoji: '🤮', keywords: 'vomit sick throw up' },
    { emoji: '🥵', keywords: 'hot sweating heat' },
    { emoji: '🥶', keywords: 'cold freezing ice' },
    { emoji: '🤯', keywords: 'mind blown exploding head' },
    { emoji: '🥴', keywords: 'woozy drunk dizzy' },
    { emoji: '👋', keywords: 'wave hello hi bye hand' },
    { emoji: '👍', keywords: 'thumbs up like good yes approve' },
    { emoji: '👎', keywords: 'thumbs down dislike bad no' },
    { emoji: '👌', keywords: 'ok okay perfect hand' },
    { emoji: '✌️', keywords: 'peace victory hand two' },
    { emoji: '🤞', keywords: 'fingers crossed luck hope' },
    { emoji: '🤟', keywords: 'love you hand sign' },
    { emoji: '🤘', keywords: 'rock metal horns hand' },
    { emoji: '🤙', keywords: 'call me shaka hang loose' },
    { emoji: '👈', keywords: 'point left hand' },
    { emoji: '👉', keywords: 'point right hand' },
    { emoji: '👆', keywords: 'point up hand' },
    { emoji: '👇', keywords: 'point down hand' },
    { emoji: '👏', keywords: 'clap applause hands' },
    { emoji: '🙌', keywords: 'raise hands celebration hooray' },
    { emoji: '🙏', keywords: 'pray please thank you hands' },
    { emoji: '🤝', keywords: 'handshake deal agreement' },
    { emoji: '💪', keywords: 'muscle strong arm flex' },
    { emoji: '✊', keywords: 'fist power solidarity' },
    { emoji: '👊', keywords: 'fist bump punch' },
    { emoji: '❤️', keywords: 'heart love red' },
    { emoji: '🧡', keywords: 'heart love orange' },
    { emoji: '💛', keywords: 'heart love yellow' },
    { emoji: '💚', keywords: 'heart love green' },
    { emoji: '💙', keywords: 'heart love blue' },
    { emoji: '💜', keywords: 'heart love purple' },
    { emoji: '🖤', keywords: 'heart love black' },
    { emoji: '🤍', keywords: 'heart love white' },
    { emoji: '💔', keywords: 'broken heart sad love' },
    { emoji: '💕', keywords: 'hearts two love' },
    { emoji: '🐶', keywords: 'dog puppy pet animal' },
    { emoji: '🐱', keywords: 'cat kitty pet animal' },
    { emoji: '🐭', keywords: 'mouse rat animal' },
    { emoji: '🐰', keywords: 'rabbit bunny animal' },
    { emoji: '🦊', keywords: 'fox animal' },
    { emoji: '🐻', keywords: 'bear animal' },
    { emoji: '🐼', keywords: 'panda bear animal' },
    { emoji: '🐯', keywords: 'tiger animal' },
    { emoji: '🦁', keywords: 'lion animal king' },
    { emoji: '🐸', keywords: 'frog animal' },
    { emoji: '🐵', keywords: 'monkey animal' },
    { emoji: '🦄', keywords: 'unicorn magic animal' },
    { emoji: '🍕', keywords: 'pizza food italian' },
    { emoji: '🍔', keywords: 'burger hamburger food' },
    { emoji: '🍟', keywords: 'fries french food' },
    { emoji: '🎂', keywords: 'cake birthday food sweet' },
    { emoji: '☕', keywords: 'coffee drink hot' },
    { emoji: '🎮', keywords: 'game video controller gaming' },
    { emoji: '🎵', keywords: 'music note song' },
    { emoji: '🎤', keywords: 'microphone sing karaoke' },
    { emoji: '📷', keywords: 'camera photo picture' },
    { emoji: '💻', keywords: 'laptop computer work' },
    { emoji: '📱', keywords: 'phone mobile cell' },
    { emoji: '🔥', keywords: 'fire hot lit flame' },
    { emoji: '⭐', keywords: 'star favorite' },
    { emoji: '✨', keywords: 'sparkles magic stars' },
    { emoji: '💯', keywords: 'hundred perfect score' },
    { emoji: '💀', keywords: 'skull dead death' },
    { emoji: '👻', keywords: 'ghost spooky halloween' },
    { emoji: '🤖', keywords: 'robot machine' },
    { emoji: '💩', keywords: 'poop poo crap' },
    { emoji: '🎉', keywords: 'party tada celebration confetti' },
    { emoji: '🎁', keywords: 'gift present box' },
    { emoji: '🏆', keywords: 'trophy winner champion' },
    { emoji: '💰', keywords: 'money bag cash' },
    { emoji: '💎', keywords: 'diamond gem jewel' },
    { emoji: '🚀', keywords: 'rocket space launch' },
    { emoji: '🌈', keywords: 'rainbow colors' },
    { emoji: '☀️', keywords: 'sun sunny weather' },
    { emoji: '🌙', keywords: 'moon night' },
    { emoji: '⚡', keywords: 'lightning bolt electric' },
    { emoji: '❄️', keywords: 'snowflake cold winter' },
    { emoji: '🌸', keywords: 'flower cherry blossom pink' },
    { emoji: '✅', keywords: 'check yes done complete' },
    { emoji: '❌', keywords: 'x no wrong cross' },
    { emoji: '❓', keywords: 'question mark' },
    { emoji: '❗', keywords: 'exclamation mark important' },
    { emoji: '💤', keywords: 'sleep zzz tired' }
  ];

  const getFilteredEmojis = () => {
    if (!emojiSearch.trim()) return allEmojis;
    const search = emojiSearch.toLowerCase();
    return allEmojis.filter(e => e.keywords.includes(search));
  };

  const searchGifs = async (query) => {
    if (!query.trim()) { setGifResults([]); return; }
    setGifLoading(true);
    try {
      const response = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&client_key=simple_messaging_app&limit=20`);
      const data = await response.json();
      setGifResults(data.results || []);
    } catch (error) { setGifResults([]); }
    setGifLoading(false);
  };

  const loadTrendingGifs = async () => {
    setGifLoading(true);
    try {
      const response = await fetch(`https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&client_key=simple_messaging_app&limit=20`);
      const data = await response.json();
      setGifResults(data.results || []);
    } catch (error) { setGifResults([]); }
    setGifLoading(false);
  };

  const sendGif = (gifUrl) => {
    if (!currentChat) return;
    sendMessage('', gifUrl);
    setShowGifPicker(false);
    setGifSearch('');
    setGifResults([]);
  };

  const insertEmoji = (emoji) => {
    setMessageInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // ============ GAMES ============
  const gameTypes = [
    { id: 'tictactoe', name: 'Tic Tac Toe', icon: '⭕', players: 2 },
    { id: 'connect4', name: 'Connect 4', icon: '🔴', players: 2 },
    { id: 'rps', name: 'Rock Paper Scissors', icon: '✊', players: 2 },
    { id: 'coinflip', name: 'Coin Flip', icon: '🪙', players: 2 },
    { id: 'numberguess', name: 'Number Guess', icon: '🎯', players: 2 },
    { id: 'chopsticks', name: 'Chopsticks', icon: '🖐️', players: 2 }
  ];

  const sendGameInvite = (gameType) => {
    if (!currentChat) return;
    if (currentChat.type === 'group') {
      showToast('Games are only available in direct messages', 'error');
      setShowGamePicker(false);
      return;
    }

    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const game = gameTypes.find(g => g.id === gameType);
    if (!game) return;

    const gameMessage = {
      text: '',
      game: {
        id: gameId,
        type: gameType,
        name: game.name,
        icon: game.icon,
        players: [userName, currentChat.name],
        currentTurn: userName,
        state: initializeGameState(gameType),
        status: 'active',
        winner: null
      },
      sent: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('sendMessage', {
      chatId: currentChat.id,
      chatType: currentChat.type,
      recipient: currentChat.name,
      message: gameMessage
    });

    setShowGamePicker(false);
    showToast(`Starting ${game.name}...`, 'info');
  };

  const startRematch = () => {
    if (!activeGame || !currentChat) return;
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const game = gameTypes.find(g => g.id === activeGame.type);

    const gameMessage = {
      text: '',
      game: {
        id: gameId,
        type: activeGame.type,
        name: game.name,
        icon: game.icon,
        players: activeGame.players,
        currentTurn: userName,
        state: initializeGameState(activeGame.type),
        status: 'active',
        winner: null
      },
      sent: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const recipient = activeGame.players.find(p => p.toLowerCase() !== userName.toLowerCase());
    socket.emit('sendMessage', {
      chatId: activeGame.chatId,
      chatType: 'contact',
      recipient,
      message: gameMessage
    });

    setActiveGame(null);
    showToast('Rematch started!', 'success');
  };

  const initializeGameState = (gameType) => {
    switch (gameType) {
      case 'tictactoe': return { board: Array(9).fill(null) };
      case 'connect4': return { board: Array(42).fill(null) };
      case 'rps': return { choices: {} };
      case 'coinflip': return { calls: {}, result: null };
      case 'numberguess': return { picker: Math.random() < 0.5 ? 0 : 1, secretNumber: null, guesses: [], hint: null };
      case 'chopsticks': return { hands: { 0: { left: 1, right: 1 }, 1: { left: 1, right: 1 } }, selectedHand: null };
      default: return {};
    }
  };

  const openGame = (game, chatId) => setActiveGame({ ...game, chatId });

  const makeGameMove = (move) => {
    if (!activeGame) return;
    const updatedGame = JSON.parse(JSON.stringify(activeGame));
    const isPlayer1 = activeGame.players[0].toLowerCase() === userName.toLowerCase();
    const playerSymbol = isPlayer1 ? 'X' : 'O';

    switch (activeGame.type) {
      case 'tictactoe': {
        if (updatedGame.state.board[move] !== null) return;
        if (updatedGame.currentTurn.toLowerCase() !== userName.toLowerCase()) { showToast("It's not your turn!", 'error'); return; }
        updatedGame.state.board[move] = playerSymbol;
        const winner = checkTicTacToeWinner(updatedGame.state.board);
        if (winner) { updatedGame.status = 'finished'; updatedGame.winner = winner === 'draw' ? 'draw' : userName; }
        else { updatedGame.currentTurn = activeGame.players.find(p => p.toLowerCase() !== userName.toLowerCase()); }
        break;
      }
      case 'connect4': {
        if (updatedGame.currentTurn.toLowerCase() !== userName.toLowerCase()) { showToast("It's not your turn!", 'error'); return; }
        const col = move;
        let row = -1;
        for (let r = 5; r >= 0; r--) { if (updatedGame.state.board[r * 7 + col] === null) { row = r; break; } }
        if (row === -1) return;
        updatedGame.state.board[row * 7 + col] = playerSymbol;
        const winner = checkConnect4Winner(updatedGame.state.board);
        if (winner) { updatedGame.status = 'finished'; updatedGame.winner = winner === 'draw' ? 'draw' : userName; }
        else { updatedGame.currentTurn = activeGame.players.find(p => p.toLowerCase() !== userName.toLowerCase()); }
        break;
      }
      case 'rps': {
        if (updatedGame.state.choices[userName.toLowerCase()]) { showToast("You already made your choice!", 'error'); return; }
        updatedGame.state.choices[userName.toLowerCase()] = move;
        const player1 = activeGame.players[0].toLowerCase();
        const player2 = activeGame.players[1].toLowerCase();
        if (updatedGame.state.choices[player1] && updatedGame.state.choices[player2]) {
          const result = getRPSWinner(updatedGame.state.choices[player1], updatedGame.state.choices[player2]);
          updatedGame.status = 'finished';
          if (result === 0) updatedGame.winner = 'draw';
          else updatedGame.winner = result === 1 ? activeGame.players[0] : activeGame.players[1];
        }
        break;
      }
      case 'coinflip': {
        if (updatedGame.state.calls[userName.toLowerCase()]) { showToast("You already made your call!", 'error'); return; }
        updatedGame.state.calls[userName.toLowerCase()] = move;
        const player1 = activeGame.players[0].toLowerCase();
        const player2 = activeGame.players[1].toLowerCase();
        if (updatedGame.state.calls[player1] && updatedGame.state.calls[player2]) {
          const coinResult = Math.random() < 0.5 ? 'heads' : 'tails';
          updatedGame.state.result = coinResult;
          updatedGame.status = 'finished';
          const p1Call = updatedGame.state.calls[player1];
          const p2Call = updatedGame.state.calls[player2];
          if (p1Call === coinResult && p2Call !== coinResult) updatedGame.winner = activeGame.players[0];
          else if (p2Call === coinResult && p1Call !== coinResult) updatedGame.winner = activeGame.players[1];
          else updatedGame.winner = 'draw';
        }
        break;
      }
      case 'numberguess': {
        const pickerIndex = activeGame.state.picker;
        const guesserIndex = pickerIndex === 0 ? 1 : 0;
        const isPicker = activeGame.players[pickerIndex].toLowerCase() === userName.toLowerCase();
        if (isPicker) {
          if (updatedGame.state.secretNumber !== null) { showToast("You already picked your number!", 'error'); return; }
          updatedGame.state.secretNumber = move;
        } else {
          if (updatedGame.state.secretNumber === null) { showToast("Waiting for the other player to pick a number!", 'error'); return; }
          updatedGame.state.guesses.push(move);
          if (move === updatedGame.state.secretNumber) {
            updatedGame.status = 'finished';
            updatedGame.winner = activeGame.players[guesserIndex];
            updatedGame.state.hint = 'correct';
          } else if (move < updatedGame.state.secretNumber) { updatedGame.state.hint = 'higher'; }
          else { updatedGame.state.hint = 'lower'; }
        }
        break;
      }
      case 'chopsticks': {
        if (updatedGame.currentTurn.toLowerCase() !== userName.toLowerCase()) { showToast("It's not your turn!", 'error'); return; }
        const myIndex = activeGame.players[0].toLowerCase() === userName.toLowerCase() ? 0 : 1;
        const opponentIndex = myIndex === 0 ? 1 : 0;
        const myHands = updatedGame.state.hands[myIndex];
        const opponentHands = updatedGame.state.hands[opponentIndex];

        if (move.type === 'tap') {
          const myFingers = myHands[move.myHand];
          const theirFingers = opponentHands[move.theirHand];
          if (myFingers === 0) { showToast("You can't tap with a dead hand!", 'error'); return; }
          if (theirFingers === 0) { showToast("You can't tap a dead hand!", 'error'); return; }
          let newFingers = theirFingers + myFingers;
          if (newFingers >= 5) newFingers = 0;
          updatedGame.state.hands[opponentIndex][move.theirHand] = newFingers;
        } else if (move.type === 'split') {
          const totalFingers = myHands.left + myHands.right;
          if (move.left + move.right !== totalFingers) { showToast("Invalid split!", 'error'); return; }
          if (move.left < 0 || move.right < 0 || move.left > 4 || move.right > 4) { showToast("Invalid split!", 'error'); return; }
          if (move.left === myHands.left && move.right === myHands.right) { showToast("Split must change configuration!", 'error'); return; }
          updatedGame.state.hands[myIndex].left = move.left;
          updatedGame.state.hands[myIndex].right = move.right;
        }

        const oppHands = updatedGame.state.hands[opponentIndex];
        const myNewHands = updatedGame.state.hands[myIndex];
        if (oppHands.left === 0 && oppHands.right === 0) { updatedGame.status = 'finished'; updatedGame.winner = activeGame.players[myIndex]; }
        else if (myNewHands.left === 0 && myNewHands.right === 0) { updatedGame.status = 'finished'; updatedGame.winner = activeGame.players[opponentIndex]; }
        else { updatedGame.currentTurn = activeGame.players.find(p => p.toLowerCase() !== userName.toLowerCase()); }
        updatedGame.state.selectedHand = null;
        break;
      }
    }

    socket.emit('updateGame', { chatId: activeGame.chatId, gameId: activeGame.id, game: updatedGame });
    setActiveGame(updatedGame);
  };

  const checkTicTacToeWinner = (board) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) { if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]; }
    if (board.every(cell => cell !== null)) return 'draw';
    return null;
  };

  const checkConnect4Winner = (board) => {
    for (let r = 0; r < 6; r++) { for (let c = 0; c < 4; c++) { const i = r*7+c; if (board[i] && board[i]===board[i+1] && board[i]===board[i+2] && board[i]===board[i+3]) return board[i]; } }
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 7; c++) { const i = r*7+c; if (board[i] && board[i]===board[i+7] && board[i]===board[i+14] && board[i]===board[i+21]) return board[i]; } }
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 4; c++) { const i = r*7+c; if (board[i] && board[i]===board[i+8] && board[i]===board[i+16] && board[i]===board[i+24]) return board[i]; } }
    for (let r = 0; r < 3; r++) { for (let c = 3; c < 7; c++) { const i = r*7+c; if (board[i] && board[i]===board[i+6] && board[i]===board[i+12] && board[i]===board[i+18]) return board[i]; } }
    if (board.every(cell => cell !== null)) return 'draw';
    return null;
  };

  const getRPSWinner = (c1, c2) => {
    if (c1 === c2) return 0;
    if ((c1==='rock'&&c2==='scissors')||(c1==='paper'&&c2==='rock')||(c1==='scissors'&&c2==='paper')) return 1;
    return -1;
  };

  const renderMessageText = (text) => {
    const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]"'])/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (<a key={index} href={part} target="_blank" rel="noopener noreferrer" className="message-link" onClick={(e) => e.stopPropagation()}>{part}</a>);
      }
      return part;
    });
  };

  // ============ RENDER: LOGIN SCREEN ============
  if (!isLoggedIn) {
    const isSupremeLogin = loginType === 'supreme';

    return (
      <div className={`login-screen ${isSupremeLogin ? 'supreme-login' : ''}`}>
        <div className={`login-box ${isSupremeLogin ? 'supreme-box' : ''}`}>
          {isSupremeLogin ? (
            <>
              <div className="supreme-logo">W</div>
              <h1 className="supreme-title">Supreme Access</h1>
              <p className="supreme-subtitle">Authorized personnel only</p>
            </>
          ) : (
            <>
              <h1>Messages</h1>
              <p>
                {loginStep === 'name' && 'Enter your name to get started'}
                {loginStep === 'password' && `Welcome back, ${nameInput.trim()}`}
                {loginStep === 'spaceCode' && `Hi ${nameInput.trim()}, enter your space code`}
              </p>
            </>
          )}

          {loginStep === 'name' && (
            <input
              type="text"
              className="login-input"
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value); setAuthError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckName()}
              placeholder="Your name"
              autoFocus
            />
          )}

          {loginStep === 'password' && (
            <>
              <div className="login-name-display">{nameInput.trim()}</div>
              <input
                type="password"
                className={`login-input ${isSupremeLogin ? 'supreme-input' : ''}`}
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()}
                placeholder="Password"
                autoFocus
              />
            </>
          )}

          {loginStep === 'spaceCode' && (
            <>
              <div className="login-name-display">{nameInput.trim()}</div>
              <input
                type="text"
                className="login-input space-code-input"
                value={spaceCodeInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setSpaceCodeInput(val);
                  setAuthError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSpaceCodeLogin()}
                placeholder="5-digit space code"
                autoFocus
                maxLength={5}
              />
            </>
          )}

          {authError && <div className="error-message">{authError}</div>}

          <div className="login-actions">
            {loginStep !== 'name' && (
              <button className="login-back-btn" onClick={() => {
                setLoginStep('name');
                setLoginType(null);
                setPasswordInput('');
                setSpaceCodeInput('');
                setAuthError('');
              }}>
                Back
              </button>
            )}
            <button
              className={`login-btn ${isSupremeLogin ? 'supreme-btn' : ''}`}
              onClick={() => {
                if (loginStep === 'name') handleCheckName();
                else if (loginStep === 'password') handlePasswordLogin();
                else if (loginStep === 'spaceCode') handleSpaceCodeLogin();
              }}
              disabled={isAuthenticating}
            >
              {isAuthenticating ? 'Connecting...' : (
                loginStep === 'name' ? 'Continue' :
                loginStep === 'password' ? 'Login' :
                'Join Space'
              )}
            </button>
          </div>

          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected to server' : 'Connecting to server...'}
          </div>
        </div>
      </div>
    );
  }

  // ============ RENDER: SUPREME DASHBOARD ============
  if (userRole === 'supreme') {
    return (
      <div className="supreme-dashboard">
        <div className="toast-container">
          {toasts.map(toast => (<div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>))}
        </div>

        <div className="supreme-header">
          <div className="supreme-header-left">
            <div className="supreme-logo-small">W</div>
            <h2>Supreme Dashboard</h2>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>

        <div className="supreme-content">
          {/* Spaces List */}
          <div className="supreme-sidebar">
            <div className="supreme-sidebar-header">
              <h3>Spaces ({allSpaces.length})</h3>
              <button className="supreme-add-btn" onClick={() => { setShowCreateSpace(true); setSupremeError(''); }}>+ New Space</button>
            </div>
            <div className="supreme-space-list">
              {allSpaces.map(space => (
                <div
                  key={space.code}
                  className={`supreme-space-item ${selectedSpace === space.code ? 'active' : ''}`}
                  onClick={() => viewSpaceDetails(space.code)}
                >
                  <div className="supreme-space-name">{space.name}</div>
                  <div className="supreme-space-meta">
                    Code: {space.code} | {space.memberCount} members | Admin: {space.adminName}
                  </div>
                </div>
              ))}
              {allSpaces.length === 0 && (
                <div className="supreme-empty">No spaces yet. Create one to get started.</div>
              )}
            </div>
          </div>

          {/* Space Details */}
          <div className="supreme-main">
            {showCreateSpace ? (
              <div className="supreme-create-form">
                <h3>Create New Space</h3>
                <input
                  type="text"
                  className="modal-input"
                  value={createSpaceForm.name}
                  onChange={(e) => setCreateSpaceForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Space name (e.g., School, Friends)"
                />
                <input
                  type="text"
                  className="modal-input"
                  value={createSpaceForm.adminName}
                  onChange={(e) => setCreateSpaceForm(prev => ({ ...prev, adminName: e.target.value }))}
                  placeholder="Admin username"
                />
                <input
                  type="password"
                  className="modal-input"
                  value={createSpaceForm.adminPassword}
                  onChange={(e) => setCreateSpaceForm(prev => ({ ...prev, adminPassword: e.target.value }))}
                  placeholder="Admin password"
                />
                {supremeError && <div className="error-message">{supremeError}</div>}
                <div className="modal-buttons">
                  <button className="modal-btn cancel" onClick={() => { setShowCreateSpace(false); setSupremeError(''); }}>Cancel</button>
                  <button className="modal-btn confirm" onClick={handleCreateSpace}>Create Space</button>
                </div>
              </div>
            ) : spaceDetails ? (
              <div className="supreme-space-details">
                <div className="supreme-detail-header">
                  <div>
                    <h3>{spaceDetails.name}</h3>
                    <div className="supreme-detail-meta">Code: <strong>{spaceDetails.code}</strong> | Admin: <strong>{spaceDetails.adminName}</strong></div>
                  </div>
                  <button className="modal-btn danger" onClick={() => handleDeleteSpace(spaceDetails.code)}>Delete Space</button>
                </div>

                {supremeViewChat ? (
                  <div className="supreme-chat-view">
                    <button className="login-back-btn" onClick={() => { setSupremeViewChat(null); setSupremeChatMessages([]); }}>Back to Space</button>
                    <h4>Chat: {supremeViewChat}</h4>
                    <div className="supreme-messages">
                      {supremeChatMessages.map((msg, idx) => (
                        <div key={idx} className="supreme-message">
                          <strong>{msg.sender}:</strong> {msg.image ? '[Image]' : ''} {msg.text}
                          <span className="supreme-msg-time">{msg.time}</span>
                        </div>
                      ))}
                      {supremeChatMessages.length === 0 && <div className="supreme-empty">No messages in this chat</div>}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="supreme-section">
                      <h4>Members ({spaceDetails.members.length})</h4>
                      <div className="supreme-member-list">
                        {spaceDetails.members.map(member => (
                          <div key={member.name} className="supreme-member">
                            <span className={`supreme-status-dot ${member.online ? 'online' : ''}`}></span>
                            <span>{member.name}</span>
                            <span className="supreme-role-badge">{member.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {spaceDetails.banned.length > 0 && (
                      <div className="supreme-section">
                        <h4>Banned Users</h4>
                        <div className="supreme-banned-list">
                          {spaceDetails.banned.map(name => (
                            <span key={name} className="supreme-banned-tag">{name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="supreme-section">
                      <h4>Group Chats</h4>
                      <div className="supreme-chat-list">
                        {spaceDetails.groups.map(group => (
                          <div key={group.id} className="supreme-chat-item" onClick={() => viewChat(`group_${group.id}`)}>
                            <span>{group.isMainGroup ? '(Main) ' : ''}{group.name}</span>
                            <span className="supreme-chat-members">{group.members.length} members</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="supreme-section">
                      <h4>Direct Messages</h4>
                      <div className="supreme-chat-list">
                        {spaceDetails.dmChats.map(dm => (
                          <div key={dm.chatId} className="supreme-chat-item" onClick={() => viewChat(dm.chatId)}>
                            <span>{dm.user1} & {dm.user2}</span>
                            <span className="supreme-chat-members">{dm.messageCount} messages</span>
                          </div>
                        ))}
                        {spaceDetails.dmChats.length === 0 && <div className="supreme-empty">No DMs yet</div>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="supreme-welcome">
                <h3>Select a space to view details</h3>
                <p>Or create a new space to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ RENDER: MAIN APP (regular users and admins) ============
  const currentGroup = currentChat?.type === 'group' ? groups.find(g => g.id === currentChat.groupId) : null;
  const isGroupManager = currentGroup?.creator?.toLowerCase() === userName.toLowerCase();

  return (
    <div className="container">
      <div className="toast-container">
        {toasts.map(toast => (<div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>))}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Sidebar */}
      <div className={`sidebar ${mobileShowChat ? 'hidden-mobile' : ''}`}>
        <div className="sidebar-header">
          <div className="user-info">
            <div className="avatar" style={{ width: 35, height: 35, fontSize: '1rem' }}>
              {userAvatar ? <img src={userAvatar} alt={userName} /> : userName.charAt(0).toUpperCase()}
            </div>
            <div className="user-header-info">
              <span className="user-name">{userName}</span>
              {spaceName && <span className="space-name-tag">{spaceName}</span>}
            </div>
          </div>
          <div className="header-buttons">
            {userRole === 'admin' && (
              <button className="settings-btn admin-btn" onClick={() => {
                socket.emit('getSpaceInfo', null, (res) => {
                  if (res.success) setSpaceInfo(res.spaceInfo);
                });
                setShowSpaceSettings(true);
              }} title="Space Settings">
                🛡️
              </button>
            )}
            <button className="settings-btn" onClick={openSettingsModal} title="Settings">
              ⚙️
            </button>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <div className="header-buttons" style={{ padding: '10px 15px', background: 'var(--bg-light)' }}>
          <button className="header-btn" style={{ background: 'var(--primary)', borderRadius: '5px' }} onClick={() => {
            if (contacts.length === 0) {
              showToast('No other members in your space yet!', 'info');
              return;
            }
            setShowGroupModal(true);
          }}>+ Group</button>
        </div>

        <div className="tabs">
          <button className={`tab ${currentTab === 'contacts' ? 'active' : ''}`} onClick={() => setCurrentTab('contacts')}>
            Contacts
            {(() => {
              const unreadContacts = contacts.filter(c => unreadMessages[getChatId(c.name)] > 0).length;
              return unreadContacts > 0 ? <span className="tab-badge">{unreadContacts}</span> : null;
            })()}
          </button>
          <button className={`tab ${currentTab === 'groups' ? 'active' : ''}`} onClick={() => setCurrentTab('groups')}>
            Groups
            {(() => {
              const unreadGroups = groups.filter(g => unreadMessages[`group_${g.id}`] > 0).length;
              return unreadGroups > 0 ? <span className="tab-badge">{unreadGroups}</span> : null;
            })()}
          </button>
        </div>
        <div className="contact-list">
          {currentTab === 'contacts' ? (
            contacts.length === 0 ? (
              <div className="empty-list">No other members in your space yet. Share the space code to invite people!</div>
            ) : (
              contacts.map(contact => {
                const contactChatId = getChatId(contact.name);
                const unreadCount = unreadMessages[contactChatId] || 0;
                return (
                  <div key={contact.name} className={`contact-item ${currentChat?.name === contact.name && currentChat?.type === 'contact' ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`} onClick={() => openChat('contact', contact)}>
                    <div className="avatar">
                      {contact.avatar ? <img src={contact.avatar} alt={contact.name} /> : contact.name.charAt(0).toUpperCase()}
                      <span className={`status-dot ${contact.online ? 'online' : 'offline'}`}></span>
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">{contact.name}</div>
                      <div className="last-message">{getLastMessage(contactChatId)}</div>
                    </div>
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                  </div>
                );
              })
            )
          ) : (
            groups.length === 0 ? (
              <div className="empty-list">No groups yet</div>
            ) : (
              groups.map(group => {
                const groupChatId = `group_${group.id}`;
                const unreadCount = unreadMessages[groupChatId] || 0;
                return (
                  <div key={group.id} className={`contact-item ${currentChat?.groupId === group.id ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`} onClick={() => openChat('group', group)}>
                    <div className="avatar group-avatar">
                      {group.avatar ? <img src={group.avatar} alt={group.name} /> : group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">
                        {group.isMainGroup && <span className="main-group-badge">Main</span>}
                        {group.name}
                      </div>
                      <div className="last-message">{getLastMessage(groupChatId)}</div>
                    </div>
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                    {!group.isMainGroup && group.creator.toLowerCase() === userName.toLowerCase() && (
                      <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}>X</button>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        {!currentChat ? (
          <div className="no-chat">
            <h3>Welcome, {userName}!</h3>
            <p>Select a contact or group to start chatting</p>
            {spaceName && <p className="space-info-text">Space: {spaceName}</p>}
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button className="mobile-back-btn" onClick={handleMobileBack}>←</button>
              <div className={`avatar ${currentChat.type === 'group' ? 'group-avatar' : ''}`}>
                {currentChat.avatar ? <img src={currentChat.avatar} alt={currentChat.name} /> : currentChat.name?.charAt(0).toUpperCase()}
                {currentChat.type === 'contact' && (
                  <span className={`status-dot ${currentChat.online ? 'online' : 'offline'}`}></span>
                )}
              </div>
              <div className="chat-header-info">
                <div className="contact-name">{currentChat.name}</div>
                {currentChat.type === 'contact' && (
                  <div className="status-text">{currentChat.online ? 'Online' : 'Offline'}</div>
                )}
                {currentChat.type === 'group' && (
                  <div className="status-text">{currentChat.members?.length} members</div>
                )}
              </div>
              {currentChat.type === 'group' && (
                <button className="group-info-btn" onClick={openGroupSettingsModal} title="Group settings">
                  <img src={userTheme === 'dark' ? infoIconDark : infoIcon} alt="Info" className="info-icon" />
                </button>
              )}
            </div>
            <div className="chat-messages">
              {(messages[currentChat.id] || []).map((msg, idx) => (
                <div key={idx} className={`message-wrapper ${msg.sent ? 'sent' : 'received'} ${!msg.sent && currentChat.type === 'group' ? 'group-message' : ''}`}>
                  {!msg.sent && currentChat.type === 'group' && (
                    <div className="message-avatar">
                      {getMemberAvatar(msg.sender) ? (
                        <img src={getMemberAvatar(msg.sender)} alt={msg.sender} />
                      ) : msg.sender?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="message-content-wrapper">
                    <div className={`message ${msg.sent ? 'sent' : 'received'}`}>
                      {!msg.sent && currentChat.type === 'group' && (
                        <div className="message-sender">{msg.sender}</div>
                      )}
                      {msg.image && (
                        <img src={msg.image} alt="Shared" className="message-image" onClick={() => window.open(msg.image, '_blank')} />
                      )}
                      {msg.game && (
                        <div className={`game-invite ${msg.game.status}`}>
                          <div className="game-invite-icon">{msg.game.icon}</div>
                          <div className="game-invite-info">
                            <div className="game-invite-name">{msg.game.name}</div>
                            <div className="game-invite-status">
                              {msg.game.status === 'finished'
                                ? msg.game.winner === 'draw' ? "It's a draw!" : `${msg.game.winner} wins!`
                                : `${msg.game.currentTurn}'s turn`}
                            </div>
                          </div>
                          <button className="game-invite-btn" onClick={() => openGame(msg.game, currentChat.id)}>
                            {msg.game.status === 'active' ? `Start ${msg.game.name}` : 'View Result'}
                          </button>
                        </div>
                      )}
                      {msg.text && <div className="message-text">{renderMessageText(msg.text)}</div>}
                    </div>
                    <div className="message-time">
                      {msg.timestamp ? formatMessageTime(msg.timestamp) : msg.time}
                      {msg.sent && (() => {
                        const seenOthers = (msg.seenBy || []).filter(n => n.toLowerCase() !== username.toLowerCase());
                        if (seenOthers.length === 0) return null;
                        if (currentChat.type === 'contact') {
                          return <span className="seen-indicator"> · Seen</span>;
                        }
                        return <span className="seen-indicator"> · Seen by {seenOthers.join(', ')}</span>;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {getTypingText(currentChat.id) && (
              <div className="typing-indicator">
                <div className="typing-dots"><span></span><span></span><span></span></div>
                {getTypingText(currentChat.id)}
              </div>
            )}
            <div className="chat-input-area">
              {isUploading && (
                <div className="upload-progress-container">
                  <div className="upload-progress-bar">
                    <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="upload-progress-text">Uploading... {uploadProgress}%</span>
                </div>
              )}
              <div className="chat-input-row">
                <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" style={{ display: 'none' }} />
                <button className="mobile-attach-toggle input-btn" onClick={() => setShowMobileAttach(!showMobileAttach)} title="Attachments">
                  {showMobileAttach ? '×' : '+'}
                </button>
                <div className={`input-btns-group ${showMobileAttach ? 'show' : ''}`}>
                <button className="input-btn" onClick={() => fileInputRef.current?.click()} title="Send image" disabled={isUploading}>
                  <img src={userTheme === 'dark' ? cameraIconDark : cameraIcon} alt="Camera" className="input-icon" />
                </button>
                <button className="input-btn" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); setShowGamePicker(false); }} title="Emoji" disabled={isUploading}>
                  <img src={userTheme === 'dark' ? emojiIconDark : emojiIcon} alt="Emoji" className="input-icon" />
                </button>
                <div className="picker-btn-wrapper">
                  <button className="input-btn" onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); setShowGamePicker(false); if (!showGifPicker) loadTrendingGifs(); }} title="GIF" disabled={isUploading}>
                    <img src={userTheme === 'dark' ? gifIconDark : gifIcon} alt="GIF" className="input-icon" />
                  </button>
                  {showGifPicker && (
                    <div className="picker-popup gif-picker">
                      <div className="picker-header">
                        <span>GIFs</span>
                        <button className="picker-close" onClick={() => setShowGifPicker(false)}>×</button>
                      </div>
                      <div className="gif-search">
                        <input type="text" value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchGifs(gifSearch)} placeholder="Search GIFs..." />
                        <button onClick={() => searchGifs(gifSearch)}>Search</button>
                      </div>
                      <div className="gif-grid">
                        {gifLoading ? (<div className="gif-loading">Loading...</div>) : gifResults.length === 0 ? (<div className="gif-empty">No GIFs found</div>) : (
                          gifResults.map((gif) => (
                            <img key={gif.id} src={gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url} alt={gif.content_description} className="gif-item" onClick={() => sendGif(gif.media_formats?.gif?.url)} />
                          ))
                        )}
                      </div>
                      <div className="gif-attribution">Powered by Tenor</div>
                    </div>
                  )}
                </div>
                <div className="picker-btn-wrapper">
                  <button className="input-btn" onClick={() => { setShowGamePicker(!showGamePicker); setShowEmojiPicker(false); setShowGifPicker(false); }} title="Games" disabled={isUploading || currentChat?.type === 'group'}>
                    <img src={userTheme === 'dark' ? gamesIconDark : gamesIcon} alt="Games" className="input-icon" />
                  </button>
                  {showGamePicker && (
                    <div className="picker-popup game-picker">
                      <div className="picker-header">
                        <span>Games</span>
                        <button className="picker-close" onClick={() => setShowGamePicker(false)}>×</button>
                      </div>
                      <div className="game-list">
                        {gameTypes.map(game => (
                          <div key={game.id} className="game-option" onClick={() => sendGameInvite(game.id)}>
                            <span className="game-option-icon">{game.icon}</span>
                            <span className="game-option-name">{game.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </div>
                <input type="text" className="chat-input" value={messageInput} onChange={(e) => { setMessageInput(e.target.value); handleTyping(); }} onKeyDown={(e) => e.key === 'Enter' && !isUploading && sendMessage()} onPaste={handlePaste} placeholder={isUploading ? "Uploading image..." : "Type a message..."} disabled={isUploading} />
                <button className="send-btn" onClick={() => sendMessage()} disabled={isUploading}>Send</button>
              </div>

              {showEmojiPicker && (
                <div className="picker-popup emoji-picker">
                  <div className="picker-header">
                    <span>Emojis</span>
                    <button className="picker-close" onClick={() => { setShowEmojiPicker(false); setEmojiSearch(''); }}>×</button>
                  </div>
                  <div className="emoji-search">
                    <input type="text" value={emojiSearch} onChange={(e) => setEmojiSearch(e.target.value)} placeholder="Search emojis..." autoFocus />
                  </div>
                  <div className="emoji-grid-container">
                    {getFilteredEmojis().length === 0 ? (
                      <div className="emoji-empty">No emojis found</div>
                    ) : (
                      <div className="emoji-grid">
                        {getFilteredEmojis().map((item, idx) => (
                          <button key={idx} className="emoji-btn" onClick={() => { insertEmoji(item.emoji); setEmojiSearch(''); }} title={item.keywords}>{item.emoji}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Game Modal */}
      {activeGame && (
        <div className="modal-overlay" onClick={() => setActiveGame(null)}>
          <div className="modal game-modal" onClick={(e) => e.stopPropagation()}>
            <div className="game-modal-header">
              <h3>{activeGame.name}</h3>
              <button className="picker-close" onClick={() => setActiveGame(null)}>×</button>
            </div>
            <div className="game-players">
              <span className={activeGame.currentTurn?.toLowerCase() === activeGame.players[0]?.toLowerCase() ? 'active-player' : ''}>{activeGame.players[0]} (X)</span>
              <span>vs</span>
              <span className={activeGame.currentTurn?.toLowerCase() === activeGame.players[1]?.toLowerCase() ? 'active-player' : ''}>{activeGame.players[1]} (O)</span>
            </div>

            {activeGame.status === 'finished' && (
              <div className={`game-result-banner ${activeGame.winner === 'draw' ? 'draw' : activeGame.winner?.toLowerCase() === userName.toLowerCase() ? 'won' : 'lost'}`}>
                {activeGame.winner === 'draw' ? "It's a Draw!" : activeGame.winner?.toLowerCase() === userName.toLowerCase() ? "You Won!" : "You Lost!"}
              </div>
            )}

            {activeGame.type === 'tictactoe' && (
              <div className="tictactoe-board">
                {activeGame.state.board.map((cell, idx) => (
                  <button key={idx} className={`tictactoe-cell ${cell}`} onClick={() => makeGameMove(idx)} disabled={activeGame.status === 'finished' || cell !== null}>{cell}</button>
                ))}
              </div>
            )}

            {activeGame.type === 'connect4' && (
              <div className="connect4-board">
                <div className="connect4-columns">
                  {[0,1,2,3,4,5,6].map(col => (<button key={col} className="connect4-drop" onClick={() => makeGameMove(col)} disabled={activeGame.status === 'finished'}>↓</button>))}
                </div>
                <div className="connect4-grid">
                  {activeGame.state.board.map((cell, idx) => (<div key={idx} className={`connect4-cell ${cell ? (cell === 'X' ? 'red' : 'yellow') : ''}`} />))}
                </div>
              </div>
            )}

            {activeGame.type === 'rps' && (
              <div className="rps-game">
                {activeGame.status === 'active' ? (
                  activeGame.state.choices[userName.toLowerCase()] ? (
                    <div className="rps-waiting"><p>You chose: {activeGame.state.choices[userName.toLowerCase()]}</p><p>Waiting for opponent...</p></div>
                  ) : (
                    <div className="rps-choices">
                      <button className="rps-btn" onClick={() => makeGameMove('rock')}><span>✊</span><span>Rock</span></button>
                      <button className="rps-btn" onClick={() => makeGameMove('paper')}><span>✋</span><span>Paper</span></button>
                      <button className="rps-btn" onClick={() => makeGameMove('scissors')}><span>✌️</span><span>Scissors</span></button>
                    </div>
                  )
                ) : (
                  <div className="rps-result">
                    <div className="rps-final">
                      <div className="rps-player-choice">
                        <span>{activeGame.players[0]}</span>
                        <span className="rps-choice-icon">
                          {activeGame.state.choices[activeGame.players[0].toLowerCase()] === 'rock' && '✊'}
                          {activeGame.state.choices[activeGame.players[0].toLowerCase()] === 'paper' && '✋'}
                          {activeGame.state.choices[activeGame.players[0].toLowerCase()] === 'scissors' && '✌️'}
                        </span>
                      </div>
                      <div className="rps-vs">VS</div>
                      <div className="rps-player-choice">
                        <span>{activeGame.players[1]}</span>
                        <span className="rps-choice-icon">
                          {activeGame.state.choices[activeGame.players[1].toLowerCase()] === 'rock' && '✊'}
                          {activeGame.state.choices[activeGame.players[1].toLowerCase()] === 'paper' && '✋'}
                          {activeGame.state.choices[activeGame.players[1].toLowerCase()] === 'scissors' && '✌️'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeGame.type === 'coinflip' && (
              <div className="coinflip-game">
                {activeGame.status === 'active' ? (
                  activeGame.state.calls[userName.toLowerCase()] ? (
                    <div className="coinflip-waiting"><p>You called: <strong>{activeGame.state.calls[userName.toLowerCase()]}</strong></p><p>Waiting for opponent...</p></div>
                  ) : (
                    <div className="coinflip-choices">
                      <p>Call it!</p>
                      <div className="coinflip-buttons">
                        <button className="coinflip-btn" onClick={() => makeGameMove('heads')}><span>🪙</span><span>Heads</span></button>
                        <button className="coinflip-btn" onClick={() => makeGameMove('tails')}><span>🪙</span><span>Tails</span></button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="coinflip-result">
                    <div className="coinflip-coin"><span>🪙</span><p>The coin landed on: <strong>{activeGame.state.result}</strong></p></div>
                    <div className="coinflip-final">
                      <div className="coinflip-player-call"><span>{activeGame.players[0]}</span><span className="coinflip-call">{activeGame.state.calls[activeGame.players[0].toLowerCase()]}</span></div>
                      <div className="coinflip-vs">VS</div>
                      <div className="coinflip-player-call"><span>{activeGame.players[1]}</span><span className="coinflip-call">{activeGame.state.calls[activeGame.players[1].toLowerCase()]}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeGame.type === 'numberguess' && (
              <div className="numberguess-game">
                {(() => {
                  const pickerIndex = activeGame.state.picker;
                  const guesserIndex = pickerIndex === 0 ? 1 : 0;
                  const isPicker = activeGame.players[pickerIndex].toLowerCase() === userName.toLowerCase();
                  const pickerName = activeGame.players[pickerIndex];
                  const guesserName = activeGame.players[guesserIndex];

                  if (activeGame.status === 'active') {
                    if (isPicker) {
                      if (activeGame.state.secretNumber === null) {
                        return (
                          <div className="numberguess-picker">
                            <p>You're the picker! Choose a number (1-50):</p>
                            <div className="numberguess-grid">
                              {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                                <button key={num} className="numberguess-btn" onClick={() => makeGameMove(num)}>{num}</button>
                              ))}
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="numberguess-watching">
                            <p>Your number: <strong>{activeGame.state.secretNumber}</strong></p>
                            <p className="numberguess-watching-label">{guesserName}'s guesses:</p>
                            {activeGame.state.guesses.length === 0 ? (
                              <p className="numberguess-waiting">Waiting for {guesserName} to guess...</p>
                            ) : (
                              <div className="numberguess-guess-list">
                                {activeGame.state.guesses.map((guess, idx) => (
                                  <span key={idx} className={`numberguess-guess ${guess < activeGame.state.secretNumber ? 'low' : 'high'}`}>
                                    {guess} {guess < activeGame.state.secretNumber ? '↑' : '↓'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                    } else {
                      if (activeGame.state.secretNumber === null) {
                        return (<div className="numberguess-waiting-picker"><p>Waiting for {pickerName} to pick a number...</p></div>);
                      } else {
                        return (
                          <div className="numberguess-guesser">
                            <p>Guess the number (1-50)!</p>
                            {activeGame.state.guesses.length > 0 && (
                              <div className="numberguess-hint">
                                <span>Last guess: <strong>{activeGame.state.guesses[activeGame.state.guesses.length - 1]}</strong></span>
                                <span className={`numberguess-hint-text ${activeGame.state.hint}`}>Go {activeGame.state.hint}!</span>
                              </div>
                            )}
                            <div className="numberguess-grid">
                              {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                                <button key={num} className={`numberguess-btn ${activeGame.state.guesses.includes(num) ? 'guessed' : ''}`} onClick={() => makeGameMove(num)} disabled={activeGame.state.guesses.includes(num)}>{num}</button>
                              ))}
                            </div>
                            <p className="numberguess-attempts">Attempts: {activeGame.state.guesses.length}</p>
                          </div>
                        );
                      }
                    }
                  } else {
                    return (
                      <div className="numberguess-result">
                        <p className="numberguess-secret">The number was: <strong>{activeGame.state.secretNumber}</strong></p>
                        <p className="numberguess-attempts-final">{guesserName} guessed it in {activeGame.state.guesses.length} {activeGame.state.guesses.length === 1 ? 'try' : 'tries'}!</p>
                        <div className="numberguess-all-guesses">
                          {activeGame.state.guesses.map((guess, idx) => (
                            <span key={idx} className={`numberguess-guess ${guess === activeGame.state.secretNumber ? 'correct' : guess < activeGame.state.secretNumber ? 'low' : 'high'}`}>{guess}</span>
                          ))}
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {activeGame.type === 'chopsticks' && (
              <div className="chopsticks-game">
                {(() => {
                  const myIndex = activeGame.players[0].toLowerCase() === userName.toLowerCase() ? 0 : 1;
                  const opponentIndex = myIndex === 0 ? 1 : 0;
                  const myHands = activeGame.state.hands[myIndex];
                  const opponentHands = activeGame.state.hands[opponentIndex];
                  const isMyTurn = activeGame.currentTurn?.toLowerCase() === userName.toLowerCase();
                  const [selectedHand, setSelectedHandLocal] = [activeGame.state.selectedHand, (hand) => {
                    setActiveGame(prev => ({ ...prev, state: { ...prev.state, selectedHand: hand } }));
                  }];

                  const renderHand = (fingers) => {
                    if (fingers === 0) return '✊';
                    const fingerEmojis = ['✊', '☝️', '✌️', '🤟', '🖐️'];
                    return fingerEmojis[fingers] || '🖐️';
                  };

                  const canSplit = () => {
                    const total = myHands.left + myHands.right;
                    if (total === 0) return false;
                    for (let l = 0; l <= Math.min(4, total); l++) {
                      const r = total - l;
                      if (r >= 0 && r <= 4 && (l !== myHands.left || r !== myHands.right)) return true;
                    }
                    return false;
                  };

                  const getValidSplits = () => {
                    const total = myHands.left + myHands.right;
                    const splits = [];
                    for (let l = 0; l <= Math.min(4, total); l++) {
                      const r = total - l;
                      if (r >= 0 && r <= 4 && (l !== myHands.left || r !== myHands.right)) splits.push({ left: l, right: r });
                    }
                    return splits;
                  };

                  return (
                    <>
                      <div className="chopsticks-player opponent">
                        <div className="chopsticks-player-name">{activeGame.players[opponentIndex]}</div>
                        <div className="chopsticks-hands">
                          <div className={`chopsticks-hand ${opponentHands.left === 0 ? 'out' : ''} ${selectedHand && isMyTurn ? 'targetable' : ''}`}
                            onClick={() => { if (selectedHand && isMyTurn && opponentHands.left > 0 && activeGame.status === 'active') makeGameMove({ type: 'tap', myHand: selectedHand, theirHand: 'left' }); }}>
                            <span className="hand-emoji">{renderHand(opponentHands.left)}</span>
                            <span className="finger-count">{opponentHands.left}</span>
                          </div>
                          <div className={`chopsticks-hand ${opponentHands.right === 0 ? 'out' : ''} ${selectedHand && isMyTurn ? 'targetable' : ''}`}
                            onClick={() => { if (selectedHand && isMyTurn && opponentHands.right > 0 && activeGame.status === 'active') makeGameMove({ type: 'tap', myHand: selectedHand, theirHand: 'right' }); }}>
                            <span className="hand-emoji">{renderHand(opponentHands.right)}</span>
                            <span className="finger-count">{opponentHands.right}</span>
                          </div>
                        </div>
                      </div>
                      <div className="chopsticks-vs">VS</div>
                      <div className="chopsticks-player me">
                        <div className="chopsticks-player-name">{activeGame.players[myIndex]} (You)</div>
                        <div className="chopsticks-hands">
                          <div className={`chopsticks-hand ${myHands.left === 0 ? 'out' : ''} ${selectedHand === 'left' ? 'selected' : ''} ${isMyTurn && myHands.left > 0 ? 'selectable' : ''}`}
                            onClick={() => { if (isMyTurn && myHands.left > 0 && activeGame.status === 'active') setSelectedHandLocal(selectedHand === 'left' ? null : 'left'); }}>
                            <span className="hand-emoji">{renderHand(myHands.left)}</span>
                            <span className="finger-count">{myHands.left}</span>
                          </div>
                          <div className={`chopsticks-hand ${myHands.right === 0 ? 'out' : ''} ${selectedHand === 'right' ? 'selected' : ''} ${isMyTurn && myHands.right > 0 ? 'selectable' : ''}`}
                            onClick={() => { if (isMyTurn && myHands.right > 0 && activeGame.status === 'active') setSelectedHandLocal(selectedHand === 'right' ? null : 'right'); }}>
                            <span className="hand-emoji">{renderHand(myHands.right)}</span>
                            <span className="finger-count">{myHands.right}</span>
                          </div>
                        </div>
                      </div>
                      {activeGame.status === 'active' && isMyTurn && (
                        <div className="chopsticks-actions">
                          {selectedHand ? (
                            <p className="chopsticks-instruction">Tap an opponent's hand, or click your hand again to deselect</p>
                          ) : (
                            <p className="chopsticks-instruction">Select one of your hands to tap, or split your fingers</p>
                          )}
                          {canSplit() && !selectedHand && (
                            <div className="chopsticks-split">
                              <span>Split:</span>
                              {getValidSplits().map((split, idx) => (
                                <button key={idx} className="chopsticks-split-btn" onClick={() => makeGameMove({ type: 'split', left: split.left, right: split.right })}>{split.left}-{split.right}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {activeGame.status === 'active' && (
              <div className="game-turn-indicator">
                {!['rps', 'coinflip', 'numberguess'].includes(activeGame.type) && (
                  activeGame.currentTurn.toLowerCase() === userName.toLowerCase() ? "Your turn!" : `Waiting for ${activeGame.currentTurn}...`
                )}
              </div>
            )}

            <div className="game-modal-actions">
              <button className="game-btn quit" onClick={() => setActiveGame(null)}>Quit</button>
              {activeGame.status === 'finished' && (<button className="game-btn rematch" onClick={startRematch}>Rematch</button>)}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Group Chat</h3>
            <input type="text" className="modal-input" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Enter group name..." autoFocus />
            <p style={{ marginBottom: '10px', color: 'var(--text-secondary)' }}>Select members:</p>
            <div className="contact-checkboxes">
              {contacts.map(contact => (
                <label key={contact.name} className="contact-checkbox">
                  <input type="checkbox" checked={selectedMembers.includes(contact.name)} onChange={(e) => {
                    if (e.target.checked) setSelectedMembers([...selectedMembers, contact.name]);
                    else setSelectedMembers(selectedMembers.filter(n => n !== contact.name));
                  }} />
                  <span>{contact.name}</span>
                </label>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button className="modal-btn confirm" onClick={createGroup}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Page */}
      {showSettingsModal && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowSettingsModal(false)}>←</button>
            <h2>Settings</h2>
          </div>
          <div className="settings-page-content">
            <div className="settings-avatar-section">
              <input type="file" ref={avatarInputRef} onChange={(e) => handleAvatarSelect(e, false)} accept="image/*" style={{ display: 'none' }} />
              <div className="settings-avatar" onClick={() => avatarInputRef.current?.click()}>
                {tempAvatar ? <img src={tempAvatar} alt="Avatar" /> : userName.charAt(0).toUpperCase()}
                <div className="settings-avatar-overlay">Change</div>
              </div>
              {tempAvatar && (
                <div className="avatar-actions">
                  <button className="avatar-action-btn edit" onClick={() => editExistingAvatar(false)}>Edit crop</button>
                  <button className="avatar-action-btn remove" onClick={() => setTempAvatar(null)}>Remove</button>
                </div>
              )}
            </div>
            <div className="settings-section">
              <h4>Name</h4>
              <input type="text" className="modal-input" value={settingsNewUsername} onChange={(e) => setSettingsNewUsername(e.target.value)} placeholder="Your name" />
            </div>
            <div className="settings-section">
              <h4>Theme</h4>
              <div className="theme-options">
                {['green', 'blue', 'purple', 'orange', 'dark'].map(theme => (
                  <button key={theme} className={`theme-option ${theme} ${tempTheme === theme ? 'active' : ''}`} onClick={() => setTempTheme(theme)} title={theme.charAt(0).toUpperCase() + theme.slice(1)} />
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h4>Notifications</h4>
              <label className="toggle-setting">
                <input type="checkbox" checked={tempSoundEnabled} onChange={(e) => setTempSoundEnabled(e.target.checked)} />
                <span className="toggle-slider"></span>
                <span className="toggle-label">Message sound</span>
              </label>
            </div>
            {userRole === 'user' && (
              <div className="settings-section">
                <h4>Delete Account</h4>
                {!showDeleteConfirm ? (
                  <button className="delete-account-btn" onClick={() => setShowDeleteConfirm(true)}>Delete My Account</button>
                ) : (
                  <div className="delete-confirm">
                    <p className="delete-warning">This will permanently delete your account and remove you from the space. This cannot be undone.</p>
                    <div className="delete-confirm-buttons">
                      <button className="modal-btn cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                      <button className="modal-btn danger" onClick={handleDeleteAccount}>Yes, Delete My Account</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {settingsError && <div className="error-message">{settingsError}</div>}
          </div>
          <div className="settings-page-footer">
            <button className="modal-btn cancel" onClick={() => setShowSettingsModal(false)}>Cancel</button>
            <button className="modal-btn confirm" onClick={saveSettings}>Save</button>
          </div>
        </div>
      )}

      {/* Admin Space Settings */}
      {showSpaceSettings && spaceInfo && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowSpaceSettings(false)}>←</button>
            <h2>Space Settings</h2>
          </div>
          <div className="settings-page-content">
            <div className="settings-section">
              <h4>Space Name</h4>
              <div className="settings-info-text">{spaceInfo.name}</div>
            </div>
            <div className="settings-section">
              <h4>Space Code</h4>
              <div className="space-code-display">
                <span className="space-code-value">{spaceInfo.code}</span>
                <button className="space-code-change-btn" onClick={handleChangeSpaceCode}>Change Code</button>
              </div>
              <p className="settings-hint">Share this code with people to let them join your space</p>
            </div>
            <div className="settings-section">
              <h4>Members ({spaceInfo.memberCount})</h4>
              <div className="space-member-list">
                {spaceInfo.members?.map(member => (
                  <div key={member} className="space-member-item">
                    <span>{member}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h4>Ban User</h4>
              <div className="add-member-section">
                <input type="text" className="modal-input" value={banNameInput} onChange={(e) => setBanNameInput(e.target.value)} placeholder="Username to ban..." onKeyDown={(e) => e.key === 'Enter' && handleBanUser()} />
                <button className="add-member-btn danger-btn" onClick={handleBanUser}>Ban</button>
              </div>
            </div>
            {spaceInfo.banned?.length > 0 && (
              <div className="settings-section">
                <h4>Banned Users</h4>
                <div className="banned-list">
                  {spaceInfo.banned.map(name => (
                    <div key={name} className="banned-item">
                      <span>{name}</span>
                      <button className="unban-btn" onClick={() => handleUnbanUser(name)}>Unban</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="settings-page-footer">
            <button className="modal-btn cancel" onClick={() => setShowSpaceSettings(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Group Settings Page */}
      {showGroupSettingsModal && currentGroup && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowGroupSettingsModal(false)}>←</button>
            <h2>Group Settings</h2>
          </div>
          <div className="settings-page-content">
            <div className="settings-avatar-section">
              <input type="file" ref={groupAvatarInputRef} onChange={(e) => handleAvatarSelect(e, true)} accept="image/*" style={{ display: 'none' }} />
              {isGroupManager ? (
                <div className="settings-avatar group-avatar" onClick={() => groupAvatarInputRef.current?.click()}>
                  {tempGroupAvatar ? <img src={tempGroupAvatar} alt="Group" /> : currentGroup.name.charAt(0).toUpperCase()}
                  <div className="settings-avatar-overlay">Change</div>
                </div>
              ) : (
                <div className="settings-avatar group-avatar" style={{ cursor: 'default' }}>
                  {currentGroup.avatar ? <img src={currentGroup.avatar} alt="Group" /> : currentGroup.name.charAt(0).toUpperCase()}
                </div>
              )}
              {isGroupManager && tempGroupAvatar && (
                <div className="avatar-actions">
                  <button className="avatar-action-btn edit" onClick={() => editExistingAvatar(true)}>Edit crop</button>
                </div>
              )}
            </div>
            <div className="settings-section">
              <h4>Group Name</h4>
              {isGroupManager ? (
                <input type="text" className="modal-input" value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} placeholder="Group name" />
              ) : (
                <div className="settings-info-text">{currentGroup.name}</div>
              )}
            </div>
            <div className="settings-section">
              <h4>Description</h4>
              {isGroupManager ? (
                <input type="text" className="modal-input" value={editGroupDescription} onChange={(e) => setEditGroupDescription(e.target.value)} placeholder="Group description (optional)" />
              ) : (
                <div className="settings-info-text">{currentGroup.description || 'No description'}</div>
              )}
            </div>
            {isGroupManager && (
              <div className="settings-section">
                <h4>Add Member</h4>
                <div className="add-member-section">
                  <input type="text" className="modal-input" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Enter username..." onKeyDown={(e) => e.key === 'Enter' && addGroupMember()} />
                  <button className="add-member-btn" onClick={addGroupMember}>Add</button>
                </div>
              </div>
            )}
            <div className="settings-section">
              <h4>Members ({currentGroup.members?.length})</h4>
              <div className="group-member-list">
                {currentGroup.members?.map(member => (
                  <div key={member} className="group-member-item">
                    <div className="avatar">
                      {getMemberAvatar(member) ? (<img src={getMemberAvatar(member)} alt={member} />) : member.charAt(0).toUpperCase()}
                    </div>
                    <div className="group-member-info">
                      <div className="group-member-name">{member}</div>
                      {member.toLowerCase() === currentGroup.creator?.toLowerCase() && (<div className="group-member-role">Manager</div>)}
                    </div>
                    {isGroupManager && member.toLowerCase() !== currentGroup.creator?.toLowerCase() && (
                      <button className="remove-member-btn" onClick={() => removeGroupMember(member)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {groupSettingsError && <div className="error-message">{groupSettingsError}</div>}
          </div>
          <div className="settings-page-footer">
            {!isGroupManager && !currentGroup.isMainGroup && (<button className="leave-group-btn" onClick={leaveGroup}>Leave Group</button>)}
            <button className="modal-btn cancel" onClick={() => setShowGroupSettingsModal(false)}>{isGroupManager ? 'Cancel' : 'Close'}</button>
            {isGroupManager && (<button className="modal-btn confirm" onClick={saveGroupSettings}>Save</button>)}
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {showCropper && cropperImage && (
        <div className="modal-overlay" onClick={() => setShowCropper(false)}>
          <div className="modal cropper-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Crop Image</h3>
            <div className="cropper-container" ref={cropperRef} onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={handleCropMouseUp}>
              <img src={cropperImage} alt="Crop" className="cropper-image" style={{ transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropScale})` }} draggable={false} />
              <div className="cropper-overlay"></div>
            </div>
            <div className="cropper-controls">
              <label>Zoom:</label>
              <input type="range" min={minCropScale} max="3" step="0.01" value={cropScale} onChange={(e) => setCropScale(parseFloat(e.target.value))} />
            </div>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowCropper(false)}>Cancel</button>
              <button className="modal-btn confirm" onClick={applyCrop}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
