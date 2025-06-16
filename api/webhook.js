import docusign from 'docusign-esign';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const config = {
  api: {
    bodyParser: false // Required to access raw body for webhooks
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  // Try to parse JSON
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Invalid JSON in webhook payload');
    return res.status(400).send('Invalid JSON');
  }

  // Extract data
  const envelopeId = payload?.data?.envelopeId;
  const status = payload?.data?.envelopeSummary?.status?.toLowerCase();

  if (!envelopeId || status !== 'completed') {
    console.warn('Webhook ignored: missing envelopeId or not completed');
    return res.status(200).send('Ignored');
  }

  try {
    // Authenticate with DocuSign
    const apiClient = new docusign.ApiClient();
    //apiClient.setBasePath('https://demo.docusign.net/restapi'); // or production endpoint
    apiClient.setBasePath('https://www.docusign.net/restapi'); // ✅ Production
    const jwt = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_CLIENT_ID,
      process.env.DOCUSIGN_USER_ID,
      'signature',
      process.env.DOCUSIGN_PRIVATE_KEY,
      3600
    );

    const accessToken = jwt.body.access_token;
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    const userInfo = await apiClient.getUserInfo(accessToken);
    const accountId = userInfo.accounts[0].accountId;
    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Get email from custom field
    const envelopeDetails = await envelopesApi.getEnvelope(accountId, envelopeId);
    const userEmail = envelopeDetails?.customFields?.textCustomFields?.find(
      f => f.name === 'userEmail'
    )?.value;

    if (!userEmail) {
      console.error('User email not found in custom fields');
      return res.status(200).send('Missing user email');
    }

    // Get the signed document
    const pdfBuffer = await envelopesApi.getDocument(accountId, envelopeId, 'combined', null);

    // Send email
    await sgMail.send({
      to: userEmail,
      from: 'info@mail.leadingpeers.com', // must be authenticated in SendGrid
      subject: 'Your Signed Membership Agreement',
      text: 'Hi, attached is your signed document. Please keep it for your records.',
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: 'SignedMembershipAgreement.pdf',
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    });

    console.log(`✅ Sent signed document to ${userEmail}`);
    return res.status(200).send('Email sent');
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).send('Webhook error');
  }
}
