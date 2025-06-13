import docusign from 'docusign-esign';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const config = {
  api: {
    bodyParser: false // Required to handle DocuSign's multipart/form-data
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  // Step 1: Buffer the request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  // Step 2: Extract envelopeId from raw XML (quick/dirty, reliable for Connect payloads)
  const envelopeIdMatch = rawBody.match(/<EnvelopeID>(.+?)<\/EnvelopeID>/);
  const statusMatch = rawBody.match(/<Status>(.+?)<\/Status>/);

  if (!envelopeIdMatch || !statusMatch) {
    console.error('Missing envelopeId or status in payload');
    return res.status(400).send('Invalid payload');
  }

  const envelopeId = envelopeIdMatch[1];
  const status = statusMatch[1];

  if (status.toLowerCase() !== 'completed') {
    return res.status(200).send('Envelope not completed — skipping');
  }

  try {
    // Step 3: Authenticate with DocuSign via JWT
    const apiClient = new docusign.ApiClient();
    const basePath = process.env.DOCUSIGN_ENVIRONMENT === 'live'
      ? 'https://na4.docusign.net/restapi'
      : 'https://demo.docusign.net/restapi';

    apiClient.setBasePath(basePath);
    const results = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_CLIENT_ID,
      process.env.DOCUSIGN_USER_ID,
      'signature',
      process.env.DOCUSIGN_PRIVATE_KEY,
      3600
    );

    const accessToken = results.body.access_token;
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const userInfo = await apiClient.getUserInfo(accessToken);
    const accountId = userInfo.accounts[0].accountId;

    // Step 4: Fetch custom fields to get user email
    const envelope = await envelopesApi.getEnvelope(accountId, envelopeId);
    const userEmail = envelope?.customFields?.textCustomFields?.find(f => f.name === 'userEmail')?.value;

    if (!userEmail) {
      console.error('User email not found in custom fields');
      return res.status(400).send('Missing user email');
    }

    // Step 5: Get the signed document PDF
    const pdfBuffer = await envelopesApi.getDocument(accountId, envelopeId, 'combined', null);

    // Step 6: Send it via SendGrid
    await sgMail.send({
      to: userEmail,
      from: 'your@email.com',
      subject: 'Your Signed Document',
      text: 'Attached is your completed membership agreement.',
      attachments: [{
        content: pdfBuffer.toString('base64'),
        filename: 'MembershipAgreement.pdf',
        type: 'application/pdf',
        disposition: 'attachment'
      }]
    });

    console.log(`Sent signed doc to ${userEmail}`);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).send('Server error');
  }
}
