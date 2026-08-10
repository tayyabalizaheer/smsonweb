# SMS One-Way Sync

Lightweight one-way SMS synchronization:

- Android 10+ Kotlin client reads old Inbox/Sent SMS messages and listens for new incoming SMS events.
- The client uses WorkManager to sync in the background when network is available, including while the screen is off.
- The client posts batches to `POST /api/sms/bulk` and keeps `POST /api/sms` compatible for single-message posts.
- Node.js, Express, EJS, Prisma ORM, and MySQL store and display a messenger-style SMS view.
- The web dashboard is responsive and installable as a Progressive Web App.
- The web dashboard requires pairing with the Android app by 6 digit code and a web-generated three-number verification challenge.
- Android sends a device health ping every 30 seconds; the web marks it offline after 2 minutes without a ping.

## Project Layout

```text
.
+-- android/   # Android Kotlin client
`-- backend/   # Node.js + Express + EJS + Prisma + MySQL server
```

Backend layout:

```text
backend/
+-- prisma/
|   +-- schema.prisma
|   `-- migrations/
+-- public/css/styles.css
+-- src/
|   +-- app.js
|   +-- server.js
|   +-- config/prisma.js
|   +-- controllers/smsController.js
|   +-- models/messageModel.js
|   `-- routes/
|       +-- api.js
|       `-- web.js
`-- views/
```

## Backend Setup

Run these commands from `backend/`.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the MySQL database:

   ```sql
   CREATE DATABASE sms_sync CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. Create a MySQL user if needed:

   ```sql
   CREATE USER 'sms_sync_user'@'localhost' IDENTIFIED BY 'change_me';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON sms_sync.* TO 'sms_sync_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

4. Copy the environment example and adjust credentials:

   ```bash
   cp .env.example .env
   ```

5. Generate the Prisma client and create the table in development:

   ```bash
   npm run prisma:migrate -- --name init
   ```

   For production deployments, apply the committed migrations:

   ```bash
   npm run prisma:deploy
   ```

   After pulling updates on the production server, run:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

6. Start the server:

   ```bash
   npm start
   ```

7. Open the feed:

   ```text
   http://localhost:3000
   ```

## Web App Installation

The backend serves PWA assets from `public/`:

- `/manifest.webmanifest`
- `/sw.js`
- PNG app icons for Android/Desktop install prompts
- Apple touch icon for iOS home-screen install

Production PWA installation requires HTTPS. On `https://sms.engrtayyabali.com/`, open the site in Chrome, Edge, or a mobile browser and use the browser's install/add-to-home-screen option.

## Pairing Flow

1. Open the Android app once. It creates a permanent 6 digit pairing code.
2. Open the web app. If the browser is not paired, it redirects to `/pair`.
3. Enter the 6 digit Android code.
4. The backend generates three random verification numbers and shows them on the web.
5. Tap "Fetch Latest Pairing Number" in the Android app.
6. The Android app shows only the correct verification number.
7. Choose that number on the web.
8. The backend saves a browser session in one of four device session columns: `session_id_1` through `session_id_4`.

Each Android device can have up to four paired web sessions at the same time. Use "Unpair this browser" in the web app to free one session slot.

## Device Health

The Android app starts a foreground health service with a persistent notification. It calls:

```text
POST /api/devices/health
```

every 30 seconds. The web dashboard calls:

```text
GET /api/device/status
```

and shows the paired device as offline if `last_ping_at` is older than 2 minutes.

## API

### `POST /api/sms`

Request:

```json
{
  "address": "+15551234567",
  "direction": "received",
  "body": "Hello from Android",
  "messageAt": 1786372200000,
  "deviceMessageId": "android-sms:42",
  "contactName": "Jane Contact",
  "contactEmail": "jane@example.com"
}
```

Legacy `{ "sender": "...", "body": "..." }` payloads are still accepted.

### `POST /api/sms/bulk`

Request:

```json
{
  "messages": [
    {
      "address": "+15551234567",
      "direction": "received",
      "body": "Hello from Android",
      "messageAt": 1786372200000,
      "deviceMessageId": "android-sms:42",
      "contactName": "Jane Contact",
      "contactEmail": "jane@example.com"
    },
    {
      "address": "+15557654321",
      "direction": "sent",
      "body": "Reply from this phone",
      "messageAt": 1786372500000,
      "deviceMessageId": "android-sms:43"
    }
  ]
}
```

Responses:

- `201` when stored successfully.
- `400` when `sender` or `body` is missing or invalid.
- `500` when the database insert fails.

## Android Client Setup

Open `android/` in Android Studio.

The default API endpoint is configured in [android/app/build.gradle](android/app/build.gradle):

```gradle
buildConfigField "String", "SMS_API_URL", "\"https://sms.engrtayyabali.com/api/sms\""
```

Use:

- `https://sms.engrtayyabali.com/api/sms` for production.
- `http://10.0.2.2:3000/api/sms` for local backend testing with the Android emulator.
- `http://YOUR_COMPUTER_LAN_IP:3000/api/sms` for a physical device on the same network.
- HTTPS for production deployments.

The app declares:

- `android.permission.INTERNET`, a normal manifest permission.
- `android.permission.RECEIVE_SMS`, requested at runtime from `MainActivity`.
- `android.permission.READ_SMS`, requested at runtime so old Inbox/Sent SMS can be synced.
- `android.permission.READ_CONTACTS`, requested at runtime so contact names/emails can be displayed when available.
- `android.permission.RECEIVE_BOOT_COMPLETED`, so periodic background sync is scheduled after reboot.

For local HTTP development the manifest enables cleartext traffic. For production, serve the backend over HTTPS and remove cleartext access.

The app schedules:

- An immediate sync after SMS permissions are granted.
- A one-time sync after each incoming SMS broadcast.
- A periodic WorkManager sync every 15 minutes, which is Android's minimum periodic interval.

## Test SMS In The Emulator

With the emulator running:

```bash
adb emu sms send +15551234567 "Hello from the emulator"
```

The message should be forwarded to the backend and appear at `GET /`.
