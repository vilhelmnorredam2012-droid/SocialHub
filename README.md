# 🚀 SocialHub

SocialHub er en real-time chat webapp med private beskeder, online brugere og admin-system.  
Projektet er lavet som et læringsprojekt med fokus på real-time funktioner, UI og backend integration.

---

## ✨ Funktioner

### 💬 Global chat
- Real-time beskeder
- Brugernavne gemmes lokalt (localStorage)
- Slet egne beskeder
- Admin kan slette alle beskeder

---

### 👥 Online brugere
- Se hvem der er online i real-time
- Automatisk opdatering via Supabase presence

---

### 💌 Private chats
- 1:1 private beskeder mellem brugere
- Real-time opdatering
- Start chat ved at klikke på en online bruger

---

### ⚙️ Admin system
- Admin unlock via kode
- Se statistik over brugere og beskeder
- Slet alle beskeder
- Slet brugeres data
- Suspend/unsuspend brugere
- Nuke funktion (sletter alt i databasen)

---

### 🔔 Notifikationer
- Toast notifications ved events
- Feedback på handlinger (sendt, slettet osv.)

---

## 🛠️ Teknologier

- HTML5
- CSS3 (custom moderne UI)
- JavaScript (vanilla)
- Supabase (real-time backend)
- LocalStorage (brugernavne + admin state)

---

## 🗄️ Database (Supabase)

Projektet bruger følgende tabel:

- `messages`
- `users`

---

## 🚀 Sådan kører du projektet

1. Clone repoet:
```bash
git clone https://github.com/DIT-NAVN/socialhub.git
