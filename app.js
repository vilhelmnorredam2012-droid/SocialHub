const SUPABASE_URL = "https://kglluoywbhirrewhyrrk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2dm5tdHBldnFycW11aHBtemd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjMyMTYsImV4cCI6MjA5MzE5OTIxNn0.L2WiQmO3p3x-xezLMrXASjZMJeaF7E284gAP_MF1PFU";
const ADMIN_CODE = "fugle123";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUsername = null;
let isAdmin = false;
let currentPrivateUser = null;
let currentPrivateUsername = null;
let messageSubscription = null;
let onlineSubscription = null;
let privateSubscription = null;

// ================= AUTH =================
const authContainer = document.getElementById("auth-container");
const mainApp = document.getElementById("main-app");
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const usernameInput = document.getElementById("username");
const toggleAuth = document.getElementById("toggle-auth-mode");
const authError = document.getElementById("auth-error");
const currentUsernameDisplay = document.getElementById("current-username");
const logoutBtn = document.getElementById("logout-btn");

let isLogin = true;

// BUG FIX #1: Tjek existing session ved page load
async function checkExistingSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadUserProfile();
    startApp();
  }
}

checkExistingSession();

toggleAuth.onclick = () => {
  isLogin = !isLogin;
  usernameInput.style.display = isLogin ? "none" : "block";
  toggleAuth.textContent = isLogin ? "Opret konto i stedet" : "Log ind i stedet";
  authError.textContent = "";
};

// BUG FIX #2: Gem username i database ved sign up
authForm.onsubmit = async (e) => {
  e.preventDefault();
  authError.textContent = "";

  if (isLogin) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailInput.value,
      password: passwordInput.value,
    });

    if (error) {
      authError.textContent = error.message;
      return;
    }

    currentUser = data.user;
    await loadUserProfile();
    startApp();
  } else {
    // BUG FIX #6: Validér username
    if (!usernameInput.value.trim()) {
      authError.textContent = "Brugernavn er påkrævet";
      return;
    }

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("username", usernameInput.value.trim())
      .single();

    if (existingUser) {
      authError.textContent = "Brugernavn er allerede taget";
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: emailInput.value,
      password: passwordInput.value,
    });

    if (error) {
      authError.textContent = error.message;
      return;
    }

    // BUG FIX #12: Gem username i users tabel
    if (data.user) {
      const { error: insertError } = await supabase
        .from("users")
        .insert({
          id: data.user.id,
          username: usernameInput.value.trim(),
          email: emailInput.value,
        });

      if (insertError) {
        authError.textContent = "Fejl ved oprettelse af bruger: " + insertError.message;
        return;
      }
    }

    authError.textContent = "Konto oprettet! Log ind nu.";
    isLogin = true;
    usernameInput.style.display = "none";
    toggleAuth.textContent = "Opret konto i stedet";
    emailInput.value = "";
    passwordInput.value = "";
    usernameInput.value = "";
  }
};

// BUG FIX #3: Implementer logout
logoutBtn.onclick = async () => {
  // Aflyst alle subscriptions
  if (messageSubscription) messageSubscription.unsubscribe();
  if (onlineSubscription) onlineSubscription.unsubscribe();
  if (privateSubscription) privateSubscription.unsubscribe();

  // Slet presence
  if (currentUser) {
    await supabase
      .from("presence")
      .delete()
      .eq("user_id", currentUser.id);
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    alert("Fejl ved logout: " + error.message);
    return;
  }

  // Reset variabler
  currentUser = null;
  currentUsername = null;
  isAdmin = false;
  currentPrivateUser = null;

  // Reset UI
  authContainer.style.display = "flex";
  mainApp.classList.remove("show");
  emailInput.value = "";
  passwordInput.value = "";
  usernameInput.value = "";
  authError.textContent = "";
  isLogin = true;
  usernameInput.style.display = "none";
  toggleAuth.textContent = "Opret konto i stedet";
};

