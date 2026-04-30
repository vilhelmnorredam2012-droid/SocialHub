(function() {
    const SUPABASE_URL = "https://kglluoywbhirrewhyrrk.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGx1b3l3YmhpcnJld2h5cnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDk5MjIsImV4cCI6MjA5MzEyNTkyMn0.Ha_XIs2cIJaLhs7-oQF6PkhHxYT-SRjVJ1hCLHDVZOc";
    const ADMIN_CODE = 'fugle123';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const app = document.getElementById('app');
    const nameModal = document.getElementById('nameModal');
    const nameInput = document.getElementById('nameInput');
    const saveNameBtn = document.getElementById('saveNameBtn');
    const globalMessagesDiv = document.getElementById('globalMessages');
    const globalInput = document.getElementById('globalInput');
    const sendGlobalBtn = document.getElementById('sendGlobalBtn');
    const onlineCountSpan = document.getElementById('onlineCount');
    const onlineUsersList = document.getElementById('onlineUsersList');
    const privateModal = document.getElementById('privateModal');
    const privateRecipientName = document.getElementById('privateRecipientName');
    const privateMessagesDiv = document.getElementById('privateMessages');
    const privateInput = document.getElementById('privateInput');
    const sendPrivateBtn = document.getElementById('sendPrivateBtn');
    const closePrivateBtn = document.getElementById('closePrivateBtn');

    // Admin DOM
    const adminCodeInput = document.getElementById('adminCodeInput');
    const unlockAdminBtn = document.getElementById('unlockAdminBtn');
    const adminStatus = document.getElementById('adminStatus');
    const adminPanel = document.getElementById('adminPanel');
    const adminDeleteAllBtn = document.getElementById('adminDeleteAllBtn');
    const adminCleanupBtn = document.getElementById('adminCleanupBtn');

    // Nye admin-knapper (oprettes dynamisk)
    let adminLockBtn = null;
    let adminUnkickUserBtn = null;
    let adminRefreshPresenceBtn = null;
    let adminExportBtn = null;

    let currentUser = null;
    let isAdmin = localStorage.getItem('chat_admin_unlocked') === 'true';
    let globalChannel = null;
    let privateChannel = null;
    let presenceChannel = null;
    let kickedChannel = null;
    let onlineUsers = new Map();
    let activePrivateRecipient = null;
    let kickedUsers = new Set();
    let currentUserIsKicked = false;
    let sentPrivateTyping = false;
    let sentGlobalTyping = false;
    let typingTimeoutGlobal = null;
    let typingTimeoutPrivate = null;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function formatTime(date) {
        return new Date(date).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    }

    function scrollToBottom(element) {
        requestAnimationFrame(() => {
            element.scrollTop = element.scrollHeight;
        });
    }

    function getStoredUsername() {
        return localStorage.getItem('chat_username');
    }

    // —— ADMIN UI (med lock/unlock og dynamiske knapper) ——
    function setAdminUI() {
        if (!adminStatus || !adminPanel) return;
        if (isAdmin) {
            adminStatus.textContent = 'Admin er slået til';
            adminPanel.classList.add('admin-panel-visible');
            adminCodeInput.value = ADMIN_CODE;
            unlockAdminBtn.textContent = 'Admin aktiv';
            unlockAdminBtn.disabled = true;

            if (!adminLockBtn) {
                adminLockBtn = document.createElement('button');
                adminLockBtn.className = 'btn btn-block';
                adminLockBtn.textContent = '🔒 Lås admin';
                adminLockBtn.addEventListener('click', lockAdmin);
                adminPanel.appendChild(adminLockBtn);
            }
            adminLockBtn.style.display = 'block';

            if (!adminUnkickUserBtn) {
                adminUnkickUserBtn = document.createElement('button');
                adminUnkickUserBtn.className = 'btn btn-block';
                adminUnkickUserBtn.textContent = '🔓 Fjern kick (indtast navn)';
                adminUnkickUserBtn.addEventListener('click', unkickUser);
                adminPanel.appendChild(adminUnkickUserBtn);
            }
            if (!adminRefreshPresenceBtn) {
                adminRefreshPresenceBtn = document.createElement('button');
                adminRefreshPresenceBtn.className = 'btn btn-block';
                adminRefreshPresenceBtn.textContent = '🔄 Tving opdater online-liste';
                adminRefreshPresenceBtn.addEventListener('click', refreshPresence);
                adminPanel.appendChild(adminRefreshPresenceBtn);
            }
            if (!adminExportBtn) {
                adminExportBtn = document.createElement('button');
                adminExportBtn.className = 'btn btn-block';
                adminExportBtn.textContent = '💾 Eksporter chatlog (JSON)';
                adminExportBtn.addEventListener('click', exportChat);
                adminPanel.appendChild(adminExportBtn);
            }

            if (adminUnkickUserBtn) adminUnkickUserBtn.style.display = 'block';
            if (adminRefreshPresenceBtn) adminRefreshPresenceBtn.style.display = 'block';
            if (adminExportBtn) adminExportBtn.style.display = 'block';
        } else {
            adminStatus.textContent = 'Admin er låst';
            adminPanel.classList.remove('admin-panel-visible');
            adminCodeInput.value = '';
            unlockAdminBtn.textContent = 'Lås op';
            unlockAdminBtn.disabled = false;
            if (adminLockBtn) adminLockBtn.style.display = 'none';
            if (adminUnkickUserBtn) adminUnkickUserBtn.style.display = 'none';
            if (adminRefreshPresenceBtn) adminRefreshPresenceBtn.style.display = 'none';
            if (adminExportBtn) adminExportBtn.style.display = 'none';
        }
    }

    function lockAdmin() {
        isAdmin = false;
        localStorage.removeItem('chat_admin_unlocked');
        setAdminUI();
        renderOnlineUsers();
        loadGlobalHistory();
        if (activePrivateRecipient) loadPrivateHistory();
    }

    async function unkickUser() {
        if (!isAdmin) return;
        const username = prompt('Indtast brugernavn for at fjerne kick:');
        if (!username || username.trim() === '') return;
        try {
            const { error } = await supabase
                .from('kicked_users')
                .delete()
                .eq('username', username.trim());
            if (error) throw error;
            alert(`${username} er nu fjernet fra kick-listen.`);
        } catch (error) {
            console.error('Kunne ikke fjerne kick:', error);
            alert('Fejl ved fjernelse af kick.');
        }
    }

    async function refreshPresence() {
        if (!isAdmin || !presenceChannel) return;
        try {
            await presenceChannel.track({
                username: currentUser,
                online_at: new Date().toISOString(),
            });
        } catch(e) {}
        renderOnlineUsers();
        alert('Online liste opdateret.');
    }

    async function exportChat() {
        if (!isAdmin) return;
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true });
            if (error) throw error;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-log-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Eksport fejlede:', error);
            alert('Kunne ikke eksportere chatlog.');
        }
    }

    function showSystemNotice(text) {
        let notice = document.getElementById('systemNotice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'systemNotice';
            notice.className = 'system-notice';
            document.querySelector('.sidebar').prepend(notice);
        }
        notice.textContent = text;
        notice.style.display = 'block';
    }

    function clearSystemNotice() {
        const notice = document.getElementById('systemNotice');
        if (notice) notice.style.display = 'none';
    }

    function messageActionHtml(msg) {
        const canDelete = msg.sender === currentUser || isAdmin;
        if (!canDelete) return '';
        return `<button class="message-action-btn delete-message-btn" data-message-id="${escapeHtml(msg.id)}" title="Slet besked">🗑</button>`;
    }

    function renderMessage(msg, container) {
        if (!msg || !msg.id) return;
        const existing = container.querySelector(`.message[data-message-id="${CSS.escape(String(msg.id))}"]`);
        if (existing) return;

        const div = document.createElement('div');
        div.className = `message ${msg.sender === currentUser ? 'self' : 'other'}`;
        div.dataset.messageId = msg.id;
        div.dataset.sender = msg.sender ?? '';
        div.dataset.type = msg.type ?? '';
        div.dataset.recipient = msg.recipient ?? '';

        const actionHtml = messageActionHtml(msg);

        div.innerHTML = `
            <div class="message-top">
                <div class="sender">${msg.sender === currentUser ? 'dig' : escapeHtml(msg.sender || 'Ukendt')}</div>
                <div class="message-actions">${actionHtml}</div>
            </div>
            <div class="content">${escapeHtml(msg.content || '')}</div>
            <div class="time">${formatTime(msg.created_at)}</div>
        `;

        container.appendChild(div);
    }

    function displayGlobalMessage(msg) {
        renderMessage(msg, globalMessagesDiv);
        scrollToBottom(globalMessagesDiv);
    }

    function displayPrivateMessage(msg) {
        if (!activePrivateRecipient) return;
        const isRelevant = (msg.sender === currentUser && msg.recipient === activePrivateRecipient) ||
                           (msg.sender === activePrivateRecipient && msg.recipient === currentUser);
        if (!isRelevant) return;
        renderMessage(msg, privateMessagesDiv);
        scrollToBottom(privateMessagesDiv);
    }

    async function loadGlobalHistory() {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('type', 'global')
                .order('created_at', { ascending: true })
                .limit(200);
            if (error) throw error;
            globalMessagesDiv.innerHTML = '';
            (data || []).forEach(displayGlobalMessage);
        } catch (error) {
            console.error('Kunne ikke hente historik:', error);
        }
    }

    async function loadPrivateHistory() {
        if (!activePrivateRecipient) return;
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('type', 'private')
                .or(`and(sender.eq.${currentUser},recipient.eq.${activePrivateRecipient}),and(sender.eq.${activePrivateRecipient},recipient.eq.${currentUser})`)
                .order('created_at', { ascending: true })
                .limit(100);
            if (error) throw error;
            privateMessagesDiv.innerHTML = '';
            (data || []).forEach(displayPrivateMessage);
            scrollToBottom(privateMessagesDiv);
        } catch (error) {
            console.error('Fejl ved hentning af privat historik:', error);
        }
    }

    function renderOnlineUsers() {
        const users = Array.from(onlineUsers.values());
        users.sort((a, b) => {
            if (a.username === currentUser) return -1;
            if (b.username === currentUser) return 1;
            return a.username.localeCompare(b.username, 'da');
        });

        onlineUsersList.innerHTML = '';
        users.forEach(u => {
            const row = document.createElement('div');
            row.className = 'online-user' + (u.username === currentUser ? ' self-indicator' : '');
            row.innerHTML = `
                <span class="online-dot"></span>
                <span class="online-name">${escapeHtml(u.username)}${u.username === currentUser ? ' (dig)' : ''}</span>
            `;

            if (u.username !== currentUser) {
                const btnWrap = document.createElement('div');
                btnWrap.className = 'online-actions';

                const openBtn = document.createElement('button');
                openBtn.className = 'mini-btn';
                openBtn.textContent = 'Chat';
                openBtn.addEventListener('click', () => openPrivateChat(u.username));
                btnWrap.appendChild(openBtn);

                if (isAdmin) {
                    const kickBtn = document.createElement('button');
                    kickBtn.className = 'mini-btn danger';
                    kickBtn.textContent = 'Kick';
                    kickBtn.addEventListener('click', () => kickUser(u.username));
                    btnWrap.appendChild(kickBtn);
                }

                row.appendChild(btnWrap);
            }

            onlineUsersList.appendChild(row);
        });

        onlineCountSpan.textContent = `${users.length} online`;
    }

    async function loadKickedUsers() {
        try {
            const { data, error } = await supabase
                .from('kicked_users')
                .select('username');
            if (error) throw error;

            kickedUsers = new Set((data || []).map(row => row.username).filter(Boolean));
            currentUserIsKicked = kickedUsers.has(currentUser);

            if (currentUserIsKicked) {
                lockChat();
                showSystemNotice('Du er blevet kicked fra chatten.');
            } else {
                unlockChat();
                clearSystemNotice();
            }

            renderOnlineUsers();
        } catch (error) {
            console.error('Kunne ikke hente kicked brugere:', error);
        }
    }

    function lockChat() {
        globalInput.disabled = true;
        sendGlobalBtn.disabled = true;
        privateInput.disabled = true;
        sendPrivateBtn.disabled = true;
    }

    function unlockChat() {
        globalInput.disabled = false;
        sendGlobalBtn.disabled = false;
        privateInput.disabled = false;
        sendPrivateBtn.disabled = false;
    }

    // ---------- SLETNING MED RPC (ID som streng, bedre fejlmelding) ----------
    async function deleteMessage(messageId) {
        try {
            // Send ID som string – IKKE parseInt, da bigint kan være for stort
            const { error } = await supabase
                .rpc('delete_message_secure', {
                    p_message_id: messageId,
                    p_username: currentUser,
                    p_admin_secret: isAdmin ? ADMIN_CODE : null
                });
                
            if (error) throw error;
        } catch (error) {
            console.error('Fejl ved sletning:', error);
            alert('Kunne ikke slette besked. ' + (error.message || ''));
        }
    }

    async function deleteAllMessages() {
        if (!isAdmin) return;
        if (!confirm('Vil du slette ALLE beskeder?')) return;
        try {
            const { error } = await supabase
                .rpc('delete_all_messages_secure', {
                    p_admin_secret: ADMIN_CODE
                });
            if (error) throw error;
            globalMessagesDiv.innerHTML = '';
            privateMessagesDiv.innerHTML = '';
        } catch (error) {
            console.error('Kunne ikke slette alle beskeder:', error);
            alert('Handlingen blev afvist: ' + (error.message || ''));
        }
    }

    async function cleanupBrokenMessages() {
        if (!isAdmin) return;
        if (!confirm('Vil du rydde tomme eller ødelagte beskeder?')) return;
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('id, content, sender, type');
            if (error) throw error;

            const broken = (data || []).filter(row => {
                const content = (row.content ?? '').trim();
                const sender = (row.sender ?? '').trim();
                const type = (row.type ?? '').trim();
                return !content || !sender || !['global', 'private'].includes(type);
            });

            for (const row of broken) {
                await supabase
                    .rpc('delete_message_secure', {
                        p_message_id: row.id,
                        p_username: row.sender,
                        p_admin_secret: ADMIN_CODE
                    });
            }

            await Promise.all([loadGlobalHistory(), activePrivateRecipient ? loadPrivateHistory() : Promise.resolve()]);
        } catch (error) {
            console.error('Kunne ikke rydde beskeder:', error);
            alert('Kunne ikke rydde ødelagte beskeder: ' + (error.message || ''));
        }
    }

    async function kickUser(username) {
        if (!isAdmin) return;
        if (!username || username === currentUser) return;
        if (!confirm(`Kick ${username}?`)) return;

        try {
            const { error } = await supabase
                .from('kicked_users')
                .upsert({
                    username,
                    kicked_by: currentUser,
                    kicked_at: new Date().toISOString(),
                }, { onConflict: 'username' });
            if (error) throw error;
        } catch (error) {
            console.error('Kunne ikke kicke brugeren:', error);
            alert('Kunne ikke kicke brugeren.');
        }
    }

    function removeMessagesFromDomById(messageId) {
        const selector = `.message[data-message-id="${CSS.escape(String(messageId))}"]`;
        document.querySelectorAll(selector).forEach(el => el.remove());
    }

    function initUsername() {
        const stored = getStoredUsername();
        if (stored && stored.trim()) {
            currentUser = stored.trim();
            nameModal.style.display = 'none';
            app.style.display = 'flex';
            setAdminUI();
            startRealtime();
        } else {
            nameModal.style.display = 'flex';
            app.style.display = 'none';
        }
    }

    saveNameBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) return alert('Indtast et navn');
        if (name.length < 2) return alert('Navn skal være mindst 2 tegn');
        currentUser = name;
        localStorage.setItem('chat_username', name);
        nameModal.style.display = 'none';
        app.style.display = 'flex';
        setAdminUI();
        startRealtime();
    });

    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveNameBtn.click();
    });

    unlockAdminBtn?.addEventListener('click', () => {
        const code = (adminCodeInput.value || '').trim();
        if (code === ADMIN_CODE) {
            isAdmin = true;
            localStorage.setItem('chat_admin_unlocked', 'true');
            setAdminUI();
            renderOnlineUsers();
            loadGlobalHistory();
            if (activePrivateRecipient) loadPrivateHistory();
            alert('Admin slået til');
        } else {
            alert('Forkert kode');
        }
    });

    adminDeleteAllBtn?.addEventListener('click', deleteAllMessages);
    adminCleanupBtn?.addEventListener('click', cleanupBrokenMessages);

    async function sendGlobalMessage() {
        if (currentUserIsKicked) return alert('Du er kicked og kan ikke skrive.');
        const content = globalInput.value.trim();
        if (!content) return;
        try {
            const { error } = await supabase
                .from('messages')
                .insert([{ 
                    sender: currentUser, 
                    content,
                    type: 'global',
                    created_at: new Date().toISOString()
                }]);
            if (error) throw error;
            globalInput.value = '';
        } catch (error) {
            console.error('Fejl ved afsendelse:', error);
            alert('Kunne ikke sende besked. Tjek din forbindelse.');
        }
    }

    async function sendPrivateMessage() {
        if (currentUserIsKicked) return alert('Du er kicked og kan ikke skrive.');
        if (!activePrivateRecipient) return;
        const content = privateInput.value.trim();
        if (!content) return;
        try {
            const { error } = await supabase
                .from('messages')
                .insert([{ 
                    sender: currentUser, 
                    content,
                    type: 'private', 
                    recipient: activePrivateRecipient,
                    created_at: new Date().toISOString()
                }]);
            if (error) throw error;
            privateInput.value = '';
        } catch (error) {
            console.error('Fejl ved afsendelse af privat besked:', error);
            alert('Kunne ikke sende privat besked.');
        }
    }

    function openPrivateChat(recipient) {
        activePrivateRecipient = recipient;
        privateRecipientName.textContent = `💬 Privat med ${recipient}`;
        privateMessagesDiv.innerHTML = '';
        privateModal.style.display = 'flex';
        loadPrivateHistory();
    }

    function closePrivateChat() {
        privateModal.style.display = 'none';
        activePrivateRecipient = null;
        privateMessagesDiv.innerHTML = '';
    }

    function startTypingIndicator(isPrivate, isTyping) {
        const channel = isPrivate ? privateChannel : globalChannel;
        if (!channel) return;
        channel.send({
            type: 'broadcast',
            event: isPrivate ? 'typing-private' : 'typing-global',
            payload: {
                username: currentUser,
                recipient: isPrivate ? activePrivateRecipient : null,
                typing: isTyping,
            }
        });
    }

    function updateTypingIndicator(text) {
        let el = document.getElementById('typingIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'typingIndicator';
            el.className = 'typing-indicator';
            document.querySelector('.chat-main').insertBefore(el, document.querySelector('.chat-input-area'));
        }
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
    }

    function updatePrivateTypingIndicator(text) {
        let el = document.getElementById('privateTypingIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'privateTypingIndicator';
            el.className = 'typing-indicator private';
            const modal = document.querySelector('.modal');
            modal.insertBefore(el, document.querySelector('.private-input-area'));
        }
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
    }

    async function startRealtime() {
        if (!currentUser) return;

        if (globalChannel) await supabase.removeChannel(globalChannel);
        if (privateChannel) await supabase.removeChannel(privateChannel);
        if (presenceChannel) await supabase.removeChannel(presenceChannel);
        if (kickedChannel) await supabase.removeChannel(kickedChannel);

        globalChannel = supabase
            .channel('global-messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'type=eq.global' }, (payload) => {
                displayGlobalMessage(payload.new);
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: 'type=eq.global' }, (payload) => {
                removeMessagesFromDomById(payload.old.id);
            })
            .on('broadcast', { event: 'typing-global' }, ({ payload }) => {
                if (!payload || payload.username === currentUser) return;
                updateTypingIndicator(`${payload.username} skriver...`);
                clearTimeout(typingTimeoutGlobal);
                typingTimeoutGlobal = setTimeout(() => updateTypingIndicator(''), 1500);
            })
            .subscribe();

        privateChannel = supabase
            .channel('private-messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'type=eq.private' }, (payload) => {
                const msg = payload.new;
                if (activePrivateRecipient) displayPrivateMessage(msg);
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: 'type=eq.private' }, (payload) => {
                removeMessagesFromDomById(payload.old.id);
            })
            .on('broadcast', { event: 'typing-private' }, ({ payload }) => {
                if (!payload || payload.username === currentUser) return;
                if (payload.recipient !== currentUser) return;
                updatePrivateTypingIndicator(`${payload.username} skriver privat...`);
                clearTimeout(typingTimeoutPrivate);
                typingTimeoutPrivate = setTimeout(() => updatePrivateTypingIndicator(''), 1500);
            })
            .subscribe();

        presenceChannel = supabase.channel('online-users', {
            config: {
                presence: { key: currentUser },
            },
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                onlineUsers.clear();
                Object.keys(state).forEach(key => {
                    const presences = state[key];
                    if (Array.isArray(presences)) {
                        presences.forEach(p => {
                            if (p.username) onlineUsers.set(p.username, { username: p.username });
                        });
                    }
                });
                renderOnlineUsers();
            })
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                newPresences.forEach(p => {
                    if (p.username) onlineUsers.set(p.username, { username: p.username });
                });
                renderOnlineUsers();
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                leftPresences.forEach(p => {
                    if (p.username) onlineUsers.delete(p.username);
                });
                renderOnlineUsers();
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        username: currentUser,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        kickedChannel = supabase
            .channel('kicked-users')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'kicked_users' }, () => {
                loadKickedUsers();
            })
            .subscribe();

        await Promise.all([loadGlobalHistory(), loadKickedUsers()]);
    }

    // Message action delegation
    globalMessagesDiv.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-message-btn');
        if (!deleteBtn) return;
        const messageId = deleteBtn.dataset.messageId;
        if (!messageId) return;
        deleteMessage(messageId);
    });

    privateMessagesDiv.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-message-btn');
        if (!deleteBtn) return;
        const messageId = deleteBtn.dataset.messageId;
        if (!messageId) return;
        deleteMessage(messageId);
    });

    sendGlobalBtn.addEventListener('click', sendGlobalMessage);
    globalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGlobalMessage();
    });
    globalInput.addEventListener('input', () => {
        if (sentGlobalTyping) {
            clearTimeout(typingTimeoutGlobal);
        }
        sentGlobalTyping = true;
        startTypingIndicator(false, true);
        clearTimeout(typingTimeoutGlobal);
        typingTimeoutGlobal = setTimeout(() => {
            sentGlobalTyping = false;
            startTypingIndicator(false, false);
            updateTypingIndicator('');
        }, 700);
    });

    sendPrivateBtn.addEventListener('click', sendPrivateMessage);
    privateInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendPrivateMessage();
    });
    privateInput.addEventListener('input', () => {
        if (!activePrivateRecipient) return;
        if (sentPrivateTyping) {
            clearTimeout(typingTimeoutPrivate);
        }
        sentPrivateTyping = true;
        startTypingIndicator(true, true);
        clearTimeout(typingTimeoutPrivate);
        typingTimeoutPrivate = setTimeout(() => {
            sentPrivateTyping = false;
            startTypingIndicator(true, false);
            updatePrivateTypingIndicator('');
        }, 700);
    });

    closePrivateBtn.addEventListener('click', closePrivateChat);
    privateModal.addEventListener('click', (e) => {
        if (e.target === privateModal) closePrivateChat();
    });

    globalInput.addEventListener('blur', () => {
        sentGlobalTyping = false;
        startTypingIndicator(false, false);
        updateTypingIndicator('');
    });
    privateInput.addEventListener('blur', () => {
        sentPrivateTyping = false;
        startTypingIndicator(true, false);
        updatePrivateTypingIndicator('');
    });

    setAdminUI();
    initUsername();
})();