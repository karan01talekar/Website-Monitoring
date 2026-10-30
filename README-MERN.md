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

Configure `MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, and optionally `MAIL_FROM_NAME` in the backend's hosting environment (the local `.env` file is not automatically deployed). For Gmail, use `smtp.gmail.com`, port `465`, your Gmail address, and a Google App Password. Alerts are retried during monitor checks until the SMTP server accepts them; after one is accepted, no further alert is sent until the site recovers and goes down again.