// BUG FIX #11: Load user profil fra users tabel
async function loadUserProfile() {
  const { data, error } = await supabase
    .from("users")
    .select("username")
    .eq("id", currentUser.id)
    .single();

  if (!error && data) {
    currentUsername = data.username;
    currentUsernameDisplay.textContent = `📝 ${data.username}`;
  } else {
    currentUsername = currentUser.email.split("@")[0];
    currentUsernameDisplay.textContent = `📝 ${currentUsername}`;
  }
}

async function startApp() {
  authContainer.style.display = "none";
  mainApp.classList.add("show");

  // BUG FIX #11: Insert presence when user logs in
  await insertPresence();

  loadMessages();
  subscribeMessages();
  loadOnlineUsers();
  subscribeOnlineUsers();
}

// ================= GLOBAL CHAT =================
const globalMessages = document.getElementById("global-messages");
const globalForm = document.getElementById("global-message-form");
const globalInput = document.getElementById("global-input");

globalForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!globalInput.value.trim()) return;

  globalInput.disabled = true;

  try {
    await supabase.from("messages").insert({
      content: globalInput.value.trim(),
      user_id: currentUser.id,
      username: currentUsername,
    });

    globalInput.value = "";
  } catch (error) {
    alert("Fejl ved afsendelse: " + error.message);
  } finally {
    globalInput.disabled = false;
    globalInput.focus();
  }
};

async function loadMessages() {
  try {
    // BUG FIX #14: Limiter antal beskedelser
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    globalMessages.innerHTML = "";
    data.forEach(renderMessage);
    globalMessages.scrollTop = globalMessages.scrollHeight;
  } catch (error) {
    console.error("Fejl ved loading af beskeder:", error);
  }
}

// BUG FIX #9: Bedre HTML struktur og XSS protection
function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "message";

  const isOwn = msg.user_id === currentUser.id;

  // Opret strukturerede elementer i stedet for innerHTML
  const authorSpan = document.createElement("span");
  authorSpan.className = "author";
  authorSpan.textContent = msg.username || msg.user_id.slice(0, 6);

  const contentSpan = document.createElement("span");
  contentSpan.style.wordBreak = "break-word";
  contentSpan.textContent = msg.content;

  const timeSpan = document.createElement("span");
  timeSpan.className = "time";
  timeSpan.textContent = new Date(msg.created_at).toLocaleTimeString("da-DK");

  div.appendChild(authorSpan);
  div.appendChild(contentSpan);
  div.appendChild(timeSpan);

  // Tilføj delete knap hvis ejer eller admin
  if (isOwn || isAdmin) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";
    deleteBtn.style.marginLeft = "8px";
    deleteBtn.style.background = "none";
    deleteBtn.style.border = "none";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.color = "var(--danger)";
    deleteBtn.onclick = () => deleteMessage(msg.id);
    div.appendChild(deleteBtn);
  }

  globalMessages.appendChild(div);
}

async function deleteMessage(id) {
  if (!confirm("Slet denne besked?")) return;

  try {
    await supabase.from("messages").delete().eq("id", id);
  } catch (error) {
    alert("Fejl ved sletning: " + error.message);
  }
}

// BUG FIX #13: Bedre real-time subscription
function subscribeMessages() {
  messageSubscription = supabase
    .channel("public:messages")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => loadMessages()
    )
    .subscribe();
}

// ================= ONLINE USERS =================
// BUG FIX #2: Implementér online liste

async function insertPresence() {
  try {
    await supabase.from("presence").insert({
      user_id: currentUser.id,
      username: currentUsername,
      online: true,
    });
  } catch (error) {
    console.error("Fejl ved insert presence:", error);
  }
}

async function loadOnlineUsers() {
  try {
    const { data, error } = await supabase
      .from("presence")
      .select("user_id, username")
      .eq("online", true)
      .order("username");

    if (error) throw error;

    const onlineList = document.getElementById("online-list");
    onlineList.innerHTML = "";

    data.forEach((user) => {
      if (user.user_id === currentUser.id) return; // Skip self

      const li = document.createElement("li");
      li.textContent = user.username || user.user_id.slice(0, 6);
      li.dataset.userId = user.user_id;
      li.dataset.username = user.username;
      li.onclick = () => startPrivateChat(user.user_id, user.username);
      onlineList.appendChild(li);
    });
  } catch (error) {
    console.error("Fejl ved loading online users:", error);
  }
}

