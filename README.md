# SMS One-Way Sync

Lightweight one-way SMS synchronization:

- Android 10+ Kotlin client listens for incoming SMS messages.
- The client asynchronously posts `{ sender, body }` to `POST /api/sms`.
- Node.js, Express, EJS, and MySQL store and display the synced SMS feed.

## Project Layout

```text
.
+-- android/   # Android Kotlin client
`-- backend/   # Node.js + Express + EJS + MySQL server
```

Backend layout:

```text
backend/
+-- public/css/styles.css
+-- schema.sql
+-- src/
|   +-- app.js
|   +-- server.js
|   +-- config/db.js
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

2. Create the database and table:

   ```bash
   mysql -u root -p < schema.sql
   ```

3. Create a MySQL user if needed:

   ```sql
   CREATE USER 'sms_sync_user'@'localhost' IDENTIFIED BY 'change_me';
   GRANT SELECT, INSERT ON sms_sync.* TO 'sms_sync_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

4. Copy the environment example and adjust credentials:

   ```bash
   cp .env.example .env
   ```

5. Start the server:

   ```bash
   npm start
   ```

6. Open the feed:

   ```text
   http://localhost:3000
   ```

## API

### `POST /api/sms`

Request:

```json
{
  "sender": "+15551234567",
  "body": "Hello from Android"
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
buildConfigField "String", "SMS_API_URL", "\"http://10.0.2.2:3000/api/sms\""
```

Use:

- `http://10.0.2.2:3000/api/sms` for the Android emulator.
- `http://YOUR_COMPUTER_LAN_IP:3000/api/sms` for a physical device on the same network.
- HTTPS for production deployments.

The app declares:

- `android.permission.INTERNET`, a normal manifest permission.
- `android.permission.RECEIVE_SMS`, requested at runtime from `MainActivity`.

For local HTTP development the manifest enables cleartext traffic. For production, serve the backend over HTTPS and remove cleartext access.

## Test SMS In The Emulator

With the emulator running:

```bash
adb emu sms send +15551234567 "Hello from the emulator"
```

The message should be forwarded to the backend and appear at `GET /`.
