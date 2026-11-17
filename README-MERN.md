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

Configure `MAIL_MAILER=brevo`, `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, and optionally `MAIL_FROM_NAME` in the backend's hosting environment (the local `.env` file is not automatically deployed). `MAIL_FROM_ADDRESS` must be a verified sender in Brevo. This sends through Brevo's HTTPS API, so it works on Render's free web service where outbound SMTP ports are blocked. An alert email is attempted on every check that reports a website as down. The default minimum check interval is one minute, so a site that remains down can generate one alert per minute.