// BUG FIX #11: Real-time online status
function subscribeOnlineUsers() {
  onlineSubscription = supabase
    .channel("public:presence")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "presence" },
      () => loadOnlineUsers()
    )
    .subscribe();
}

// ================= ADMIN =================
const adminBtn = document.getElementById("admin-btn");
const adminModal = document.getElementById("admin-panel-modal");
const adminPasswordModal = document.getElementById("admin-password-modal");
const adminPasswordInput = document.getElementById("admin-password-input");
const adminPasswordSubmit = document.getElementById("admin-password-submit");
const closeAdminPassword = document.getElementById("close-admin-password");
const closeAdminPanel = document.getElementById("close-admin-panel");

adminBtn.onclick = () => {
  adminPasswordModal.classList.add("show");
  adminPasswordInput.value = "";
  adminPasswordInput.focus();
};

adminPasswordSubmit.onclick = () => {
  if (adminPasswordInput.value === ADMIN_CODE) {
    isAdmin = true;
    adminPasswordModal.classList.remove("show");
    adminModal.classList.add("show");
    loadUsers();
  } else {
    alert("Forkert admin kode");
    adminPasswordInput.value = "";
    adminPasswordInput.focus();
  }
};

// BUG FIX #5: Modal close buttons
closeAdminPassword.onclick = () => {
  adminPasswordModal.classList.remove("show");
};

closeAdminPanel.onclick = () => {
  adminModal.classList.remove("show");
  isAdmin = false;
};

