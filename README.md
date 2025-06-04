# DocuSign Middleware API for Wix

This project provides a serverless API endpoint (Node.js) that receives form data from a Wix website and returns a unique DocuSign embedded signing URL for the user. It’s designed to be deployed on Vercel and integrate with Wix Velo or similar setups.

## How it works

1. User submits a form on your Wix site (no signature fields).
2. Your Wix site sends a POST request to this API endpoint with the user's info.
3. The API uses the DocuSign API to:
   - Create an envelope (document for signature).
   - Generate a unique embedded signing URL for the user.
4. The API responds with the signing URL.
5. Wix redirects the user to the DocuSign session to complete the signature.

---

## Files in this repo

- `api/docusign.js` – The main serverless function. Handles POST requests, creates DocuSign envelopes, and generates signing URLs.
- `package.json` – Declares project dependencies (uses `docusign-esign`).
- `.gitignore` – Ignores `node_modules` and environment files.

---

## How to deploy

1. **Fork or clone this repo.**
2. **Push to your own GitHub account.**
3. **Import the repo into Vercel ([https://vercel.com/new](https://vercel.com/new)).**
4. **Set your DocuSign credentials as environment variables in Vercel:**
   - `DOCUSIGN_CLIENT_ID`
   - `DOCUSIGN_USER_ID`
   - `DOCUSIGN_PRIVATE_KEY`
   - (Add any others you need for your DocuSign setup)
5. **Deploy!**  
   Vercel will give you a public URL, e.g.  
   `https://your-project-name.vercel.app/api/docusign`

---

## How to use

- **Send a POST request** to `/api/docusign` with JSON body:
  ```json
  {
    "name": "User's Name",
    "email": "user@example.com"
  }

- **Response**
{
  "signingUrl": "https://docusign.com/embedded-signing-url"
}
