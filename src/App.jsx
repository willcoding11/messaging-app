import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// In production, connect to same origin. In dev, connect to port 3001
const isDev = window.location.port === '3000';
const serverUrl = isDev ? `http://${window.location.hostname}:3001` : undefined;
const socket = io(serverUrl);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [userName, setUserName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState({});
  const [currentChat, setCurrentChat] = useState(null);
  const [currentTab, setCurrentTab] = useState('contacts');
  const [messageInput, setMessageInput] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [contactError, setContactError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Settings state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [userTheme, setUserTheme] = useState('green');
  const [userAvatar, setUserAvatar] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
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

  // Invites state
  const [pendingInvites, setPendingInvites] = useState([]);

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Image cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [cropperImage, setCropperImage] = useState(null);
  const [cropperIsGroup, setCropperIsGroup] = useState(false);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const groupAvatarInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const cropperRef = useRef(null);
  const canvasRef = useRef(null);

  // Toast function
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userTheme);
  }, [userTheme]);

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

    socket.on('newInvite', (invite) => {
      setPendingInvites(prev => [...prev, invite]);
      showToast(`${invite.from} wants to add you as a contact`, 'info');
    });

    socket.on('inviteAccepted', ({ by }) => {
      showToast(`${by} accepted your contact request`, 'success');
    });

    socket.on('error', ({ message }) => {
      showToast(message, 'error');
    });

    return () => {
      socket.off('userOnline');
      socket.off('userOffline');
      socket.off('newMessage');
      socket.off('contactAdded');
      socket.off('contactUpdated');
      socket.off('groupCreated');
      socket.off('groupDeleted');
      socket.off('groupUpdated');
      socket.off('userTyping');
      socket.off('newInvite');
      socket.off('inviteAccepted');
      socket.off('error');
    };
  }, [showToast]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentChat]);

  const handleAuth = () => {
    if (!nameInput.trim() || !passwordInput) {
      setAuthError('Please enter name and password');
      return;
    }

    const event = authMode === 'login' ? 'login' : 'register';
    socket.emit(event, { name: nameInput.trim(), password: passwordInput }, (response) => {
      if (response.success) {
        setUserName(response.name);
        setUserAvatar(response.avatar);
        setUserTheme(response.theme || 'green');
        setIsLoggedIn(true);
        setAuthError('');
        socket.emit('getUserData', null, (data) => {
          setContacts(data.contacts);
          setGroups(data.groups);
          setMessages(data.messages);
          setPendingInvites(data.pendingInvites || []);
        });
      } else {
        setAuthError(response.error);
      }
    });
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserName('');
    setNameInput('');
    setPasswordInput('');
    setContacts([]);
    setGroups([]);
    setMessages({});
    setCurrentChat(null);
    setUserAvatar(null);
    setUserTheme('green');
    setPendingInvites([]);
    window.location.reload();
  };

  const addContact = () => {
    if (!newContactName.trim()) {
      setContactError('Please enter a name');
      return;
    }

    socket.emit('addContact', { contactName: newContactName.trim() }, (response) => {
      if (response.success) {
        if (response.contact) {
          setContacts(prev => [...prev, response.contact]);
        }
        setNewContactName('');
        setContactError('');
        setShowContactModal(false);
        showToast(response.message || 'Invite sent!', 'success');
      } else {
        setContactError(response.error);
      }
    });
  };

  const acceptInvite = (fromName) => {
    socket.emit('acceptInvite', { fromName }, (response) => {
      if (response.success) {
        setPendingInvites(prev => prev.filter(i => i.from !== fromName));
        setContacts(prev => [...prev, response.contact]);
        showToast(`${fromName} added to contacts`, 'success');
      } else {
        showToast(response.error, 'error');
      }
    });
  };

  const declineInvite = (fromName) => {
    socket.emit('declineInvite', { fromName }, (response) => {
      if (response.success) {
        setPendingInvites(prev => prev.filter(i => i.from !== fromName));
        showToast('Invite declined', 'info');
      }
    });
  };

  const removeContact = (contactName) => {
    socket.emit('removeContact', { contactName });
    setContacts(prev => prev.filter(c => c.name.toLowerCase() !== contactName.toLowerCase()));
    if (currentChat?.name?.toLowerCase() === contactName.toLowerCase()) {
      setCurrentChat(null);
    }
    showToast('Contact removed', 'info');
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

  const getChatId = (contactName) => {
    const sorted = [userName.toLowerCase(), contactName.toLowerCase()].sort();
    return `dm_${sorted[0]}_${sorted[1]}`;
  };

  const openChat = (type, entity) => {
    if (type === 'contact') {
      const chatId = getChatId(entity.name);
      setCurrentChat({ id: chatId, name: entity.name, type: 'contact', online: entity.online, avatar: entity.avatar });
    } else {
      const chatId = `group_${entity.id}`;
      setCurrentChat({ id: chatId, name: entity.name, type: 'group', groupId: entity.id, members: entity.members, creator: entity.creator, avatar: entity.avatar });
    }
  };

  const handleTyping = () => {
    if (!currentChat) return;

    const recipient = currentChat.type === 'contact' ? currentChat.name : currentChat.groupId;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('startTyping', { chatId: currentChat.id, chatType: currentChat.type, recipient });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

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
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

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
    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(progress);
      }
    };
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setUploadProgress(100);
        sendMessage('', base64);
      }
      setIsUploading(false);
      setUploadProgress(0);
    };
    reader.onerror = () => {
      showToast('Failed to read image. Please try again.', 'error');
      setIsUploading(false);
      setUploadProgress(0);
    };
    reader.onabort = () => {
      setIsUploading(false);
      setUploadProgress(0);
    };
    reader.readAsDataURL(file);
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
      setCropperImage(base64);
      setCropperIsGroup(isGroup);
      setCropPosition({ x: 0, y: 0 });
      setCropScale(1);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const handleCropMouseMove = (e) => {
    if (!isDragging) return;
    setCropPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const outputSize = 200;
      canvas.width = outputSize;
      canvas.height = outputSize;

      // The crop circle/square is 200px centered in the cropper container
      const cropSize = 200;

      // Image center is at center of original image
      const imgCenterX = img.width / 2;
      const imgCenterY = img.height / 2;

      // cropPosition moves the image, so negative offset gets the crop region
      // When user drags right (positive x), image shows more of left side
      const offsetX = -cropPosition.x / cropScale;
      const offsetY = -cropPosition.y / cropScale;

      // Source rectangle in original image coordinates
      const sourceSize = cropSize / cropScale;
      const sourceX = imgCenterX + offsetX - sourceSize / 2;
      const sourceY = imgCenterY + offsetY - sourceSize / 2;

      // Clamp source coordinates to valid range
      const clampedSourceX = Math.max(0, Math.min(sourceX, img.width - sourceSize));
      const clampedSourceY = Math.max(0, Math.min(sourceY, img.height - sourceSize));
      const clampedSourceSize = Math.min(sourceSize, img.width, img.height);

      ctx.drawImage(img, clampedSourceX, clampedSourceY, clampedSourceSize, clampedSourceSize, 0, 0, outputSize, outputSize);

      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.8);

      if (cropperIsGroup) {
        setTempGroupAvatar(croppedBase64);
      } else {
        setTempAvatar(croppedBase64);
      }
      setShowCropper(false);
      setCropperImage(null);
    };
    img.src = cropperImage;
  };

  const openSettingsModal = () => {
    setTempAvatar(userAvatar);
    setTempTheme(userTheme);
    setSettingsNewUsername(userName);
    setSettingsCurrentPassword('');
    setSettingsNewPassword('');
    setSettingsConfirmPassword('');
    setSettingsError('');
    setShowSettingsModal(true);
  };

  const saveSettings = () => {
    if (settingsNewPassword || settingsConfirmPassword) {
      if (!settingsCurrentPassword) {
        setSettingsError('Current password required to change password');
        return;
      }
      if (settingsNewPassword !== settingsConfirmPassword) {
        setSettingsError('New passwords do not match');
        return;
      }
      if (settingsNewPassword.length < 4) {
        setSettingsError('New password must be at least 4 characters');
        return;
      }
    }

    const updates = {
      avatar: tempAvatar,
      theme: tempTheme,
      newUsername: settingsNewUsername
    };

    if (settingsNewPassword) {
      updates.currentPassword = settingsCurrentPassword;
      updates.newPassword = settingsNewPassword;
    }

    socket.emit('updateProfile', updates, (response) => {
      if (response.success) {
        setUserAvatar(response.avatar);
        setUserTheme(response.theme);
        if (response.nameChanged) {
          setUserName(response.name);
          showToast('Username changed successfully', 'success');
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
      if (response.success) {
        showToast('Member removed', 'info');
      } else {
        setGroupSettingsError(response.error);
      }
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

  const getLastMessage = (chatId) => {
    const chatMessages = messages[chatId] || [];
    if (chatMessages.length === 0) return 'No messages yet';
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg.image) return '📷 Image';
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

  // Auth Screen
  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h1>Messages</h1>
          <p>{authMode === 'login' ? 'Log in to your account' : 'Create a new account'}</p>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              Login
            </button>
            <button
              className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
            >
              Register
            </button>
          </div>

          <input
            type="text"
            className="login-input"
            value={nameInput}
            onChange={(e) => { setNameInput(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            placeholder="Username"
            autoFocus
          />
          <input
            type="password"
            className="login-input"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            placeholder="Password"
          />
          {authError && <div className="error-message">{authError}</div>}
          <button className="login-btn" onClick={handleAuth}>
            {authMode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </div>
      </div>
    );
  }

  const currentGroup = currentChat?.type === 'group' ? groups.find(g => g.id === currentChat.groupId) : null;
  const isGroupManager = currentGroup?.creator?.toLowerCase() === userName.toLowerCase();

  // Main App
  return (
    <div className="container">
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            <div className="avatar" style={{ width: 35, height: 35, fontSize: '1rem' }}>
              {userAvatar ? <img src={userAvatar} alt={userName} /> : userName.charAt(0).toUpperCase()}
            </div>
            <span className="user-name">{userName}</span>
          </div>
          <div className="header-buttons">
            <button className="settings-btn" onClick={openSettingsModal} title="Settings">
              ⚙️
            </button>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <div className="header-buttons" style={{ padding: '10px 15px', background: 'var(--bg-light)' }}>
          <button className="header-btn" style={{ background: 'var(--primary)', borderRadius: '5px' }} onClick={() => { setShowContactModal(true); setContactError(''); setNewContactName(''); }}>+ Contact</button>
          <button className="header-btn" style={{ background: 'var(--primary)', borderRadius: '5px' }} onClick={() => {
            if (contacts.length === 0) {
              showToast('Add contacts first!', 'info');
              return;
            }
            setShowGroupModal(true);
          }}>+ Group</button>
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="invites-section">
            <div className="invites-header">
              <span>Invites</span>
              <span className="invites-badge">{pendingInvites.length}</span>
            </div>
            {pendingInvites.map(invite => (
              <div key={invite.from} className="invite-item">
                <div className="avatar" style={{ width: 35, height: 35, fontSize: '0.9rem' }}>
                  {invite.avatar ? <img src={invite.avatar} alt={invite.from} /> : invite.from.charAt(0).toUpperCase()}
                </div>
                <div className="invite-info">
                  <div className="invite-name">{invite.from}</div>
                </div>
                <div className="invite-actions">
                  <button className="invite-btn accept" onClick={() => acceptInvite(invite.from)}>Accept</button>
                  <button className="invite-btn decline" onClick={() => declineInvite(invite.from)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="tabs">
          <button className={`tab ${currentTab === 'contacts' ? 'active' : ''}`} onClick={() => setCurrentTab('contacts')}>Contacts</button>
          <button className={`tab ${currentTab === 'groups' ? 'active' : ''}`} onClick={() => setCurrentTab('groups')}>Groups</button>
        </div>
        <div className="contact-list">
          {currentTab === 'contacts' ? (
            contacts.length === 0 ? (
              <div className="empty-list">No contacts yet. Add someone by their username!</div>
            ) : (
              contacts.map(contact => (
                <div key={contact.name} className={`contact-item ${currentChat?.name === contact.name && currentChat?.type === 'contact' ? 'active' : ''}`} onClick={() => openChat('contact', contact)}>
                  <div className="avatar">
                    {contact.avatar ? <img src={contact.avatar} alt={contact.name} /> : contact.name.charAt(0).toUpperCase()}
                    <span className={`status-dot ${contact.online ? 'online' : 'offline'}`}></span>
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{contact.name}</div>
                    <div className="last-message">{getLastMessage(getChatId(contact.name))}</div>
                  </div>
                  <button className="delete-btn" onClick={(e) => { e.stopPropagation(); removeContact(contact.name); }}>X</button>
                </div>
              ))
            )
          ) : (
            groups.length === 0 ? (
              <div className="empty-list">No groups yet</div>
            ) : (
              groups.map(group => (
                <div key={group.id} className={`contact-item ${currentChat?.groupId === group.id ? 'active' : ''}`} onClick={() => openChat('group', group)}>
                  <div className="avatar group-avatar">
                    {group.avatar ? <img src={group.avatar} alt={group.name} /> : group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{group.name}</div>
                    <div className="last-message">{getLastMessage(`group_${group.id}`)}</div>
                  </div>
                  {group.creator.toLowerCase() === userName.toLowerCase() && (
                    <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}>X</button>
                  )}
                </div>
              ))
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
          </div>
        ) : (
          <>
            <div className="chat-header">
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
                  ℹ️
                </button>
              )}
            </div>
            <div className="chat-messages">
              {(messages[currentChat.id] || []).map((msg, idx) => (
                <div key={idx} className={`message ${msg.sent ? 'sent' : 'received'}`}>
                  {!msg.sent && currentChat.type === 'group' && (
                    <div className="message-with-avatar">
                      <div className="message-avatar">
                        {getMemberAvatar(msg.sender) ? (
                          <img src={getMemberAvatar(msg.sender)} alt={msg.sender} />
                        ) : msg.sender?.charAt(0).toUpperCase()}
                      </div>
                      <div className="message-sender">{msg.sender}</div>
                    </div>
                  )}
                  {msg.image && (
                    <img
                      src={msg.image}
                      alt="Shared"
                      className="message-image"
                      onClick={() => window.open(msg.image, '_blank')}
                    />
                  )}
                  {msg.text && <div className="message-text">{msg.text}</div>}
                  <div className="message-time">{msg.time}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {getTypingText(currentChat.id) && (
              <div className="typing-indicator">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                {getTypingText(currentChat.id)}
              </div>
            )}
            <div className="chat-input-area">
              {isUploading && (
                <div className="upload-progress-container">
                  <div className="upload-progress-bar">
                    <div
                      className="upload-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="upload-progress-text">Uploading... {uploadProgress}%</span>
                </div>
              )}
              <div className="chat-input-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <button
                  className="image-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Send image"
                  disabled={isUploading}
                >
                  📷
                </button>
                <input
                  type="text"
                  className="chat-input"
                  value={messageInput}
                  onChange={(e) => { setMessageInput(e.target.value); handleTyping(); }}
                  onKeyDown={(e) => e.key === 'Enter' && !isUploading && sendMessage()}
                  placeholder={isUploading ? "Uploading image..." : "Type a message..."}
                  disabled={isUploading}
                />
                <button
                  className="send-btn"
                  onClick={() => sendMessage()}
                  disabled={isUploading}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Contact Modal */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Contact</h3>
            <p style={{ marginBottom: '15px', color: 'var(--text-secondary)' }}>Enter the username of the person you want to add. They will receive an invite.</p>
            <input
              type="text"
              className="modal-input"
              value={newContactName}
              onChange={(e) => { setNewContactName(e.target.value); setContactError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && addContact()}
              placeholder="Enter username..."
              autoFocus
            />
            {contactError && <div className="error-message">{contactError}</div>}
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowContactModal(false)}>Cancel</button>
              <button className="modal-btn confirm" onClick={addContact}>Send Invite</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Group Chat</h3>
            <input
              type="text"
              className="modal-input"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter group name..."
              autoFocus
            />
            <p style={{ marginBottom: '10px', color: 'var(--text-secondary)' }}>Select members:</p>
            <div className="contact-checkboxes">
              {contacts.map(contact => (
                <label key={contact.name} className="contact-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(contact.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMembers([...selectedMembers, contact.name]);
                      } else {
                        setSelectedMembers(selectedMembers.filter(n => n !== contact.name));
                      }
                    }}
                  />
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

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>

            <div className="settings-avatar-section">
              <input
                type="file"
                ref={avatarInputRef}
                onChange={(e) => handleAvatarSelect(e, false)}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <div className="settings-avatar" onClick={() => avatarInputRef.current?.click()}>
                {tempAvatar ? <img src={tempAvatar} alt="Avatar" /> : userName.charAt(0).toUpperCase()}
                <div className="settings-avatar-overlay">Change</div>
              </div>
              {tempAvatar && (
                <button
                  style={{ marginTop: '10px', background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer' }}
                  onClick={() => setTempAvatar(null)}
                >
                  Remove avatar
                </button>
              )}
            </div>

            <div className="settings-section">
              <h4>Username</h4>
              <input
                type="text"
                className="modal-input"
                value={settingsNewUsername}
                onChange={(e) => setSettingsNewUsername(e.target.value)}
                placeholder="Username"
              />
            </div>

            <div className="settings-section">
              <h4>Theme</h4>
              <div className="theme-options">
                {['green', 'blue', 'purple', 'orange', 'dark'].map(theme => (
                  <button
                    key={theme}
                    className={`theme-option ${theme} ${tempTheme === theme ? 'active' : ''}`}
                    onClick={() => setTempTheme(theme)}
                    title={theme.charAt(0).toUpperCase() + theme.slice(1)}
                  />
                ))}
              </div>
            </div>

            <div className="settings-section">
              <h4>Change Password</h4>
              <div className="password-inputs">
                <input
                  type="password"
                  className="modal-input"
                  value={settingsCurrentPassword}
                  onChange={(e) => setSettingsCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  style={{ marginBottom: 0 }}
                />
                <input
                  type="password"
                  className="modal-input"
                  value={settingsNewPassword}
                  onChange={(e) => setSettingsNewPassword(e.target.value)}
                  placeholder="New password"
                  style={{ marginBottom: 0 }}
                />
                <input
                  type="password"
                  className="modal-input"
                  value={settingsConfirmPassword}
                  onChange={(e) => setSettingsConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  style={{ marginBottom: 0 }}
                />
              </div>
            </div>

            {settingsError && <div className="error-message">{settingsError}</div>}

            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button className="modal-btn confirm" onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Group Settings Modal */}
      {showGroupSettingsModal && currentGroup && (
        <div className="modal-overlay" onClick={() => setShowGroupSettingsModal(false)}>
          <div className="modal group-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Group Settings</h3>

            {isGroupManager && (
              <>
                <div className="settings-avatar-section">
                  <input
                    type="file"
                    ref={groupAvatarInputRef}
                    onChange={(e) => handleAvatarSelect(e, true)}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />
                  <div className="settings-avatar group-avatar" onClick={() => groupAvatarInputRef.current?.click()}>
                    {tempGroupAvatar ? <img src={tempGroupAvatar} alt="Group" /> : currentGroup.name.charAt(0).toUpperCase()}
                    <div className="settings-avatar-overlay">Change</div>
                  </div>
                </div>

                <div className="settings-section">
                  <h4>Group Name</h4>
                  <input
                    type="text"
                    className="modal-input"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    placeholder="Group name"
                  />
                </div>

                <div className="settings-section">
                  <h4>Description</h4>
                  <input
                    type="text"
                    className="modal-input"
                    value={editGroupDescription}
                    onChange={(e) => setEditGroupDescription(e.target.value)}
                    placeholder="Group description (optional)"
                  />
                </div>

                <div className="settings-section">
                  <h4>Add Member</h4>
                  <div className="add-member-section">
                    <input
                      type="text"
                      className="modal-input"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="Enter username..."
                      onKeyDown={(e) => e.key === 'Enter' && addGroupMember()}
                    />
                    <button className="add-member-btn" onClick={addGroupMember}>Add</button>
                  </div>
                </div>
              </>
            )}

            <div className="settings-section">
              <h4>Members ({currentGroup.members?.length})</h4>
              <div className="group-member-list">
                {currentGroup.members?.map(member => (
                  <div key={member} className="group-member-item">
                    <div className="avatar">
                      {getMemberAvatar(member) ? (
                        <img src={getMemberAvatar(member)} alt={member} />
                      ) : member.charAt(0).toUpperCase()}
                    </div>
                    <div className="group-member-info">
                      <div className="group-member-name">{member}</div>
                      {member.toLowerCase() === currentGroup.creator?.toLowerCase() && (
                        <div className="group-member-role">Manager</div>
                      )}
                    </div>
                    {isGroupManager && member.toLowerCase() !== currentGroup.creator?.toLowerCase() && (
                      <button className="remove-member-btn" onClick={() => removeGroupMember(member)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {groupSettingsError && <div className="error-message">{groupSettingsError}</div>}

            <div className="modal-buttons">
              {!isGroupManager && (
                <button className="leave-group-btn" onClick={leaveGroup}>Leave Group</button>
              )}
              <button className="modal-btn cancel" onClick={() => setShowGroupSettingsModal(false)}>
                {isGroupManager ? 'Cancel' : 'Close'}
              </button>
              {isGroupManager && (
                <button className="modal-btn confirm" onClick={saveGroupSettings}>Save</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {showCropper && cropperImage && (
        <div className="modal-overlay" onClick={() => setShowCropper(false)}>
          <div className="modal cropper-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Crop Image</h3>
            <div
              className="cropper-container"
              ref={cropperRef}
              onMouseDown={handleCropMouseDown}
              onMouseMove={handleCropMouseMove}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
            >
              <img
                src={cropperImage}
                alt="Crop"
                className="cropper-image"
                style={{
                  transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropScale})`
                }}
                draggable={false}
              />
              <div className="cropper-overlay"></div>
            </div>
            <div className="cropper-controls">
              <label>Zoom:</label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={cropScale}
                onChange={(e) => setCropScale(parseFloat(e.target.value))}
              />
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
