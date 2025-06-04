// api/docusign.js

import docusign from 'docusign-esign';

// To deploy on Vercel, export a default async function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { name, email } = req.body;

  // 1. Authenticate with DocuSign API (use environment variables for secrets)
  // 2. Create envelope
  // 3. Create recipient view (embedded signing URL)
  // 4. Return the signing URL

  // -- You will need to fill this out with your DocuSign logic (can provide example if needed) --

  // Placeholder (replace this)
  const signingUrl = 'https://docusign.com/your-signing-url';
  res.status(200).json({ signingUrl });
}
