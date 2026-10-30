# Website Monitoring MERN application

This repository contains only the MERN application, split into `frontend` and `backend`.

## Local setup

Start MongoDB locally, or create a MongoDB Atlas database. Then configure and run both applications in separate terminals:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The React app calls the Express API at `http://127.0.0.1:5000/api`.

To monitor a local development website such as `http://localhost:3000`, set `ALLOW_LOCAL_TARGETS=true` in `backend/.env`. Keep it `false` on deployed environments.

## Deployment

Deploy `backend` as a Node web service and use MongoDB Atlas for `MONGO_URI`. Deploy `frontend` as a static site, setting `VITE_API_URL` to `https://your-api-domain/api`. Configure `CLIENT_ORIGIN` in the backend with the frontend's URL. The backend's built-in cron task checks active monitors every minute, so it must remain running continuously.

Configure the backend's mail variables in the hosting provider's environment settings (the local `.env` file is not automatically deployed). For Gmail, use `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=465`, `MAIL_USERNAME`, `MAIL_PASSWORD` (a Google App Password), `MAIL_ENCRYPTION=ssl`, and `MAIL_FROM_ADDRESS` matching the authenticated account. The app accepts either the `MAIL_*` names or `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS`. Alert emails are sent when a monitor first changes from up to down; an already-down monitor will not trigger another alert until it recovers and goes down again.