// BUG FIX #7: Load users fra users tabel i stedet for admin API
async function loadUsers() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, email, suspended, blocked")
      .order("username");

    if (error) throw error;

    const container = document.getElementById("admin-users-list");
    
    if (data.length === 0) {
      container.innerHTML = "<p>Ingen brugere fundet</p>";
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Brugernavn</th>
            <th>Email</th>
            <th>Status</th>
            <th>Handlinger</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((user) => {
      const status = user.blocked ? "🚫 Blokeret" : user.suspended ? "⏸️ Suspenderet" : "✅ Aktiv";
      const buttons = user.blocked
        ? `<button class="btn-unblock" onclick="unblockUser('${user.id}')">Fjern blokering</button>`
        : user.suspended
        ? `<button class="btn-unsuspend" onclick="unsuspendUser('${user.id}')">Ophæv suspension</button>`
        : `
            <button class="btn-suspend" onclick="suspendUser('${user.id}')">Suspender</button>
            <button class="btn-block" onclick="blockUser('${user.id}')">Blokér</button>
          `;

      html += `
        <tr>
          <td>${escapeHtml(user.username)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${status}</td>
          <td>${buttons}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  } catch (error) {
    alert("Fejl ved loading af brugere: " + error.message);
    console.error(error);
  }
}

// BUG FIX #8: Implementer suspend/block/unblock korrekt
window.suspendUser = async (userId) => {
  try {
    const { error } = await supabase
      .from("users")
      .update({ suspended: true })
      .eq("id", userId);

    if (error) throw error;
    loadUsers();
  } catch (error) {
    alert("Fejl: " + error.message);
  }
};

window.unsuspendUser = async (userId) => {
  try {
    const { error } = await supabase
      .from("users")
      .update({ suspended: false })
      .eq("id", userId);

    if (error) throw error;
    loadUsers();
  } catch (error) {
    alert("Fejl: " + error.message);
  }
};

window.blockUser = async (userId) => {
  try {
    const { error } = await supabase
      .from("users")
      .update({ blocked: true })
      .eq("id", userId);

    if (error) throw error;
    loadUsers();
  } catch (error) {
    alert("Fejl: " + error.message);
  }
};

window.unblockUser = async (userId) => {
  try {
    const { error } = await supabase
      .from("users")
      .update({ blocked: false })
      .eq("id", userId);

    if (error) throw error;
    loadUsers();
  } catch (error) {
    alert("Fejl: " + error.message);
  }
};

// ================= PRIVATE CHAT =================
const privateModal = document.getElementById("private-chat-modal");
const privateChatTitle = document.getElementById("private-chat-title");
const privateMessages = document.getElementById("private-messages");
const privateForm = document.getElementById("private-message-form");
const privateInput = document.getElementById("private-input");
const closePrivateChat = document.getElementById("close-private-chat");

// BUG FIX #5: Close private chat modal
closePrivateChat.onclick = () => {
  privateModal.classList.remove("show");
  if (privateSubscription) privateSubscription.unsubscribe();
};

// BUG FIX #11: Start private chat med user info
function startPrivateChat(userId, username) {
  currentPrivateUser = userId;
  currentPrivateUsername = username;
  privateChatTitle.textContent = `💬 Chat med ${username}`;
  privateModal.classList.add("show");
  loadPrivate();
}

privateForm.onsubmit = async (e) => {
  e.preventDefault();

  if (!privateInput.value.trim()) return;

  privateInput.disabled = true;

  try {
    await supabase.from("private_messages").insert({
      from: currentUser.id,
      from_username: currentUsername,
      to: currentPrivateUser,
      to_username: currentPrivateUsername,
      content: privateInput.value.trim(),
    });

    privateInput.value = "";
    loadPrivate();
  } catch (error) {
    alert("Fejl ved afsendelse: " + error.message);
  } finally {
    privateInput.disabled = false;
    privateInput.focus();
  }
};

// BUG FIX #4: Korrekt SQL query for private messages
async function loadPrivate() {
  try {
    const { data, error } = await supabase
      .from("private_messages")
      .select("*")
      .or(
        `and(from.eq.${currentUser.id},to.eq.${currentPrivateUser}),and(from.eq.${currentPrivateUser},to.eq.${currentUser.id})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    privateMessages.innerHTML = "";

    data.forEach((msg) => {
      const div = document.createElement("div");
      div.className = "message";
      div.style.alignSelf = msg.from === currentUser.id ? "flex-end" : "flex-start";

      const authorSpan = document.createElement("span");
      authorSpan.className = "author";
      authorSpan.textContent = msg.from_username || msg.from.slice(0, 6);

      const contentSpan = document.createElement("span");
      contentSpan.textContent = msg.content;

      const timeSpan = document.createElement("span");
      timeSpan.className = "time";
      timeSpan.textContent = new Date(msg.created_at).toLocaleTimeString("da-DK");

      div.appendChild(authorSpan);
      div.appendChild(contentSpan);
      div.appendChild(timeSpan);

      if (msg.from === currentUser.id || isAdmin) {
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "🗑";
        deleteBtn.style.marginLeft = "8px";
        deleteBtn.style.background = "none";
        deleteBtn.style.border = "none";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.color = "var(--danger)";
        deleteBtn.onclick = () => deletePrivate(msg.id);
        div.appendChild(deleteBtn);
      }

      privateMessages.appendChild(div);
    });

    privateMessages.scrollTop = privateMessages.scrollHeight;

    // BUG FIX #13: Real-time updates for private messages
    if (privateSubscription) privateSubscription.unsubscribe();
    subscribePrivateMessages();
  } catch (error) {
    console.error("Fejl ved loading private messages:", error);
  }
}

function subscribePrivateMessages() {
  privateSubscription = supabase
    .channel(`private:${currentPrivateUser}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "private_messages" },
      () => loadPrivate()
    )
    .subscribe();
}

async function deletePrivate(id) {
  if (!confirm("Slet denne besked?")) return;

  try {
    await supabase.from("private_messages").delete().eq("id", id);
    loadPrivate();
  } catch (error) {
    alert("Fejl ved sletning: " + error.message);
  }
}

// ================= UTILITY =================
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
