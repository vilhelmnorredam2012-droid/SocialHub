(function() {
    const SUPABASE_URL = "https://kglluoywbhirrewhyrrk.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGx1b3l3YmhpcnJld2h5cnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDk5MjIsImV4cCI6MjA5MzEyNTkyMn0.Ha_XIs2cIJaLhs7-oQF6PkhHxYT-SRjVJ1hCLHDVZOc";
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const ADMIN_CODE = 'fugle123';

    // ===== DOM =====
    const loginModal = document.getElementById('loginModal');
    const usernameInput = document.getElementById('usernameInput');
    const loginBtn = document.getElementById('loginBtn');
    const app = document.getElementById('app');

    const globalMessages = document.getElementById('globalMessages');
    const globalInput = document.getElementById('globalInput');
    const sendGlobalBtn = document.getElementById('sendGlobalBtn');
    const userInfo = document.getElementById('userInfo');
    const onlineUsersList = document.getElementById('onlineUsersList');
    const onlineCount = document.getElementById('onlineCount');
    const logoutBtn = document.getElementById('logoutBtn');

    const adminPanel = document.getElementById('adminPanel');
    const adminDashboardBtn = document.getElementById('adminDashboardBtn');
    const adminModal = document.getElementById('adminModal');
    const closeAdminBtn = document.getElementById('closeAdminBtn');

    const statUsers = document.getElementById('statUsers');
    const statComments = document.getElementById('statComments');
    const statMessages = document.getElementById('statMessages');
    const adminUsersList = document.getElementById('adminUsersList');
    const adminDeleteCommentsBtn = document.getElementById('adminDeleteCommentsBtn');
    const adminDeleteLikesBtn = document.getElementById('adminDeleteLikesBtn');
    const adminDeleteMessagesBtn = document.getElementById('adminDeleteMessagesBtn');
    const adminSuspendUserBtn = document.getElementById('adminSuspendUserBtn');
    const adminClearUserDataBtn = document.getElementById('adminClearUserDataBtn');
    const adminNukeBtn = document.getElementById('adminNukeBtn');
    const adminUnsuspendAllBtn = document.getElementById('adminUnsuspendAllBtn');

    const privateChatModal = document.getElementById('privateChatModal');
    const privateChatTitle = document.getElementById('privateChatTitle');
    const privateChatSubtitle = document.getElementById('privateChatSubtitle');
    const closePrivateChatBtn = document.getElementById('closePrivateChatBtn');
    const privateMessages = document.getElementById('privateMessages');
    const privateMessageInput = document.getElementById('privateMessageInput');
    const sendPrivateBtn = document.getElementById('sendPrivateBtn');

    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelpBtn = document.getElementById('closeHelpBtn');

    const toastContainer = document.getElementById('toastContainer');

    // ===== STATE =====
    let currentUser = null;
    let onlineUsers = new Map();
    let loadedMessageIds = new Set();
    let loadedPrivateMessageIds = new Set();
    let adminUnlocked = false;
    let suspendedUsers = new Set();
    let currentPrivateUser = null;
    let realtimeStarted = false;

    let messageChannel = null;
    let presenceChannel = null;

    // ===== UTILS =====
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function formatTime(date) {
        return new Date(date).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateShort(date) {
        const d = new Date(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return 'I dag';
        if (d.toDateString() === yesterday.toDateString()) return 'I går';
        return d.toLocaleDateString('da-DK', { month: 'short', day: 'numeric' });
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';

        const colors = {
            info: 'rgba(88, 101, 242, 0.98)',
            success: 'rgba(22, 163, 74, 0.98)',
            warning: 'rgba(217, 119, 6, 0.98)',
            error: 'rgba(220, 38, 38, 0.98)'
        };

        toast.style.background = colors[type] || colors.info;
        toast.textContent = message;

        toast.addEventListener('click', () => toast.remove());
        toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.isConnected) toast.remove();
        }, 5000);
    }

    function notify(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    }

    function requestNotificationsIfNeeded() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    function openModal(modal) {
        modal.style.display = 'flex';
    }

    function closeModal(modal) {
        modal.style.display = 'none';
    }

    function saveSuspended() {
        localStorage.setItem('suspended_users', JSON.stringify(Array.from(suspendedUsers)));
    }

    function loadSuspended() {
        const suspended = localStorage.getItem('suspended_users');
        suspendedUsers = suspended ? new Set(JSON.parse(suspended)) : new Set();
    }

    function isSuspended(username) {
        return suspendedUsers.has(username);
    }

    function stopRealtime() {
        if (messageChannel) {
            supabase.removeChannel(messageChannel);
            messageChannel = null;
        }

        if (presenceChannel) {
            supabase.removeChannel(presenceChannel);
            presenceChannel = null;
        }

        realtimeStarted = false;
    }

    function refreshGlobalHistory() {
        loadedMessageIds.clear();
        globalMessages.innerHTML = '';
        loadGlobalHistory();
    }

    function refreshPrivateHistory() {
        if (!currentPrivateUser) return;
        loadedPrivateMessageIds.clear();
        privateMessages.innerHTML = '';
        loadPrivateHistory(currentPrivateUser);
    }

    function removeMessageElementById(id) {
        const globalEl = globalMessages.querySelector(`[data-message-id="${id}"]`);
        if (globalEl) globalEl.remove();
        loadedMessageIds.delete(id);

        const privateEl = privateMessages.querySelector(`[data-private-message-id="${id}"]`);
        if (privateEl) privateEl.remove();
        loadedPrivateMessageIds.delete(id);
    }

    function canSeeDeleteButton(sender) {
        return sender === currentUser;
    }

    function createMessageElement(msg, isPrivate = false) {
        const isSelf = msg.sender === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSelf ? 'self' : 'other'}`;

        if (isPrivate) {
            div.dataset.privateMessageId = String(msg.id);
        } else {
            div.dataset.messageId = String(msg.id);
        }

        div.innerHTML = `
            <div class="message-sender">${isSelf ? 'dig' : escapeHtml(msg.sender)}</div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-time">${formatTime(msg.created_at)}</div>
            ${canSeeDeleteButton(msg.sender) ? `<button class="message-delete" data-delete-msg="${msg.id}">🗑</button>` : ''}
        `;

        const deleteBtn = div.querySelector('[data-delete-msg]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const msgId = Number(e.currentTarget.getAttribute('data-delete-msg'));
                if (!confirm('Slet besked?')) return;

                const { error } = await supabase.from('messages').delete().eq('id', msgId);
                if (error) {
                    showToast('Kunne ikke slette besked', 'error');
                } else {
                    div.remove();
                    if (isPrivate) {
                        loadedPrivateMessageIds.delete(msgId);
                    } else {
                        loadedMessageIds.delete(msgId);
                    }
                }
            });
        }

        return div;
    }

    function appendMessage(container, loadedSet, msg, isPrivate = false) {
        if (loadedSet.has(msg.id) || isSuspended(msg.sender)) return;
        loadedSet.add(msg.id);
        container.appendChild(createMessageElement(msg, isPrivate));
        container.scrollTop = container.scrollHeight;
    }

    async function sendMessage({ sender, content, type, receiver = null }) {
        const payload = {
            sender,
            content,
            type,
            receiver
        };

        const { error } = await supabase.from('messages').insert([payload]);
        return { error };
    }

    // ===== LOGIN =====
    function initLogin() {
        loadSuspended();

        const stored = localStorage.getItem('socialhub_user');
        if (stored && stored.trim()) {
            currentUser = stored.trim();
            adminUnlocked = localStorage.getItem('admin_unlocked') === 'true';
            login();
        }
    }

    async function login() {
        if (!currentUser) return;

        await supabase.from('users').upsert({
            username: currentUser
        }, { onConflict: 'username' });

        loginModal.style.display = 'none';
        app.style.display = 'flex';
        userInfo.textContent = `👤 ${escapeHtml(currentUser)}`;

        if (adminUnlocked) {
            adminPanel.style.display = 'block';
        }

        requestNotificationsIfNeeded();

        if (!realtimeStarted) {
            startRealtime();
            realtimeStarted = true;
        } else {
            refreshGlobalHistory();
            renderOnlineUsers();
        }

        showToast(`Velkommen ${currentUser} 👋`, 'success');
    }

    loginBtn.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        if (!name) return alert('Skriv et brugernavn');
        if (name.length < 2) return alert('Min 2 tegn');

        currentUser = name;
        localStorage.setItem('socialhub_user', name);
        login();
    });

    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    logoutBtn.addEventListener('click', () => {
        stopRealtime();
        localStorage.removeItem('socialhub_user');
        localStorage.removeItem('admin_unlocked');
        currentUser = null;
        adminUnlocked = false;
        currentPrivateUser = null;
        app.style.display = 'none';
        loginModal.style.display = 'flex';
        usernameInput.value = '';
        usernameInput.focus();
        showToast('Logget ud', 'info');
    });

    // ===== HELP MODAL =====
    helpBtn.addEventListener('click', () => openModal(helpModal));
    closeHelpBtn.addEventListener('click', () => closeModal(helpModal));
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) closeModal(helpModal);
    });

    // ===== ADMIN UNLOCK =====
    const adminUnlockBtn = document.createElement('button');
    adminUnlockBtn.className = 'btn btn-block';
    adminUnlockBtn.textContent = '🔓 Unlock Admin';
    adminUnlockBtn.addEventListener('click', () => {
        const code = prompt('Admin kode:');
        if (code === ADMIN_CODE) {
            adminUnlocked = true;
            localStorage.setItem('admin_unlocked', 'true');
            adminPanel.style.display = 'block';
            showToast('Admin unlocked ⚙️', 'success');
        } else {
            showToast('Forkert kode', 'error');
        }
    });

    if (!adminPanel.querySelector('[data-admin-unlock]')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-unlock-wrapper';
        wrapper.setAttribute('data-admin-unlock', 'true');
        wrapper.appendChild(adminUnlockBtn);
        adminPanel.parentElement.insertBefore(wrapper, adminPanel);
    }

    adminDashboardBtn.addEventListener('click', async () => {
        if (!adminUnlocked) return alert('Ikke admin!');
        await loadAdminStats();
        openModal(adminModal);
    });

    closeAdminBtn.addEventListener('click', () => closeModal(adminModal));

    async function loadAdminStats() {
        const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: commentCount } = await supabase.from('comments').select('*', { count: 'exact', head: true });
        const { count: messageCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });

        statUsers.textContent = userCount || 0;
        statComments.textContent = commentCount || 0;
        statMessages.textContent = messageCount || 0;

        const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        adminUsersList.innerHTML = '';

        (users || []).forEach(user => {
            const isSusp = suspendedUsers.has(user.username);
            const div = document.createElement('div');
            div.className = 'admin-user-item';
            div.innerHTML = `
                <div class="admin-user-name">
                    ${escapeHtml(user.username)}
                    ${isSusp ? '<span style="color: var(--danger); margin-left: 8px;">⛔ SUSPENDERET</span>' : ''}
                </div>
                <div class="admin-user-actions">
                    <button class="btn btn-small ${isSusp ? 'btn-success' : 'btn-warning'}" data-suspend="${user.username}">
                        ${isSusp ? '✅ Ophæv' : '⛔ Suspender'}
                    </button>
                    <button class="btn btn-small danger" data-clear="${user.username}">🗑 Slet data</button>
                </div>
            `;

            div.querySelector('[data-suspend]')?.addEventListener('click', () => {
                if (isSusp) {
                    suspendedUsers.delete(user.username);
                    showToast(`${user.username} er fri igen`, 'success');
                } else {
                    if (confirm(`Suspender ${user.username}?`)) {
                        suspendedUsers.add(user.username);
                        showToast(`${user.username} er suspenderet`, 'warning');
                    }
                }

                saveSuspended();
                loadAdminStats();
                refreshGlobalHistory();
                if (currentPrivateUser) refreshPrivateHistory();
                renderOnlineUsers();
            });

            div.querySelector('[data-clear]')?.addEventListener('click', async () => {
                if (!confirm(`Slet ALT data fra ${user.username}? Dette kan IKKE fortrydes!`)) return;

                const ops = [
                    supabase.from('comments').delete().eq('author', user.username),
                    supabase.from('likes').delete().eq('username', user.username),
                    supabase.from('messages').delete().or(`sender.eq.${user.username},receiver.eq.${user.username}`),
                    supabase.from('users').delete().eq('username', user.username)
                ];

                const results = await Promise.all(ops);
                const errors = results.filter(r => r.error);

                if (errors.length > 0) {
                    console.error('Sletningsfejl:', errors);
                    showToast('Nogle data kunne ikke slettes', 'error');
                } else {
                    showToast(`${user.username} er slettet`, 'success');
                }

                suspendedUsers.delete(user.username);
                saveSuspended();
                loadAdminStats();
                refreshGlobalHistory();
                if (currentPrivateUser) refreshPrivateHistory();
                renderOnlineUsers();
            });

            adminUsersList.appendChild(div);
        });
    }

    async function confirmAndDelete(table, displayName) {
        if (!confirm(`Slet ALLE ${displayName}? Dette kan ikke fortrydes!`)) return;

        const { error } = await supabase.from(table).delete().neq('id', 0);

        if (error) {
            console.error(`Fejl ved sletning af ${displayName}:`, error);
            showToast(`Kunne ikke slette ${displayName}`, 'error');
        } else {
            showToast(`Alle ${displayName} er slettet`, 'success');
            if (table === 'messages') {
                loadedMessageIds.clear();
                loadedPrivateMessageIds.clear();
                globalMessages.innerHTML = '';
                privateMessages.innerHTML = '';
            }
            loadAdminStats();
        }
    }

    adminDeleteCommentsBtn.addEventListener('click', () => confirmAndDelete('comments', 'kommentarer'));
    adminDeleteLikesBtn.addEventListener('click', () => confirmAndDelete('likes', 'likes'));
    adminDeleteMessagesBtn.addEventListener('click', () => confirmAndDelete('messages', 'beskeder'));

    adminSuspendUserBtn.addEventListener('click', () => {
        const target = prompt('Brugernavn der skal suspenderes:');
        if (!target || !target.trim()) return;

        const name = target.trim();
        if (suspendedUsers.has(name)) {
            showToast(`${name} er allerede suspenderet`, 'warning');
            return;
        }

        suspendedUsers.add(name);
        saveSuspended();
        showToast(`${name} er nu suspenderet`, 'warning');
        loadAdminStats();
        refreshGlobalHistory();
        if (currentPrivateUser) refreshPrivateHistory();
        renderOnlineUsers();
    });

    adminClearUserDataBtn.addEventListener('click', async () => {
        const target = prompt('Brugernavn hvis data skal slettes:');
        if (!target || !target.trim()) return;

        const name = target.trim();
        if (!confirm(`Slet ALT data for ${name}? Dette kan IKKE fortrydes!`)) return;

        const ops = [
            supabase.from('comments').delete().eq('author', name),
            supabase.from('likes').delete().eq('username', name),
            supabase.from('messages').delete().or(`sender.eq.${name},receiver.eq.${name}`),
            supabase.from('users').delete().eq('username', name)
        ];

        const results = await Promise.all(ops);
        const errors = results.filter(r => r.error);

        if (errors.length > 0) {
            console.error('Sletningsfejl:', errors);
            showToast('Nogle data kunne ikke slettes', 'error');
        } else {
            showToast(`${name}'s data er slettet`, 'success');
        }

        suspendedUsers.delete(name);
        saveSuspended();
        loadAdminStats();
        refreshGlobalHistory();
        if (currentPrivateUser) refreshPrivateHistory();
        renderOnlineUsers();
    });

    if (adminUnsuspendAllBtn) {
        adminUnsuspendAllBtn.addEventListener('click', () => {
            if (suspendedUsers.size === 0) {
                showToast('Ingen brugere er suspenderet', 'info');
                return;
            }

            if (confirm(`Ophæv suspendering for ALLE ${suspendedUsers.size} brugere?`)) {
                suspendedUsers.clear();
                saveSuspended();
                showToast('Alle suspenderinger er ophævet', 'success');
                loadAdminStats();
                refreshGlobalHistory();
                if (currentPrivateUser) refreshPrivateHistory();
                renderOnlineUsers();
            }
        });
    }

    adminNukeBtn.addEventListener('click', async () => {
        if (!confirm('⚠️ SLET VIRKELIGT ALT? Dette kan IKKE fortrydes!')) return;
        if (!confirm('Er du 100% sikker? ALLE data i HELE databasen vil være væk!')) return;
        if (!confirm('SIDSTE ADVARSEL! Tryk OK for at slette alt!')) return;

        const tables = ['likes', 'comments', 'messages', 'users'];
        const errors = [];

        for (const table of tables) {
            const { error } = await supabase.from(table).delete().neq('id', 0);
            if (error) {
                console.error(`Nuke fejl på ${table}:`, error);
                errors.push(`${table}: ${error.message}`);
            }
        }

        loadedMessageIds.clear();
        loadedPrivateMessageIds.clear();
        globalMessages.innerHTML = '';
        privateMessages.innerHTML = '';

        if (errors.length > 0) {
            showToast('Nogle tabeller kunne ikke slettes', 'error');
        } else {
            showToast('ALT ER SLETTET', 'success');
        }

        loadAdminStats();
    });

    // ===== GLOBAL CHAT =====
    async function displayGlobalMessage(msg, fromRealtime = false) {
        if (loadedMessageIds.has(msg.id) || isSuspended(msg.sender)) return;
        loadedMessageIds.add(msg.id);

        const div = createMessageElement(msg, false);
        globalMessages.appendChild(div);
        globalMessages.scrollTop = globalMessages.scrollHeight;

        if (fromRealtime && msg.sender !== currentUser) {
            showToast(`Ny besked fra ${msg.sender}`, 'info');
            if (document.hidden) {
                notify(`Ny besked fra ${msg.sender}`, msg.content);
            }
        }
    }

    async function loadGlobalHistory() {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('type', 'global')
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) {
            console.error('Fejl ved load af beskeder:', error);
            showToast('Kunne ikke hente beskeder', 'error');
            return;
        }

        globalMessages.innerHTML = '';
        loadedMessageIds.clear();

        (data || []).forEach(msg => {
            if (!isSuspended(msg.sender)) {
                displayGlobalMessage(msg, false);
            }
        });
    }

    async function sendGlobalMessage() {
        const content = globalInput.value.trim();
        if (!content) return;

        if (isSuspended(currentUser)) {
            showToast('Du er suspenderet og kan ikke sende beskeder', 'warning');
            return;
        }

        const { error } = await sendMessage({
            sender: currentUser,
            content,
            type: 'global',
            receiver: null
        });

        if (error) {
            console.error(error);
            showToast('Kunne ikke sende besked', 'error');
        } else {
            globalInput.value = '';
            showToast('Besked sendt', 'success');
        }
    }

    sendGlobalBtn.addEventListener('click', sendGlobalMessage);
    globalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGlobalMessage();
    });

    // ===== PRIVATE CHAT =====
    function openPrivateChat(username) {
        if (!username || username === currentUser) return;

        currentPrivateUser = username;
        privateChatTitle.textContent = `💬 Privat chat med ${username}`;
        privateChatSubtitle.textContent = 'Kun jer to kan se beskederne';
        privateChatModal.style.display = 'flex';

        renderOnlineUsers();
        refreshPrivateHistory();
        setTimeout(() => privateMessageInput.focus(), 50);
    }

    closePrivateChatBtn.addEventListener('click', () => {
        closeModal(privateChatModal);
        currentPrivateUser = null;
        privateMessages.innerHTML = '';
        loadedPrivateMessageIds.clear();
        renderOnlineUsers();
    });

    async function displayPrivateMessage(msg, fromRealtime = false) {
        if (loadedPrivateMessageIds.has(msg.id) || isSuspended(msg.sender)) return;
        loadedPrivateMessageIds.add(msg.id);

        const div = createMessageElement(msg, true);
        privateMessages.appendChild(div);
        privateMessages.scrollTop = privateMessages.scrollHeight;

        if (fromRealtime && msg.sender !== currentUser) {
            showToast(`Privat besked fra ${msg.sender}`, 'success');
            if (document.hidden || privateChatModal.style.display !== 'flex' || currentPrivateUser !== msg.sender) {
                notify(`Privat besked fra ${msg.sender}`, msg.content);
            }
        }
    }

    async function loadPrivateHistory(otherUser) {
        const [sentRes, receivedRes] = await Promise.all([
            supabase
                .from('messages')
                .select('*')
                .eq('type', 'private')
                .eq('sender', currentUser)
                .eq('receiver', otherUser)
                .order('created_at', { ascending: true })
                .limit(100),
            supabase
                .from('messages')
                .select('*')
                .eq('type', 'private')
                .eq('sender', otherUser)
                .eq('receiver', currentUser)
                .order('created_at', { ascending: true })
                .limit(100)
        ]);

        if (sentRes.error) {
            console.error('Fejl ved load af private sendte beskeder:', sentRes.error);
        }
        if (receivedRes.error) {
            console.error('Fejl ved load af private modtagne beskeder:', receivedRes.error);
        }

        const all = [...(sentRes.data || []), ...(receivedRes.data || [])]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        privateMessages.innerHTML = '';
        loadedPrivateMessageIds.clear();

        all.forEach(msg => {
            if (!isSuspended(msg.sender)) {
                displayPrivateMessage(msg, false);
            }
        });

        privateMessages.scrollTop = privateMessages.scrollHeight;
    }

    async function sendPrivateMessage() {
        const content = privateMessageInput.value.trim();
        if (!content || !currentPrivateUser) return;

        if (isSuspended(currentUser)) {
            showToast('Du er suspenderet og kan ikke sende beskeder', 'warning');
            return;
        }

        const { error } = await sendMessage({
            sender: currentUser,
            receiver: currentPrivateUser,
            content,
            type: 'private'
        });

        if (error) {
            console.error(error);
            showToast('Kunne ikke sende privat besked', 'error');
        } else {
            privateMessageInput.value = '';
            showToast('Privat besked sendt', 'success');
        }
    }

    sendPrivateBtn.addEventListener('click', sendPrivateMessage);
    privateMessageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendPrivateMessage();
    });

    // ===== REALTIME =====
    async function startRealtime() {
        messageChannel = supabase
            .channel('messages-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'type=eq.global' }, (payload) => {
                displayGlobalMessage(payload.new, true);
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'type=eq.private' }, (payload) => {
                const msg = payload.new;

                const relevantToCurrentPrivate =
                    currentPrivateUser &&
                    (
                        (msg.sender === currentUser && msg.receiver === currentPrivateUser) ||
                        (msg.receiver === currentUser && msg.sender === currentPrivateUser)
                    );

                if (relevantToCurrentPrivate) {
                    displayPrivateMessage(msg, true);
                } else if (msg.receiver === currentUser || msg.sender === currentUser) {
                    showToast(`Privat besked med ${msg.sender === currentUser ? msg.receiver : msg.sender}`, 'info');
                    if (document.hidden) {
                        notify('Ny privat besked', msg.content);
                    }
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
                removeMessageElementById(payload.old.id);
            })
            .subscribe();

        presenceChannel = supabase.channel('online-users', {
            config: { presence: { key: currentUser } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                onlineUsers.clear();
                const state = presenceChannel.presenceState();

                Object.keys(state).forEach(key => {
                    (state[key] || []).forEach(p => {
                        if (p.username && !isSuspended(p.username)) {
                            onlineUsers.set(p.username, { username: p.username });
                        }
                    });
                });

                renderOnlineUsers();
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({ username: currentUser });
                }
            });

        await loadGlobalHistory();
    }

    function renderOnlineUsers() {
        const users = Array.from(onlineUsers.values()).sort((a, b) => {
            if (a.username === currentUser) return -1;
            if (b.username === currentUser) return 1;
            return a.username.localeCompare(b.username);
        });

        onlineUsersList.innerHTML = '';

        users.forEach(u => {
            const div = document.createElement('div');
            div.className = `online-user ${currentPrivateUser === u.username ? 'active' : ''}`;
            div.setAttribute('data-username', u.username);

            div.innerHTML = `
                <span class="online-dot"></span>
                <span>${escapeHtml(u.username)}${u.username === currentUser ? ' (dig)' : ''}</span>
            `;

            if (u.username !== currentUser) {
                div.addEventListener('click', () => openPrivateChat(u.username));
            }

            onlineUsersList.appendChild(div);
        });

        onlineCount.textContent = users.length;
    }

    initLogin();
})();
