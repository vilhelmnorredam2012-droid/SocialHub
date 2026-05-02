(() => {
  "use strict";

  const ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const HEARTBEAT_MS = 30 * 1000;
  const MAX_MESSAGES = 100;

  const $ = (selector) => document.querySelector(selector);

  const elements = {
    toast: $("#toast"),
    authScreen: $("#authScreen"),
    appShell: $("#appShell"),
    authForm: $("#authForm"),
    authTitle: $("#authTitle"),
    authSubtitle: $("#authSubtitle"),
    authSubmitBtn: $("#authSubmitBtn"),
    toggleAuthBtn: $("#toggleAuthBtn"),
    authMessage: $("#authMessage"),
    emailInput: $("#emailInput"),
    passwordInput: $("#passwordInput"),
    usernameInput: $("#usernameInput"),
    usernameGroup: $("#usernameGroup"),
    currentUserLabel: $("#currentUserLabel"),
    logoutBtn: $("#logoutBtn"),
    refreshBtn: $("#refreshBtn"),
    globalMessages: $("#globalMessages"),
    globalForm: $("#globalForm"),
    globalInput: $("#globalInput"),
    sendGlobalBtn: $("#sendGlobalBtn"),
    usersList: $("#usersList"),
    onlineCount: $("#onlineCount"),
    privateModal: $("#privateModal"),
    privateTitle: $("#privateTitle"),
    privateSubtitle: $("#privateSubtitle"),
    privateMessages: $("#privateMessages"),
    privateForm: $("#privateForm"),
    privateInput: $("#privateInput"),
    sendPrivateBtn: $("#sendPrivateBtn"),
    closePrivateBtn: $("#closePrivateBtn")
  };

  let sb = null;
  let authMode = "login";
  let currentUser = null;
  let currentProfile = null;
  let selectedPrivateUser = null;
  let globalChannel = null;
  let profilesChannel = null;
  let privateChannel = null;
  let heartbeatTimer = null;
  let startingApp = false;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();

    const configError = getConfigError();
    if (configError) {
      showAuthMessage(configError, "error");
      elements.authSubmitBtn.disabled = true;
      elements.toggleAuthBtn.disabled = true;
      return;
    }

    sb = window.supabase.createClient(
      window.SOCIALHUB_CONFIG.SUPABASE_URL,
      window.SOCIALHUB_CONFIG.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );

    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        await stopApp();
        showAuthScreen();
      }

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user && !currentUser) {
        await startApp(session.user);
      }
    });

    const { data, error } = await sb.auth.getSession();
    if (error) {
      showAuthMessage(formatSupabaseError(error), "error");
      return;
    }

    if (data.session?.user) {
      await startApp(data.session.user);
    } else {
      showAuthScreen();
    }
  }

  function bindEvents() {
    elements.toggleAuthBtn.addEventListener("click", () => {
      authMode = authMode === "login" ? "signup" : "login";
      updateAuthMode();
    });

    elements.authForm.addEventListener("submit", handleAuthSubmit);
    elements.logoutBtn.addEventListener("click", handleLogout);
    elements.refreshBtn.addEventListener("click", refreshAll);
    elements.globalForm.addEventListener("submit", sendGlobalMessage);
    elements.privateForm.addEventListener("submit", sendPrivateMessage);
    elements.closePrivateBtn.addEventListener("click", closePrivateChat);

    elements.privateModal.addEventListener("click", (event) => {
      if (event.target === elements.privateModal) closePrivateChat();
    });

    window.addEventListener("beforeunload", () => {
      // Browseren stopper ofte async requests her, men heartbeat rydder gamle online-statusser efter ca. 2 minutter.
      setPresence(false).catch(() => {});
    });
  }

  function getConfigError() {
    const config = window.SOCIALHUB_CONFIG || {};
    const url = String(config.SUPABASE_URL || "").trim();
    const key = String(config.SUPABASE_ANON_KEY || "").trim();

    if (!url || !key || key.includes("PASTE_YOUR_REAL_SUPABASE_ANON_PUBLIC_KEY_HERE")) {
      return "Supabase mangler at blive sat op: åbn config.js og indsæt din rigtige Project URL og anon public key.";
    }

    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
      return "SUPABASE_URL i config.js ser forkert ud. Den skal ligne: https://dit-project-ref.supabase.co";
    }

    const payload = decodeJwtPayload(key);
    const projectRef = url.replace("https://", "").replace(".supabase.co", "");

    if (!payload || payload.role !== "anon") {
      return "SUPABASE_ANON_KEY i config.js er ikke en gyldig anon public key.";
    }

    if (payload.iss && payload.iss !== "supabase") {
      return "SUPABASE_ANON_KEY i config.js er ugyldig. Den gamle nøgle i projektet havde en forkert issuer og skal erstattes.";
    }

    if (payload.ref && payload.ref !== projectRef) {
      return "SUPABASE_ANON_KEY matcher ikke SUPABASE_URL. Kopiér både Project URL og anon public key fra samme Supabase-projekt.";
    }

    return "";
  }

  function decodeJwtPayload(jwt) {
    try {
      const payloadPart = jwt.split(".")[1];
      if (!payloadPart) return null;
      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  function updateAuthMode() {
    const isSignup = authMode === "signup";
    elements.authTitle.textContent = isSignup ? "Opret konto" : "SocialHub";
    elements.authSubtitle.textContent = isSignup
      ? "Opret en bruger med email, adgangskode og brugernavn."
      : "Log ind for at chatte med andre brugere.";
    elements.usernameGroup.hidden = !isSignup;
    elements.usernameInput.required = isSignup;
    elements.passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
    elements.authSubmitBtn.textContent = isSignup ? "Opret konto" : "Log ind";
    elements.toggleAuthBtn.textContent = isSignup ? "Log ind i stedet" : "Opret konto i stedet";
    showAuthMessage("");
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    showAuthMessage("");

    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;
    const username = normalizeUsername(elements.usernameInput.value);

    if (!email || !password) {
      showAuthMessage("Udfyld email og adgangskode.", "error");
      return;
    }

    if (password.length < 6) {
      showAuthMessage("Adgangskoden skal være mindst 6 tegn.", "error");
      return;
    }

    if (authMode === "signup" && !username) {
      showAuthMessage("Vælg et brugernavn på 2-24 tegn.", "error");
      return;
    }

    setButtonLoading(elements.authSubmitBtn, true, authMode === "signup" ? "Opretter..." : "Logger ind...");

    try {
      if (authMode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        });

        if (error) throw error;

        if (data.session?.user) {
          await startApp(data.session.user, username);
          showToast("Konto oprettet! Velkommen til SocialHub. 🎉", "success");
          return;
        }

        showAuthMessage("Kontoen er oprettet. Bekræft din email, og log derefter ind.", "success");
        authMode = "login";
        updateAuthMode();
        elements.passwordInput.value = "";
        return;
      }

      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await startApp(data.user);
      showToast("Velkommen tilbage! 👋", "success");
    } catch (error) {
      showAuthMessage(formatSupabaseError(error), "error");
    } finally {
      setButtonLoading(elements.authSubmitBtn, false);
    }
  }

  async function startApp(user, usernameHint = "") {
    if (startingApp) return;
    startingApp = true;

    try {
      currentUser = user;
      currentProfile = await ensureProfile(user, usernameHint);

      if (!currentProfile) {
        throw new Error("Profilen kunne ikke hentes eller oprettes. Tjek supabase-setup.sql og RLS policies.");
      }

      // Kald cleanup funktion for at slette gamle beskeder
      try {
        await sb.rpc("cleanup_old_messages");
      } catch (cleanupError) {
        console.log("Cleanup ikke tilgængelig (dette er OK hvis pg_cron ikke er enabled):", cleanupError.message);
      }

      elements.authScreen.hidden = true;
      elements.appShell.hidden = false;
      elements.currentUserLabel.textContent = `@${currentProfile.username}`;

      await setPresence(true);
      await refreshAll();
      subscribeGlobalMessages();
      subscribeProfiles();
      startHeartbeat();
      elements.globalInput.focus();
    } catch (error) {
      await stopApp(false);
      showAuthScreen();
      showAuthMessage(formatSupabaseError(error), "error");
    } finally {
      startingApp = false;
    }
  }

  async function ensureProfile(user, usernameHint = "") {
    const fallbackUsername = normalizeUsername(
      usernameHint || user.user_metadata?.username || user.email?.split("@")[0] || "bruger"
    );

    const { data: existingProfile, error: fetchError } = await sb
      .from("profiles")
      .select("id, username, is_online, last_seen, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existingProfile) return existingProfile;

    const { data: insertedProfile, error: insertError } = await sb
      .from("profiles")
      .upsert(
        {
          id: user.id,
          username: fallbackUsername || `bruger_${user.id.slice(0, 6)}`,
          is_online: true,
          last_seen: new Date().toISOString()
        },
        { onConflict: "id" }
      )
      .select("id, username, is_online, last_seen, created_at")
      .single();

    if (insertError) throw insertError;
    return insertedProfile;
  }

  async function stopApp(updatePresence = true) {
    if (updatePresence && currentUser) {
      await setPresence(false).catch(() => {});
    }

    clearInterval(heartbeatTimer);
    heartbeatTimer = null;

    if (globalChannel) await sb.removeChannel(globalChannel).catch(() => {});
    if (profilesChannel) await sb.removeChannel(profilesChannel).catch(() => {});
    if (privateChannel) await sb.removeChannel(privateChannel).catch(() => {});

    globalChannel = null;
    profilesChannel = null;
    privateChannel = null;
    currentUser = null;
    currentProfile = null;
    selectedPrivateUser = null;
  }

  function showAuthScreen() {
    elements.authScreen.hidden = false;
    elements.appShell.hidden = true;
    elements.privateModal.hidden = true;
    elements.globalMessages.innerHTML = "";
    elements.usersList.innerHTML = "";
    elements.onlineCount.textContent = "0";
  }

  async function handleLogout() {
    elements.logoutBtn.disabled = true;
    try {
      await stopApp(true);
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      showAuthScreen();
      showToast("Du er logget ud.", "success");
    } catch (error) {
      showToast(formatSupabaseError(error), "error");
    } finally {
      elements.logoutBtn.disabled = false;
    }
  }

  async function refreshAll() {
    if (!currentUser) return;
    await Promise.all([loadGlobalMessages(), loadUsers()]);
    if (!elements.privateModal.hidden && selectedPrivateUser) {
      await loadPrivateMessages();
    }
  }

  async function setPresence(isOnline) {
    if (!sb || !currentUser) return;

    const { error } = await sb
      .from("profiles")
      .update({
        is_online: isOnline,
        last_seen: new Date().toISOString()
      })
      .eq("id", currentUser.id);

    if (error) throw error;
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      try {
        await setPresence(true);
        await loadUsers();
      } catch (error) {
        console.warn("Heartbeat fejl:", error);
      }
    }, HEARTBEAT_MS);
  }

  async function loadGlobalMessages() {
    setEmptyState(elements.globalMessages, "Indlæser beskeder...");

    const { data, error } = await sb
      .from("global_messages")
      .select("id, user_id, username, content, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    if (error) {
      setEmptyState(elements.globalMessages, formatSupabaseError(error));
      return;
    }

    const messages = [...(data || [])].reverse();
    elements.globalMessages.innerHTML = "";

    if (messages.length === 0) {
      setEmptyState(elements.globalMessages, "Ingen beskeder endnu. Skriv den første besked.");
      return;
    }

    for (const message of messages) {
      elements.globalMessages.appendChild(createMessageElement(message, "global"));
    }

    scrollToBottom(elements.globalMessages);
  }

  async function sendGlobalMessage(event) {
    event.preventDefault();

    const content = elements.globalInput.value.trim();
    if (!content) {
      showToast("Skriv en besked først", "info");
      return;
    }
    
    if (!currentUser || !currentProfile) {
      showToast("❌ Du er ikke logget ind", "error");
      return;
    }

    elements.globalInput.disabled = true;
    elements.sendGlobalBtn.disabled = true;
    const originalText = elements.sendGlobalBtn.textContent;
    elements.sendGlobalBtn.textContent = "Sender...";

    try {
      const { error } = await sb.from("global_messages").insert({
        user_id: currentUser.id,
        username: currentProfile.username,
        content
      });

      if (error) throw error;
      elements.globalInput.value = "";
      showToast("✓ Besked sendt", "success");
      await loadGlobalMessages();
    } catch (error) {
      showToast(formatSupabaseError(error), "error");
    } finally {
      elements.globalInput.disabled = false;
      elements.sendGlobalBtn.disabled = false;
      elements.sendGlobalBtn.textContent = originalText;
      elements.globalInput.focus();
    }
  }

  function subscribeGlobalMessages() {
    if (globalChannel) sb.removeChannel(globalChannel).catch(() => {});

    globalChannel = sb
      .channel("socialhub-global-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "global_messages" },
        () => loadGlobalMessages()
      )
      .subscribe();
  }

  async function loadUsers() {
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, is_online, last_seen")
      .order("username", { ascending: true });

    if (error) {
      elements.usersList.innerHTML = `<div class="empty-state">${escapeHtml(formatSupabaseError(error))}</div>`;
      return;
    }

    const users = (data || []).filter((user) => user.id !== currentUser.id);
    const onlineUsers = (data || []).filter(isUserOnline);
    elements.onlineCount.textContent = String(onlineUsers.length);
    elements.usersList.innerHTML = "";

    if (users.length === 0) {
      elements.usersList.innerHTML = "<div class=\"empty-state\">Der er ikke andre brugere endnu.</div>";
      return;
    }

    for (const user of users) {
      const userButton = document.createElement("button");
      userButton.type = "button";
      userButton.className = "user-row";
      userButton.addEventListener("click", () => openPrivateChat(user));

      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.textContent = getInitials(user.username);

      const info = document.createElement("span");
      info.className = "user-row-info";

      const name = document.createElement("strong");
      name.textContent = `@${user.username}`;

      const status = document.createElement("small");
      const online = isUserOnline(user);
      status.className = online ? "online" : "offline";
      status.textContent = online ? "Online nu" : "Offline";

      info.append(name, status);
      userButton.append(avatar, info);
      elements.usersList.appendChild(userButton);
    }
  }

  function subscribeProfiles() {
    if (profilesChannel) sb.removeChannel(profilesChannel).catch(() => {});

    profilesChannel = sb
      .channel("socialhub-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => loadUsers()
      )
      .subscribe();
  }

  function openPrivateChat(user) {
    selectedPrivateUser = user;
    elements.privateTitle.textContent = `Privat chat med @${user.username}`;
    elements.privateSubtitle.textContent = isUserOnline(user) ? "Brugeren er online" : "Brugeren er offline, men beskeden bliver gemt.";
    elements.privateModal.hidden = false;
    elements.privateInput.value = "";
    elements.privateInput.focus();
    subscribePrivateMessages();
    loadPrivateMessages();
  }

  function closePrivateChat() {
    elements.privateModal.hidden = true;
    elements.privateMessages.innerHTML = "";
    selectedPrivateUser = null;

    if (privateChannel) {
      sb.removeChannel(privateChannel).catch(() => {});
      privateChannel = null;
    }
  }

  async function loadPrivateMessages() {
    if (!selectedPrivateUser || !currentUser) return;

    setEmptyState(elements.privateMessages, "Indlæser privat chat...");

    const ownId = currentUser.id;
    const otherId = selectedPrivateUser.id;

    const { data, error } = await sb
      .from("private_messages")
      .select("id, sender_id, receiver_id, sender_username, receiver_username, content, created_at")
      .or(`and(sender_id.eq.${ownId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${ownId})`)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES);

    if (error) {
      setEmptyState(elements.privateMessages, formatSupabaseError(error));
      return;
    }

    elements.privateMessages.innerHTML = "";

    if (!data || data.length === 0) {
      setEmptyState(elements.privateMessages, "Ingen private beskeder endnu.");
      return;
    }

    for (const message of data) {
      elements.privateMessages.appendChild(createMessageElement(message, "private"));
    }

    scrollToBottom(elements.privateMessages);
  }

  async function sendPrivateMessage(event) {
    event.preventDefault();

    if (!selectedPrivateUser || !currentUser || !currentProfile) {
      showToast("❌ Vælg en bruger først", "error");
      return;
    }

    const content = elements.privateInput.value.trim();
    if (!content) {
      showToast("Skriv en besked først", "info");
      return;
    }

    elements.privateInput.disabled = true;
    elements.sendPrivateBtn.disabled = true;
    const originalText = elements.sendPrivateBtn.textContent;
    elements.sendPrivateBtn.textContent = "Sender...";

    try {
      const { error } = await sb.from("private_messages").insert({
        sender_id: currentUser.id,
        receiver_id: selectedPrivateUser.id,
        sender_username: currentProfile.username,
        receiver_username: selectedPrivateUser.username,
        content
      });

      if (error) throw error;
      elements.privateInput.value = "";
      showToast("✓ Privat besked sendt", "success");
      await loadPrivateMessages();
    } catch (error) {
      showToast(formatSupabaseError(error), "error");
    } finally {
      elements.privateInput.disabled = false;
      elements.sendPrivateBtn.disabled = false;
      elements.sendPrivateBtn.textContent = originalText;
      elements.privateInput.focus();
    }
  }

  function subscribePrivateMessages() {
    if (privateChannel) sb.removeChannel(privateChannel).catch(() => {});

    privateChannel = sb
      .channel(`socialhub-private-${currentUser.id}-${selectedPrivateUser.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "private_messages" },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || !selectedPrivateUser) return;

          const isCurrentConversation =
            (row.sender_id === currentUser.id && row.receiver_id === selectedPrivateUser.id) ||
            (row.sender_id === selectedPrivateUser.id && row.receiver_id === currentUser.id);

          if (isCurrentConversation) {
            // Hvis beskeden er sendt af andre brugere til mig, vis toast
            if (payload.eventType === "INSERT" && row.receiver_id === currentUser.id && row.sender_id === selectedPrivateUser.id) {
              showToast(`💬 Ny besked fra @${row.sender_username}`, "info");
            }
            loadPrivateMessages();
          }
        }
      )
      .subscribe();
  }

  function createMessageElement(message, type) {
    const isPrivate = type === "private";
    const authorId = isPrivate ? message.sender_id : message.user_id;
    const authorName = isPrivate ? message.sender_username : message.username;
    const isOwn = authorId === currentUser.id;

    const wrapper = document.createElement("article");
    wrapper.className = `message ${isOwn ? "own" : "other"}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const author = document.createElement("strong");
    author.textContent = isOwn ? "Dig" : `@${authorName || "bruger"}`;

    const time = document.createElement("time");
    time.dateTime = message.created_at;
    time.textContent = formatTime(message.created_at);

    meta.append(author, time);

    const content = document.createElement("p");
    content.textContent = message.content;

    wrapper.append(meta, content);

    if (isOwn) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-message";
      deleteButton.textContent = "Slet";
      deleteButton.addEventListener("click", () => {
        if (isPrivate) deletePrivateMessage(message.id);
        else deleteGlobalMessage(message.id);
      });
      wrapper.appendChild(deleteButton);
    }

    return wrapper;
  }

  async function deleteGlobalMessage(messageId) {
    if (!confirm("Vil du slette beskeden?")) return;

    const { error } = await sb.from("global_messages").delete().eq("id", messageId).eq("user_id", currentUser.id);
    if (error) {
      showToast(formatSupabaseError(error), "error");
      return;
    }

    await loadGlobalMessages();
  }

  async function deletePrivateMessage(messageId) {
    if (!confirm("Vil du slette den private besked?")) return;

    const { error } = await sb.from("private_messages").delete().eq("id", messageId).eq("sender_id", currentUser.id);
    if (error) {
      showToast(formatSupabaseError(error), "error");
      return;
    }

    await loadPrivateMessages();
  }

  function isUserOnline(user) {
    if (!user?.is_online || !user.last_seen) return false;
    return Date.now() - new Date(user.last_seen).getTime() < ONLINE_WINDOW_MS;
  }

  function normalizeUsername(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_æøåÆØÅ-]/g, "")
      .slice(0, 24);

    return normalized.length >= 2 ? normalized : "";
  }

  function getInitials(username) {
    return String(username || "?").slice(0, 2).toUpperCase();
  }

  function formatTime(value) {
    try {
      return new Intl.DateTimeFormat("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit"
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function formatSupabaseError(error) {
    const message = String(error?.message || error || "Ukendt fejl");

    // DATABASE FEJL
    if (message.includes("relation") && message.includes("does not exist")) {
      return "❌ Databasen mangler tabeller. Du skal køre supabase-setup.sql i Supabase SQL Editor først.";
    }

    // API/CONFIG FEJL
    if (message.includes("Invalid API key") || message.includes("No API key")) {
      return "❌ Supabase API-nøglen i config.js er forkert eller mangler. Kopiér en ny fra Supabase → Project Settings → API.";
    }

    if (message.includes("Failed to fetch") || message.includes("ERR_INVALID_URL")) {
      return "❌ Kan ikke forbinde til Supabase. Tjek at SUPABASE_URL i config.js er korrekt og starter med 'https://'";
    }

    // JWT/TOKEN FEJL
    if (message.includes("JWT") || message.includes("invalid claim")) {
      return "❌ Dit login-token eller API key er udløbet. Prøv at logge ud og ind igen, eller kopiér en ny anon public key fra Supabase.";
    }

    if (message.includes("invalid_grant")) {
      return "❌ Forkert email eller adgangskode. Husk stort/småbogstaver tæller med.";
    }

    // EMAIL BEKRÆFTELSE
    if (message.includes("Email not confirmed")) {
      return "❌ Du skal bekræfte din email først. Tjek din mail, eller slå email-bekræftelse fra i Supabase → Authentication → Email.";
    }

    // LOGIN FEJL
    if (message.includes("Invalid login credentials")) {
      return "❌ Forkert email eller adgangskode. Prøv igen, og husk at stavekontrol tæller.";
    }

    if (message.includes("User not found")) {
      return "❌ Denne email eksisterer ikke. Opret en ny konto eller prøv en anden email.";
    }

    if (message.includes("password")) {
      return "❌ Dit password skal være mindst 6 tegn langt.";
    }

    // DUPLIKATER
    if (message.includes("duplicate") || message.includes("unique")) {
      if (message.includes("username")) {
        return "❌ Dette brugernavn er allerede taget. Vælg et andet.";
      }
      if (message.includes("email")) {
        return "❌ Denne email er allerede tilmeldt. Log ind eller brug en anden email.";
      }
      return "❌ Denne værdi eksisterer allerede. Prøv en anden.";
    }

    // RLS/SIKKERHED
    if (message.includes("row-level security") || message.includes("permission denied")) {
      return "❌ Du har ikke adgang til dette. Tjek at du er logget ind som den rigtige bruger, eller at supabase-setup.sql blev kørt korrekt.";
    }

    if (message.includes("policy")) {
      return "❌ Dit forsøg blev blokeret af sikkerhedspolitikker. Dette kan være en database-opsætnings-fejl. Kontakt en admin.";
    }

    // NETVÆRK FEJL
    if (message.includes("timeout")) {
      return "⏱️ Anmodningen tog for lang tid. Tjek din internetforbindelse og prøv igen.";
    }

    if (message.includes("net::") || message.includes("ERR_FAILED")) {
      return "🌐 Netværksfejl. Tjek at du er online og at Supabase server er oppe.";
    }

    if (message.includes("404") || message.includes("not found")) {
      return "❌ Server finder ikke hvad du leder efter. Dette kan være en config-fejl.";
    }

    // REALTIME/SUBSCRIPTION
    if (message.includes("subscription") || message.includes("channel")) {
      return "⚠️ Realtime-forbindelse fejlede. Beskederne opdateres måske ikke live. Prøv at refresh siden.";
    }

    // DEFAULT
    if (message.includes("Error") || message.length > 100) {
      return `⚠️ Uventet fejl: ${message.slice(0, 80)}... Tjek browser console (F12) for mere info.`;
    }

    return `❌ Fejl: ${message}`;
  }

  function showAuthMessage(message, type = "") {
    elements.authMessage.textContent = message;
    elements.authMessage.className = `auth-message ${type}`.trim();
  }

  function showToast(message, type = "info") {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => {
      elements.toast.className = "toast";
    }, 3500);
  }

  function setButtonLoading(button, loading, label = "") {
    if (loading) {
      button.textContent = label || "Vent...";
      button.disabled = true;
      return;
    }

    button.textContent = authMode === "signup" ? "Opret konto" : "Log ind";
    button.disabled = false;
  }

  function setEmptyState(container, text) {
    container.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = text;
    container.appendChild(empty);
  }

  function scrollToBottom(container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text || "");
    return div.innerHTML;
  }
})();
